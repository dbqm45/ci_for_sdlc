# Archetyp Quantity / Money — mapper (ilości, jednostki, kwoty, waluty)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których pojawiają się **liczby z jednostką lub walutą** — 3 kg, 8,5 h, 120 PLN, 2 szt. — na obiekty
wartości niosące liczbę razem z jej znaczeniem. Gdy jednostka lub waluta żyje w osobnym polu (albo tylko w głowie programisty),
pojawiają się błędy: kilogramy dodane do litrów, złotówki do euro, zaokrąglenia na liczbach zmiennoprzecinkowych, formatowanie
powielone w wielu miejscach. Efekt: niepoprawna arytmetyka **się nie kompiluje albo rzuca błąd**, a zaokrąglanie i przeliczenia
są jawnymi politykami. Protokół wspólny (pytania, „To zależy”, kontrola R/A/X, zapis): `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy ta liczba ma sens bez jednostki lub waluty?* Nie → Quantity/Money. Tak (licznik, numer, procent
bez odniesienia, wynik oceny) → zwykła liczba.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| kwoty, ceny, salda, raty, podział kosztów | ✅ Money |
| kg, l, m², h, szt. — zwłaszcza różne w różnych pozycjach | ✅ Quantity |
| kilka walut, kursy, przewalutowanie | ✅ Money + polityka kursów |
| „zaokrąglamy do grosza / do 5 gr / w dół” | ✅ polityka zaokrąglania |
| „podziel 100 zł na 3 raty” | ✅ podział bez gubienia groszy |
| numer zamówienia, liczba odsłon, ocena 1–5 | ❌ zwykła liczba / identyfikator |
| „skąd to saldo?”, historia zmian wartości | ❌ → Accounting (używa Money) |
| „ile kosztuje dla tego klienta?” | ❌ → Pricing (zwraca Money) |
| procent, stawka VAT | ⚠️ graniczny |

**Przypadki graniczne:**
- *Procent / stawka* — czy jest współczynnikiem mnożonym przez Quantity/Money? → osobny obiekt wartości `Stawka` (bez jednostki,
  z własną precyzją), nie Money. Samodzielny wskaźnik raportowy → zwykła liczba.
- *Czas* — czy to **ilość** czasu (8,5 h do rozliczenia)? → Quantity. Chwila lub przedział w kalendarzu → typy daty/czasu (Availability).
- *Punkty lojalnościowe* — Quantity z jednostką `pkt`; ich historia i salda → Accounting.

## Model (istota)
- **Unit** — obiekt wartości: symbol i nazwa (szt., kg, l, m, m², m³, h, min), **wymiar** (masa, objętość, długość, czas,
  sztuki). Zbiór jednostek jest otwarty — można dodać własne (paleta, karton).
- **Quantity** — wartość dziesiętna + jednostka. Dodawanie i odejmowanie **tylko dla tej samej jednostki** (inaczej błąd);
  mnożenie/dzielenie przez skalar; porównania tylko w tej samej jednostce.
- **Przelicznik** — osobna, jawna polityka (tabela konwersji), nie ukryta magia. Stałe w obrębie wymiaru (1 kg = 1000 g) vs
  zależne od produktu (1 karton = 12 szt., 1 l mleka ≈ 1,03 kg) — te drugie należą do Product, nie do Unit.
- **Money** — wyspecjalizowana ilość: kwota + **waluta** (kod ISO 4217 i liczba miejsc najmniejszej jednostki: PLN 2, JPY 0,
  KWD 3). Operacje: dodaj, odejmij, zaneguj, wartość bezwzględna, porównania, min/max, pomnóż przez skalar, **dzielenie z resztą**
  i **podział proporcjonalny** bez gubienia groszy, sprawdzenie zera i znaku.
- **Kurs waluty** — para walut, wartość, **data/chwila obowiązywania**, źródło i rodzaj (kupno/sprzedaż/średni, np. tabela NBP).
  Przewalutowanie = operacja `Money × Kurs → Money`, zawsze z zapisanym kursem.
- **Polityka zaokrąglania** — tryb (HALF_UP, HALF_EVEN, w dół, do 5 gr), precyzja i **moment** (per pozycja vs per dokument),
  w jednym miejscu, jawnie.
- Arytmetyka zawsze na typach dokładnych (decimal / liczba całkowita w najmniejszej jednostce); nigdy float.
- **Gdzie się pojawia:** preferowana jednostka produktu i ilość w partii (Product), cennik zwraca Money (Pricing), salda kont
  (Accounting), usługa zużywa godziny.

## Pytania
**A — decyzje standardowe:**
- W jakiej jednostce biznes myśli o tej liczbie? Czy jednostka może się różnić między pozycjami?
- Czy przeliczamy jednostki/waluty? Kto ustala kurs/przelicznik i na jaką chwilę?
- Jakie są reguły zaokrąglania i kto je określa (prawo, księgowość, umowa)?
- Jak dzielimy kwotę na części (raty, podział kosztów), żeby suma się zgadzała?

**B — luki** (przykłady): ujemne kwoty dozwolone (korekty, zwroty)? · precyzja pośrednia większa niż końcowa (ceny jednostkowe
z 4 miejscami)? · kto dostaje „resztę” przy podziale (pierwsza/ostatnia rata, największa część)? · kwoty w wielu walutach naraz
(portfel, suma raportowa)? · format wyświetlania per język/kraj (poza modelem)? · VAT liczony od pozycji czy od sumy?

## Kroki mapowania
1. **Inwentaryzacja liczb** — każda liczba z wymagań: ma jednostkę/walutę? Jeśli tak → Quantity/Money; jeśli nie → uzasadnij.
2. **Jednostki** — lista jednostek z wymiarem; jednostka kanoniczna dla przechowywania per wymiar.
3. **Przeliczniki** — stałe (w wymiarze) vs zależne od produktu (→ Product); kierunek i precyzja.
4. **Waluty** — lista, miejsca dziesiętne, waluta bazowa/raportowa.
5. **Kursy** — źródło, rodzaj, chwila obowiązywania (data transakcji / faktury / płatności), zapis kursu przy operacji.
6. **Zaokrąglanie** — dla każdego miejsca obliczeń: tryb, precyzja, moment; kto ustala.
7. **Podział kwot** — algorytm (równo z resztą / proporcjonalnie wg wag / metoda największych reszt) i komu przypada reszta.

## Decyzje do kontroli (R/A/X)
jednostka kanoniczna per wymiar · przeliczniki (stałe vs produktowe) · waluty i ich precyzja · źródło, rodzaj i data kursu ·
tryb, precyzja i moment zaokrąglenia · komu przypada reszta z podziału · dopuszczalność kwot ujemnych · precyzja pośrednia ·
obsługa wielu walut w jednej sumie.

## Format wyniku
```markdown
# Model Quantity/Money: <obszar>
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Jednostki          — | Jednostka | Wymiar | Kanoniczna? | Uwagi |
## Przeliczniki       — | Z | Na | Współczynnik | Stały/produktowy | Precyzja |
## Waluty i kursy     — | Waluta | Miejsca | Źródło kursu | Rodzaj | Chwila obowiązywania |
## Zaokrąglanie       — | Miejsce obliczeń | Tryb | Precyzja | Moment | Kto ustala |
## Podział kwot       — | Operacja | Algorytm | Reszta trafia do |
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- `double` na pieniądzach: 0,1 + 0,2 ≠ 0,3. Decimal albo liczba całkowita w groszach.
- Kwota bez waluty w polu obok (`amount`, `currency`) — ktoś w końcu doda PLN do EUR.
- 100 zł / 3 = 33,33 × 3 = 99,99 — podział musi rozdzielić resztę (33,34 + 33,33 + 33,33).
- Kurs „bieżący” zamiast kursu z daty zdarzenia — raporty nie dadzą się odtworzyć.
- Zaokrąglanie rozsiane po kodzie → różne sumy na fakturze i w księdze.
- Przeliczenie kg ↔ l wymaga gęstości — to wiedza produktu, nie jednostki.
- **Poza archetypem:** formatowanie i lokalizacja („1 234,56 zł”) — warstwa prezentacji; kto może ustawić kurs ręcznie —
  autoryzacja.
- **Polityki zmienne jako parametry:** tryb zaokrąglenia zależny od kraju lub umowy, źródło kursu per kontrahent → operacja
  dostaje gotową `politykę_zaokrąglania` / `kurs`.

## Kontrola jakości
- [ ] żadna kwota ani ilość nie jest „gołą” liczbą; brak float
- [ ] operacje na różnych jednostkach/walutach są zabronione albo przechodzą przez jawny przelicznik/kurs
- [ ] każdy kurs ma źródło, rodzaj i chwilę obowiązywania
- [ ] każde miejsce zaokrąglenia ma tryb, precyzję i moment
- [ ] każdy podział kwoty sumuje się do całości
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Hurtownia sprzedaje kawę na kg i w paczkach 250 g, klientom z PL i DE (PLN, EUR). Faktura w EUR przeliczana
na PLN do księgi. Klient może rozłożyć płatność na 3 raty.”

```markdown
## Jednostki
| g | masa | tak | przechowywanie w gramach |
| kg | masa | nie | 1 kg = 1000 g (stały) |
| paczka | sztuki | nie | 1 paczka = 250 g kawy (produktowy → Product) |
## Waluty i kursy
| PLN | 2 | NBP | średni | dzień roboczy przed datą wystawienia faktury |
| EUR | 2 | — | — | — |
## Zaokrąglanie
| cena jednostkowa | HALF_UP | 4 miejsca | per pozycja | księgowość |
| VAT | HALF_UP | 0,01 | A: „To zależy” (od pozycji vs od sumy) → parametr `moment_zaokrąglenia_VAT` | prawo/księgowość |
## Podział kwot — | raty | równo z resztą | pierwsza rata (X → zapytano → A) |
## Decyzje
| kurs z dnia poprzedzającego fakturę | R |
| zwroty jako kwoty ujemne | X → hot spot |
## Niezmapowane pojęcia — cena za kg per klient (→ Pricing), rozrachunek rat (→ Accounting)
```
