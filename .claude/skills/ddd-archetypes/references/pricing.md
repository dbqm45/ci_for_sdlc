# Archetyp Pricing — mapper (kalkulatory, cenniki, ważność, cena zamrożona)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których **cena lub kwota wynika z reguł** (klient, ilość, termin, umowa, promocja, koszt pieniądza
w czasie), na model nazwanych kalkulatorów. Cena rzadko jest polem produktu; rozsiana po `if`-ach w serwisach sprawia, że każda
promocja to zmiana kodu i ryzyko regresji, a biznes nie wie, jak ją policzono. Efekt: nowa stawka = dane, nowy sposób liczenia =
nowy typ, każdą cenę da się **wyjaśnić i odtworzyć**. Protokół wspólny: `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy kwota powstaje z obliczenia na parametrach (stawki, progi, czas), które biznes chce zmieniać
bez programisty?* Tak → pasuje. Kwota jest tylko przepisywana z dokumentu lub sumowana z historii → nie Pricing.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| cennik, stawka, taryfa, rabat, promocja, „od 10 szt. taniej” | ✅ |
| odsetki, opłata za dzień/miesiąc, prowizja %, kara umowna | ✅ |
| „cena zależy od klienta / umowy / sezonu / kanału” | ✅ |
| „pokaż klientowi, jak policzono cenę” | ✅ |
| „ile punktów ma klient?”, saldo, rozrachunki | ❌ → Accounting |
| „jaki wariant / które opcje wolno wybrać razem?” | ❌ → Configurator (cena opcji → Pricing obok) |
| „kwota w walucie, zaokrąglenia, podział na raty” sam w sobie | ❌ → Quantity/Money |
| „cena = pole produktu, zmieniana ręcznie raz na rok” | ⚠️ graniczny |

**Przypadki graniczne:**
- *Cena jako atrybut katalogu* — czy istnieje **jakakolwiek reguła** (ilość, klient, okres)? Nie → atrybut Product z historią;
  tak → Pricing.
- *Prowizja/podatek jako skutek zdarzenia* — kwotę liczy Pricing (kalkulator), a zaksięgowanie to reguła księgowania Accounting.
- *Wycena konfiguracji* — dopuszczalność opcji to Configurator; cena wybranych opcji to kalkulatory Pricing.

## Model (istota)
| Element | Istota |
|---|---|
| **Typ kalkulatora** | sposób liczenia; deklaruje parametry **przy tworzeniu** (kwota, stopa roczna) i **przy wyliczeniu** (podstawa, liczba dni, jednostka czasu). Brak parametru = czytelny błąd, nie cicha zła cena |
| **Kalkulator (instancja)** | nazwa + typ + wartości parametrów + czytelny **opis** („stała kwota 20 PLN”, „6% w skali roku naliczane za dzień/tydzień/miesiąc/rok”). Zwraca **Money** |
| **Rejestr kalkulatorów** | biznes/konfiguracja tworzy nazwane instancje („odsetki-6”, „opłata-stała-20”); wycena = wybór po nazwie + parametry |
| **Kompozycja** | kalkulator złożony z innych — tabela niżej |
| **Cennik** | zbiór kalkulatorów z **okresem ważności** (`ważny_od`, `ważny_do`) i **wersją**; zmiana = nowa wersja, stara zostaje do odtwarzania |
| **Wycena (wynik)** | Money + **rozbicie** (który kalkulator, jakie parametry, jaka wersja cennika) — wyjaśnialność i audyt |
| **Cena ofertowa** | wycena **zamrożona** na ofercie/zamówieniu: kopia kwoty + odwołanie do wersji; późniejsza zmiana cennika jej nie rusza |

**Kompozycja kalkulatorów**
| Rodzaj | Działanie | Przykład |
|---|---|---|
| suma | dodaje wyniki składników | cena bazowa + opłata za dostawę |
| krokowy (schodkowy) | cena za przedział stała, rośnie skokowo | 1–10 szt. po 5 zł, 11–50 po 4 zł (każdy przedział osobno) |
| progowy | po przekroczeniu progu **cała** ilość w nowej stawce | ≥ 100 szt. → wszystko po 3 zł |
| procentowy | % od podstawy (innego kalkulatora) | rabat 10%, prowizja 2% |
| dzienny / odsetkowy | stawka × czas; stopa roczna przeliczana na dzień/miesiąc | 6% rocznie × 45 dni zwłoki |
| min / max | ogranicza wynik składnika | prowizja 2%, nie mniej niż 5 zł |

Zaokrąglanie i skala **jawne**: wewnętrznie wysoka precyzja, wynik do groszy, reguła zaokrąglenia w jednym miejscu
(Money z `quantity-money.md`).

## Pytania
**A — decyzje standardowe:**
- Od czego zależy cena? Co jest **parametrem stałym** kalkulatora, a co **danymi transakcji**?
- Kto i jak często zmienia reguły cen? (konfiguracja vs kod)
- Czy klient musi zobaczyć, **jak** policzono cenę? (opis, rozbicie)
- Od kiedy obowiązuje cena i **jak długo ważna jest oferta**?
- Czy cena na zamówieniu jest **zamrożona**, czy przeliczana przy realizacji/fakturze?
- Progi: **krokowo** (każdy przedział osobno) czy **progowo** (cała ilość w stawce progu)?

**B — luki** (przykłady):
- kolejność składania rabatów (od ceny bazowej czy kaskadowo)? łączenie promocji (sumują się / wygrywa najlepsza)?
- cena minimalna / marża minimalna? · waluty i kursy (kiedy przeliczać)? · netto/brutto i VAT (Pricing czy osobno)?
- zmiana cennika w trakcie okresu rozliczeniowego (proporcjonalnie)? · odtworzenie ceny sprzed roku (reklamacja, audyt)?
- zaokrąglanie per pozycja czy od sumy? · symulacja „co jeśli” nowego cennika na historycznych zamówieniach?

## Kroki mapowania
1. **Kwoty** — wypisz każdą kwotę z wymagań (cena, opłata, odsetki, rabat, prowizja); dla każdej: waluta, precyzja, zaokrąglenie.
2. **Typy kalkulatorów** — sposoby liczenia; dla każdego parametry tworzenia i wyliczenia. Nie mnóż typów: nowa stawka to instancja.
3. **Instancje** — nazwane kalkulatory z opisem czytelnym dla biznesu.
4. **Kompozycje** — drzewo kalkulatorów dla każdej kwoty końcowej (suma, krokowy, progowy, procentowy, dzienny, min/max).
5. **Cenniki** — grupowanie instancji, okres ważności, wersjonowanie, reguła wyboru cennika (klient, kanał, data).
6. **Moment wyceny i zamrożenie** — kiedy cena się liczy (oferta, zamówienie, faktura) i gdzie jest zamrażana.
7. **Rozbicie** — co trafia do wyjaśnienia ceny (klient, audyt, obsługa).
8. **Granice** — czego Pricing nie robi: kto może nadać rabat (autoryzacja), księgowanie kwoty (Accounting), dopuszczalność opcji
   (Configurator).

## Decyzje do kontroli (R/A/X)
typy kalkulatorów i ich parametry · krokowy vs progowy · kolejność i łączenie rabatów · zaokrąglanie (per pozycja / od sumy,
tryb) · waluta i moment przeliczenia · ważność cennika i oferty · wersjonowanie · zamrożenie ceny na zamówieniu · przeliczanie
stopy rocznej (365/360, dni rzeczywiste) · netto/brutto · cena minimalna · kto zmienia konfigurację.

## Format wyniku
```markdown
# Model Pricing: <obszar>
## Kwoty              — | Kwota | Waluta | Precyzja | Zaokrąglenie |
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Typy kalkulatorów  — | Typ | Parametry tworzenia | Parametry wyliczenia | Wynik |
## Kalkulatory        — | Nazwa | Typ | Parametry | Opis dla biznesu |
## Kompozycje         — drzewo per kwota końcowa
## Cenniki            — | Cennik | Kalkulatory | Ważny od | Ważny do | Wersja | Reguła wyboru |
## Moment wyceny i zamrożenie
## Rozbicie ceny      — pola wyjaśnienia
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), parametry polityk zmiennych, granice z innymi archetypami
```

## Wzorce i pułapki
- **Nowa stawka = dane, nowy sposób liczenia = nowy typ.** Typ kalkulatora na każdą promocję to `if` w przebraniu.
- Cena zapisana tylko jako wynik bez odwołania do kalkulatora i wersji — nie da się jej wyjaśnić ani odtworzyć.
- Przeliczanie zamówień po zmianie cennika — klasyczny błąd; cena ofertowa jest **zamrożona**.
- Cennik edytowany w miejscu gubi historię — **wersjonuj**, okres ważności zamiast nadpisywania.
- Mylenie krokowego z progowym daje różne kwoty na granicy przedziału — zapisz jawnie i dodaj przykład liczbowy.
- `double` do pieniędzy — nie; Money z jawną skalą i zaokrągleniem.
- **Poza archetypem:** „czy handlowiec może dać 15% rabatu?” to autoryzacja (warstwa aplikacji), Pricing liczy podany rabat.
  Polityki zmienne („klient VIP ma inny cennik”) → warstwa reguł wybiera cennik/kalkulator i podaje go jako **parametr**.

## Kontrola jakości
- [ ] każda kwota z wymagań ma kalkulator (lub kompozycję) i opis czytelny dla biznesu
- [ ] każdy typ ma listę parametrów tworzenia i wyliczenia; brak parametru → błąd
- [ ] zaokrąglanie, waluta i precyzja zdefiniowane w jednym miejscu
- [ ] cenniki mają okres ważności i wersję; wiadomo, kiedy cena jest zamrażana
- [ ] krokowy/progowy rozstrzygnięty przykładem liczbowym na granicy przedziału
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Wypożyczalnia rowerów: 15 zł za godzinę, od 4 godzin 50 zł za dzień. Za każdy dzień zwłoki kara 30 zł.
Stali klienci mają 10% rabatu. Cena z rezerwacji obowiązuje, nawet gdy zmienimy cennik.”

```markdown
## Typy kalkulatorów
| stawka_za_jednostkę | stawka, jednostka | liczba jednostek | Money |
| ryczałt | kwota, okres | — | Money |
| procent | stopa | podstawa (Money) | Money |
## Kalkulatory
| wynajem-godz-15 | stawka_za_jednostkę | 15 PLN/h | „15 zł za każdą godzinę” |
| wynajem-dzień-50 | ryczałt | 50 PLN/dzień | „cały dzień 50 zł” (min wybiera go od 4 h: 4×15=60 > 50) |
| kara-zwłoka-30 | stawka_za_jednostkę | 30 PLN/dzień | „30 zł za dzień zwłoki” |
| rabat-stały-10 | procent | −10% | „10% dla stałych klientów” |
## Kompozycje — wynajem = min(wynajem-godz-15, wynajem-dzień-50) → procent(rabat) jeśli dotyczy; kara osobno (bez rabatu? → X)
## Moment wyceny — rezerwacja; cena zamrożona z odwołaniem do wersji cennika (R)
## Decyzje
| rabat także od kary? | X → zapytano: „To zależy” → parametr `rabat_obejmuje_kary` z polityki lojalnościowej (A) |
| kto jest „stałym klientem” | poza archetypem — reguła podaje `rabat` jako parametr (A) |
| zaokrąglenie do pełnej godziny w górę | X → hot spot |
```
