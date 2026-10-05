# RODO w praktyce zespołu — procedury i kod

## 1. Tabela retencji (przykład dla systemu rezerwacji sal)
| Dane | Cel | Podstawa (do potwierdzenia przez IOD) | Okres | Mechanizm usuwania |
|---|---|---|---|---|
| konto (imię, e-mail) | obsługa konta | umowa | do usunięcia konta + okres na reklamacje | usunięcie konta → zadanie usuwające |
| telefon | przypomnienia o rezerwacji | umowa / zgoda — decyzja | do usunięcia konta | jak wyżej |
| historia rezerwacji | rozliczenia | obowiązek prawny (księgowość) | wg przepisów podatkowych | zadanie retencji |
| zdarzenia analityczne | ulepszanie produktu | prawnie uzasadniony interes albo zgoda — decyzja | 13 miesięcy, pseudonim zamiast ID | zadanie retencji |
| logi aplikacji | bezpieczeństwo i diagnoza | prawnie uzasadniony interes | 30 dni, bez treści żądań z danymi | rotacja logów |
| kopie zapasowe | ciągłość działania | prawnie uzasadniony interes | 35 dni | wygasanie w magazynie kopii |

Okresy w tabeli to przykład do decyzji, nie zalecenie prawne.

## 2. Pseudonimizacja i zadanie retencji (Python)
Sprawdzone 2026-10-03 na CPython 3.14.8: pytest 9.1.1 (2 testy), `mypy --strict`, ruff z regułami bezpieczeństwa `S`.
```python
import hashlib
import hmac
import sqlite3
from datetime import datetime, timedelta


def pseudonym(value: str, key: bytes) -> str:
    """Stały pseudonim z kluczem HMAC — bez klucza nie da się go odwrócić słownikiem."""
    normalized = value.strip().lower().encode("utf-8")
    return hmac.new(key, normalized, hashlib.sha256).hexdigest()[:32]


def purge_expired(db: sqlite3.Connection, now: datetime, keep_days: int) -> int:
    """Zadanie retencji: usuwa rezerwacje starsze niż okres przechowywania; zwraca liczbę usuniętych."""
    cutoff = (now - timedelta(days=keep_days)).isoformat()
    cur = db.execute("DELETE FROM reservations WHERE ended_at < ?", (cutoff,))
    db.commit()
    return cur.rowcount

```
```python
import sqlite3
from datetime import UTC, datetime, timedelta

from privacy_tools import pseudonym, purge_expired

KEY = b"klucz-testowy"


def test_pseudonym_is_stable_after_normalization_and_depends_on_key() -> None:
    a = pseudonym("Jan.Kowalski@example.com ", KEY)
    assert a == pseudonym("jan.kowalski@example.com", KEY)
    assert a != pseudonym("jan.kowalski@example.com", b"inny-klucz")


def test_purge_removes_only_rows_past_retention() -> None:
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE reservations (id INTEGER PRIMARY KEY, phone TEXT, ended_at TEXT)")
    now = datetime(2026, 10, 3, tzinfo=UTC)
    db.executemany("INSERT INTO reservations (phone, ended_at) VALUES (?, ?)", [
        ("500100200", (now - timedelta(days=400)).isoformat()),
        ("500100201", (now - timedelta(days=10)).isoformat()),
    ])
    assert purge_expired(db, now, keep_days=365) == 1
    assert db.execute("SELECT phone FROM reservations").fetchall() == [("500100201",)]
```
Klucz pseudonimizacji trzymasz w menedżerze sekretów (ops-secrets-identities), osobno od danych — z kluczem
pseudonim da się powiązać z osobą, więc nadal jest to dana osobowa. Sam skrót SHA-256 z e-maila bez klucza łatwo
odwrócić słownikiem adresów.

## 3. Żądanie usunięcia danych — przebieg
1. Przyjęcie: kanał, data (od niej liczysz miesiąc), weryfikacja tożsamości.
2. Sprawdzenie wyjątków: czy przepis nie nakazuje przechowywać części danych (np. faktury) — wtedy ograniczasz
   przetwarzanie tej części, resztę usuwasz.
3. Usunięcie w systemie: konto, powiązane rekordy, pliki, indeksy wyszukiwania, cache.
4. Procesorzy: polecenie usunięcia (mailing, analityka, obsługa klienta), z potwierdzeniem.
5. Logi i kopie zapasowe: wygasają z cyklem; identyfikator trafia na listę usuniętych, którą stosujesz po każdym
   odtworzeniu kopii.
6. Odpowiedź dla osoby i zapis w rejestrze żądań (data, zakres, wynik).
Test automatyczny: po usunięciu konta zapytania do wszystkich tabel z danymi tej osoby zwracają pustkę.

## 4. Naruszenie ochrony danych — oś czasu
| Czas od stwierdzenia | Działanie | Kto |
|---|---|---|
| natychmiast | zatrzymanie wycieku (zamknięcie dostępu, rotacja kluczy), zabezpieczenie dowodów | zespół + ops-security-operations |
| do kilku godzin | ustalenie: jakie dane, ilu osób, od kiedy, kto miał dostęp, czy dane zaszyfrowane | zespół, agent zbiera fakty |
| przed upływem 72 h | ocena ryzyka i decyzja o zgłoszeniu do UODO; zgłoszenie (można uzupełniać informacje etapami) | administrator z IOD |
| bez zbędnej zwłoki | zawiadomienie osób, jeśli ryzyko wysokie: co się stało, skutki, co robimy, co mogą zrobić | administrator |
| zawsze | wpis w wewnętrznym rejestrze naruszeń, także niezgłoszonych; poprawka procesu i lekcja | zespół |

Procesor (np. firma utrzymująca system) zawiadamia administratora bez zbędnej zwłoki — termin 72 godzin biegnie
u administratora.

## 5. Kiedy rozważyć DPIA — pytania kontrolne
- Czy system ocenia lub profiluje ludzi w sposób, który ma dla nich istotne skutki (kredyt, praca, dostęp do usług)?
- Czy przetwarza szczególne kategorie danych albo dane o wyrokach na dużą skalę?
- Czy monitoruje ludzi systematycznie (lokalizacja, zachowanie, miejsca publiczne)?
- Czy używa danych biometrycznych, łączy zbiory z różnych źródeł, stosuje nową technologię (np. model AI podejmujący
  decyzje)?
- Czy dotyczy osób szczególnie wrażliwych (dzieci, pacjenci, pracownicy)?
Dwa „tak” to mocny sygnał, by zapytać IOD o DPIA; wykaz UODO (M.P. 2019 poz. 666) rozstrzyga przypadki z listy.
