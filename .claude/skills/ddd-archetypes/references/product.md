# Archetyp Product — mapper (typ, egzemplarz, partia, oferta)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania o **tym, co firma sprzedaje, wydaje, wytwarza lub serwisuje** na model rozdzielający znaczenia, które
kryją się pod jednym słowem „produkt”: definicję („iPhone 15 Pro 256 GB”), konkretną sztukę (telefon o numerze seryjnym X),
partię (mleko z partii LOT-2024-001), usługę wykonaną w terminie (8,5 h konsultacji) i pozycję w ofercie („w promocji do końca
miesiąca”). Efekt: nowy asortyment = nowe dane, nie nowe kolumny i podklasy.
Protokół wspólny (pytania, „To zależy”, kontrola R/A/X, zapis): `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy biznes opisuje „rzeczy” (towary, usługi) cechami i musi odróżniać definicję od sztuk, partii
lub oferty?* Tak → pasuje. Jedna usługa bez wariantów i bez śledzenia → wystarczy prosty słownik.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| katalog, kategorie, karta produktu, „wycofaj z oferty” | ✅ |
| numery seryjne, VIN, IMEI, gwarancja na sztukę | ✅ |
| partie, daty ważności, wycofanie partii | ✅ |
| kolumny `color`, `size`, `year` dopisywane przy nowym asortymencie | ✅ cechy |
| warianty (rozmiar × kolor), zestawy, pakiety | ✅ |
| usługa z terminem i cyklem życia | ✅ usługa jako produkt |
| „ile sztuk mamy na stanie?” | ❌ → Accounting (lub Availability) |
| „ile kosztuje dla tego klienta?” | ❌ → Pricing |
| „opcja A wyklucza opcję B” | ❌ → Configurator |
| „czy ten egzemplarz jest wolny w terminie?” | ❌ → Availability |
| usługa subskrypcyjna | ⚠️ graniczny |

**Przypadki graniczne:**
- *Subskrypcja* — czy ma definicję z cechami, a sprzedawane są jej egzemplarze (okresy)? → Product + Accounting/umowa.
  Tylko stan „aktywna/nieaktywna” → maszyna stanów.
- *Wariant* — czy wariant ma własny kod (GTIN/SKU) i stan magazynowy? Tak → osobny ProductType w rodzinie. Nie, wybierany
  przy zamówieniu → cechy egzemplarza / Configurator.
- *Pakiet* — sprzedawany jako całość z własną ceną, ale wydawany ze składników? → pakiet z pozycjami (typ + ilość).

## Model (istota)
- **ProductType** — *czym coś jest*: identyfikator (ISBN, GTIN, UUID…), nazwa, opis, **preferowana jednostka** (Quantity),
  **strategia śledzenia**, definicje cech.
- **Strategia śledzenia** — „jak odróżniamy sztuki?”:

| Strategia | Przykład | Egzemplarz wymaga |
|---|---|---|
| unikatowy | obraz, gitara konkretnego muzyka | identyfikatora jedynej sztuki |
| śledzony indywidualnie | numer seryjny, VIN, IMEI; też umowa, przesyłka | numeru seryjnego |
| śledzony partiami | żywność, leki (kontrola jakości, wycofania) | partii |
| indywidualnie i partiami | telewizory: numer + partia do akcji serwisowych | obu |
| identyczne / zamienne | śruby, mąka luzem | nic — egzemplarze opcjonalne |

- **ProductInstance** — konkretny egzemplarz: numer seryjny i/lub partia (wg strategii), opcjonalnie ilość (3,2 kg, 8,5 h;
  domyślnie 1 jednostka preferowana) i **wartości cech**.
- **Cechy zamiast kolumn** — typ definiuje **typy cech** (nazwa, obowiązkowa/opcjonalna, ograniczenie: lista dozwolonych
  wartości, zakres liczbowy/dziesiętny, zakres dat, wyrażenie regularne, bez ograniczeń); egzemplarz podaje wartości walidowane
  względem definicji. Nowa cecha = dane. Cechy typu (stałe dla wszystkich sztuk) ≠ cechy egzemplarza (np. przebieg).
- **Batch** — partia: typ, ilość w partii (w jednostce typu), daty produkcji / sprzedaży do / użycia do / najlepiej przed,
  zakres numerów seryjnych, uwagi.
- **Rodzina i warianty** — rodzina grupuje typy różniące się wartościami cech wyróżniających (rozmiar, kolor); każdy wariant
  z własnym kodem to ProductType.
- **Pakiet (zestaw)** — typ złożony z pozycji `typ + ilość`; wybór składników z regułami „jeden z / nie razem” → Configurator.
- **CatalogEntry** — *że coś jest na sprzedaż*: nazwa marketingowa, opis sprzedażowy, kategorie nawigacji, **okres ważności
  oferty**, metadane (wyróżnienia, odznaki). Ten sam typ może mieć kilka wpisów (kanały, nazwy, okresy). Wycofanie z oferty
  = zamknięcie okresu, nie usunięcie typu.
- **Usługa jako produkt** — egzemplarz usługi to wykonanie procesu: zaplanowana → w trakcie → zakończona / anulowana.

## Pytania
**A — decyzje standardowe:**
- Czy biznes rozróżnia konkretne sztuki? Po czym? Czy potrzebne są wycofania partii? (→ strategia śledzenia per typ)
- Które cechy są obowiązkowe dla typu, a które opcjonalne? Jakie mają ograniczenia?
- Czy „ten sam produkt” może być w ofercie kilka razy (różne nazwy, kanały, okresy)?
- Co się dzieje z egzemplarzami, gdy typ zostaje wycofany z oferty?

**B — luki** (przykłady): czy strategia śledzenia może się zmienić dla typu w czasie? · wersjonowanie definicji typu (stare
egzemplarze wg starej definicji)? · dziedziczenie cech w kategoriach? · jednostki zastępcze (sprzedaż na kg, magazyn w szt.)? ·
zamienniki i następcy produktu? · kto zatwierdza nową kartę produktu (workflow poza archetypem)?

## Kroki mapowania
1. **Rozplącz „produkt”** — dla każdego użycia słowa w wymaganiach: typ, egzemplarz, partia, pozycja w ofercie czy wykonanie usługi?
2. **Typy** — lista ProductType z identyfikatorem, preferowaną jednostką (Quantity) i strategią śledzenia.
3. **Cechy** — kolumny/atrybuty z wymagań → typy cech z ograniczeniami; podział: cecha typu vs cecha egzemplarza.
4. **Egzemplarze i partie** — co wymaga numeru, co partii; pola partii (daty, zakres numerów).
5. **Warianty i pakiety** — rodziny, cechy wyróżniające, składy pakietów; reguły wyboru odeślij do Configurator.
6. **Oferta** — wpisy katalogowe, kanały, okresy ważności, kategorie; cena → Pricing.
7. **Usługi** — cykl życia egzemplarza usługi i jednostka zużycia (h, sesja).

## Decyzje do kontroli (R/A/X)
strategia śledzenia per typ · cechy obowiązkowe i ograniczenia · cecha typu vs egzemplarza · wariant jako typ vs cecha ·
skład pakietów · wielokrotne wpisy w katalogu · los egzemplarzy po wycofaniu z oferty · jednostka preferowana ·
wersjonowanie definicji · pola partii (które daty obowiązkowe).

## Format wyniku
```markdown
# Model Product: <obszar>
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Typy produktów     — | Typ | Identyfikator | Jednostka | Strategia śledzenia | Rodzina |
## Cechy              — | Typ | Cecha | Poziom (typ/egzemplarz) | Obowiązkowa | Ograniczenie |
## Egzemplarze i partie — | Typ | Wymaga (numer/partia) | Ilość | Pola partii |
## Pakiety            — | Pakiet | Składnik | Ilość | Reguła wyboru |
## Oferta             — | Wpis | Typ | Kanał | Ważna od–do | Kategorie |
## Usługi             — | Usługa | Jednostka | Cykl życia |
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- Jedna klasa `Product` pod wszystko = worek flag i kolumn `color`, `size`, `year` dodawanych przy każdym asortymencie.
- Typ ≠ oferta: usunięcie typu przy wycofaniu z oferty niszczy historię sprzedanych egzemplarzy.
- Cena nie jest cechą produktu → Pricing; stan magazynowy nie jest polem typu → Accounting/Availability.
- Ilości egzemplarzy i partii to Quantity (`quantity-money.md`), nie „goła” liczba.
- **Poza archetypem:** kto może dodać produkt lub opublikować wpis — autoryzacja/workflow; archetyp waliduje tylko
  strukturę (cechy vs definicje, numer vs strategia).
- **Polityki zmienne jako parametry:** „leki: sprzedaż do 30 dni przed datą użycia” → partia dostaje gotowe `sprzedaż_do`.

## Kontrola jakości
- [ ] każde użycie słowa „produkt” przypisane do jednego pojęcia (typ/egzemplarz/partia/oferta/usługa)
- [ ] każdy typ ma strategię śledzenia i preferowaną jednostkę
- [ ] brak kolumn-cech: każda cecha ma definicję z ograniczeniem
- [ ] wycofanie z oferty zamyka okres, nie usuwa typu
- [ ] cena i stan odesłane do właściwych archetypów
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Sklep rowerowy: rowery w rozmiarach S/M/L i kolorach, każdy z numerem ramy. Części (dętki, łańcuchy) sprzedajemy
na sztuki, smar na ml. Pakiet »start«: rower + kask + lampka. Serwis rowerów na godziny. Niektóre modele sprzedajemy tylko online.”

```markdown
## Typy produktów
| Rower Trek FX2 M czarny | GTIN | szt. | indywidualnie (nr ramy) | rodzina Trek FX2 |
| Dętka 28" | GTIN | szt. | zamienne | — |
| Smar do łańcucha | GTIN | ml | partiami (data ważności) | — |
## Cechy
| Rower | rozmiar ramy | typ | tak | {S, M, L} |
| Rower | przebieg serwisowy | egzemplarz | nie | 0–100 000 km |
## Pakiety — | Start | rower (dowolny z rodziny) + kask + lampka | 1+1+1 | wybór roweru → Configurator |
## Usługi — | Serwis | h | zaplanowana → w trakcie → zakończona / anulowana |
## Decyzje
| wariant (rozmiar × kolor) jako osobny typ | R: własny GTIN |
| kanały sprzedaży | A: „To zależy” od modelu → parametr `kanały` na CatalogEntry |
| smar śledzony partiami | X → zapytano → A: tak (wycofania) |
## Niezmapowane pojęcia — ceny i rabat pakietu (→ Pricing), stan magazynu (→ Accounting)
```
