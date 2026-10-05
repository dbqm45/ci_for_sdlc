# Przykłady — outbox, inbox, gwarancje

> **Spis treści:** 1. Zamówienia → fakturowanie: zdarzenie przez outbox · 2. Kiedy nie rozpraszać: sprawdzenie dostępności · 3. Idempotentny odbiorca z inboxem i testem duplikatu

## 1. Zamówienia → fakturowanie: zdarzenie przez outbox
**Sytuacja.** „Moduł zamówień po złożeniu zamówienia woła synchronicznie `fakturowanie.wystawFakture(zamowienie)`.
Gdy fakturowanie leży, nie da się złożyć zamówienia. Zróbmy to asynchronicznie.”

**Jak.**
1. **Kryteria wykluczające** (sekcja 1): zamówienia nie używają wyniku (numeru faktury) w tej samej jednostce pracy;
   ekran potwierdzenia nie pokazuje faktury → można rozproszyć.
2. **Komenda czy zdarzenie**: komenda `WystawFakture` zachowuje dotychczasowe sprzężenie; zdarzenie `ZamowienieZlozone`
   pasuje do granicy kontekstu i przyjmie kolejnych odbiorców (np. magazyn). Wybór: zdarzenie. Przestaje działać test
   „złożenie zamówienia tworzy fakturę” — przenoszę go do testu konsumenta.
3. **Atomowość**: zamówienie i outbox w tej samej bazie i tej samej transakcji → atomowe.
4. **Decyzje outboxa**: id wiadomości nadawane przy zapisie w transakcji, nie przez relay; relay = poller co 1 s;
   ujście = szyna w procesie (zmiana na broker to jedyna zmiana przy rozdzieleniu procesów).
5. **Kolejność**: fakturowanie jej nie wymaga → bez klucza kolejności; dostarczenie co najmniej raz → odbiorca idempotentny (przykład 3).

**Wynik** — zapis stanu i wiadomości w jednej transakcji (Python, `sqlite3` jako zasób transakcyjny producenta):
```python
import json
import sqlite3
import uuid
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS zamowienia (id TEXT PRIMARY KEY, klient TEXT NOT NULL, kwota_gr INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (
    id_wiadomosci TEXT PRIMARY KEY,
    typ TEXT NOT NULL,
    ladunek TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'oczekuje',
    utworzono TEXT NOT NULL
);
"""


def zloz_zamowienie(db: sqlite3.Connection, klient: str, kwota_gr: int) -> str:
    id_zamowienia = str(uuid.uuid4())
    with db:  # jedna transakcja: stan + rekord outboxa albo nic
        db.execute("INSERT INTO zamowienia VALUES (?, ?, ?)", (id_zamowienia, klient, kwota_gr))
        db.execute(
            "INSERT INTO outbox (id_wiadomosci, typ, ladunek, utworzono) VALUES (?, ?, ?, ?)",
            (
                str(uuid.uuid4()),  # id nadane tutaj, nie w relayu
                "ZamowienieZlozone",
                json.dumps({"idZamowienia": id_zamowienia, "klient": klient, "kwotaGr": kwota_gr}),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    return id_zamowienia


if __name__ == "__main__":
    polaczenie = sqlite3.connect(":memory:")
    polaczenie.executescript(SCHEMA)
    zloz_zamowienie(polaczenie, "K-17", 129_900)
    print(polaczenie.execute("SELECT typ, status FROM outbox").fetchall())  # [('ZamowienieZlozone', 'oczekuje')]
```
Raport zmiany: można rozproszyć (kryteria 1–2) · zdarzenie `ZamowienieZlozone` · atomowe · outbox w bazie zamówień,
poller 1 s · kolejność niegwarantowana, niepotrzebna · sprzężenie logiczne zostaje: fakturowanie zależy od pól `kwotaGr` i `klient`.

## 2. Kiedy nie rozpraszać: sprawdzenie dostępności
**Sytuacja.** „Rezerwacja pokoju woła `dostepnosc.zablokuj(pokoj, termin)` i dopiero po `true` potwierdza rezerwację.
Zamieńmy to na zdarzenie, będzie luźniej.”

**Jak.**
1. Kryterium pierwsze: wywołujący **rozgałęzia się na wyniku** (`true` → potwierdzenie, `false` → odmowa).
2. Konwersja zmieniłaby poprawność: rezerwacja potwierdzona, zanim wiadomo, czy pokój jest wolny.
3. **Stop** — zostaje synchronicznie albo przeprojektowanie przepływu (rezerwacja w stanie „oczekuje”), co jest decyzją biznesową.

**Wynik** (raport kroku):

| Pytanie | Odpowiedź |
|---|---|
| wywołujący korzysta z wyniku? | tak — `if zablokowano:` decyduje o potwierdzeniu |
| werdykt | **nie rozpraszać** w obecnym kształcie |
| opcja A | zostaje synchronicznie (rekomendacja) |
| opcja B | rezerwacja „oczekuje” + zdarzenie `PokojZablokowany` / `BlokadaOdrzucona`; klient widzi potwierdzenie z opóźnieniem — decyzja właściciela produktu |
| uwaga | asynchroniczność usunęłaby sprzężenie czasowe, logiczne zostaje w obu opcjach |

## 3. Idempotentny odbiorca z inboxem i testem duplikatu
**Sytuacja.** „Relay czasem wysyła `ZamowienieZlozone` dwa razy i klient dostaje dwie faktury. Napraw odbiorcę.”

**Jak.**
1. Dostarczenie co najmniej raz to założenie, nie błąd relaya → idempotencja odbiorcy.
2. Rekord inboxa zapisany **w tej samej transakcji co efekt** (faktura).
3. Deduplikacja przez **atomowe zajęcie** id (`INSERT … ON CONFLICT DO NOTHING`), nie „sprawdź, potem zapisz”.
4. Najpierw czerwony test: to samo id dostarczone dwa razy → dokładnie jedna faktura.

**Wynik** (Python, `sqlite3`):
```python
import json
import sqlite3

SCHEMA = """
CREATE TABLE inbox (id_wiadomosci TEXT PRIMARY KEY);
CREATE TABLE faktury (id_zamowienia TEXT NOT NULL, kwota_gr INTEGER NOT NULL);
"""


def obsluz_zamowienie_zlozone(db: sqlite3.Connection, id_wiadomosci: str, ladunek: str) -> None:
    with db:  # inbox i efekt w jednej jednostce pracy
        zajete = db.execute(
            "INSERT INTO inbox (id_wiadomosci) VALUES (?) ON CONFLICT DO NOTHING", (id_wiadomosci,)
        ).rowcount
        if zajete == 0:
            return  # duplikat — efekt już jest
        dane = json.loads(ladunek)
        db.execute("INSERT INTO faktury VALUES (?, ?)", (dane["idZamowienia"], dane["kwotaGr"]))


def test_to_samo_id_dwa_razy_daje_jedna_fakture() -> None:
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    ladunek = json.dumps({"idZamowienia": "Z-1", "kwotaGr": 129_900})
    obsluz_zamowienie_zlozone(db, "msg-0001", ladunek)
    obsluz_zamowienie_zlozone(db, "msg-0001", ladunek)
    assert db.execute("SELECT COUNT(*) FROM faktury").fetchone()[0] == 1


if __name__ == "__main__":
    test_to_samo_id_dwa_razy_daje_jedna_fakture()
    print("ok")
```
Do kompletu z sekcji 6: test kontraktu formatu (migawka ładunku tym samym serializerem, stałe id i czasy) i test
integracyjny na prawdziwej bazie z tym samym przypadkiem duplikatu.
