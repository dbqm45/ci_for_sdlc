# Archetyp Configurator — mapper (opcje, reguły, proces, solver)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których klient **składa produkt z opcji** (auto, komputer, pakiet ubezpieczenia, abonament), a opcje
mają zależności („nie razem”, „tylko razem”, „jedna z”, „jeśli A, to jedna z B/C”, „jeśli A, to nie D”), na model
deklaratywnych reguł, procesu konfiguracji i solvera. Zakodowane `if`-ami w UI i backendzie szybko przestają się zgadzać,
a sprawdzenie, czy kombinacja jest w ogóle możliwa, robi się trudne. Efekt: reguły dokłada się jako **dane**, każdą
niedostępną opcję da się **wyjaśnić**. Protokół wspólny: `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy wybór jednej opcji zmienia, które inne opcje są dozwolone lub wymagane?*
Tak → pasuje. Opcje są niezależne (dowolna kombinacja) → wystarczą cechy produktu.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| „nie można wybrać X razem z Y”, „Z wymaga W” | ✅ |
| „wybierz dokładnie jeden / co najmniej jeden z” | ✅ |
| kreator krok po kroku z wyszarzanymi opcjami | ✅ |
| „dlaczego nie mogę wybrać tej opcji?” | ✅ |
| „ile kosztuje ta konfiguracja?” | ❌ → Pricing (obok Configuratora) |
| „czy ten wariant jest na stanie / wolny w terminie?” | ❌ → Product / Availability |
| „wariant = rozmiar × kolor, wszystkie kombinacje dozwolone” | ❌ → Product (cechy z ograniczeniami) |
| „przydziel zasoby do zadań wg wymagań” | ❌ → General assignment |
| „walidacja formularza: pole wymagane, format” | ⚠️ graniczny |

**Przypadki graniczne:**
- *Walidacja formularza* — czy reguły **łączą wiele pól zależnościami**, które się zmieniają i których nie da się sprawdzić
  pojedynczo? Nie → zwykła walidacja; tak → Configurator.
- *Reguły liczbowe* („suma mocy ≤ 750 W”, „max 4 moduły”) — sama logika tak/nie to SAT; liczby → CSP (ten sam archetyp,
  mocniejszy silnik). Zapisz to jako decyzję.
- *Pakiety handlowe* („pakiet Sport zawiera A+B”) — to reguła „wymaga” albo osobny produkt złożony (Product); rozstrzyga pytanie,
  czy pakiet ma własną cenę i tożsamość.

## Model (istota)
| Element | Istota |
|---|---|
| **Definicja konfiguracji** | dla produktu/modelu: zbiór **opcji** i **reguł**; zmienia ją produkt/marketing; **wersjonowana** |
| **Opcja** | wybieralny element (np. „silnik 2.0”, „hak”), może należeć do grupy (np. „kolor”) |
| **Reguła** | deklaratywne ograniczenie — tabela niżej |
| **Wartość domyślna** | opcja wybrana na starcie, jeśli klient nie zdecyduje inaczej; nie może łamać reguł |
| **Proces konfiguracji** | osobny obiekt z własnym ID; tworzy go klient: start z definicją, kolejne **wybory** (i cofnięcia), lista **niewybranych**, zapytanie o **brakujące** opcje do poprawnej konfiguracji |
| **Rozstrzyganie** | reguły + wybory → formuła logiczna (klauzule); **solver SAT** (np. DPLL) lub **CSP** sprawdza, czy istnieje poprawne **dokończenie**, i które opcje są jeszcze możliwe |
| **Wyjaśnienie** | dla opcji niedostępnej: które reguły i które wybory ją blokują (minimalny zbiór konfliktu) |
| **Konfiguracja zapisana** | wynik procesu + wersja definicji, wg której była poprawna |

**Rodzaje reguł**
| Reguła | Znaczenie | Klauzula (idea) |
|---|---|---|
| wymaga (muszą być razem) | A → B | ¬A ∨ B |
| wyklucza (nie razem) | ¬(A ∧ B) | ¬A ∨ ¬B |
| jedna z (dokładnie jedna) | dokładnie 1 z grupy | co najmniej 1 + parami wykluczone |
| co najmniej jedna z | ≥ 1 z listy | A ∨ B ∨ C |
| musi być wybrana | A zawsze | A |
| warunkowe włączenie | jeśli A → jedna z listy | ¬A ∨ B ∨ C |
| warunkowe wykluczenie | jeśli A → żadna z listy | (¬A ∨ ¬B) ∧ (¬A ∨ ¬C) |

Oddziel **definicję** (produkt/marketing) od **procesu** (klient). Solver jest silnikiem za interfejsem archetypu — model mówi
„opcje i reguły”, nie „zmienne boolowskie”.

## Pytania
**A — decyzje standardowe:**
- Jakie są opcje i jakie zależności między nimi? **Kto je definiuje i jak często się zmieniają?**
- Czy klient ma widzieć, **dlaczego** opcja jest niedostępna?
- Czy konfiguracja ma **cenę** (Pricing) i **dostępność** (Availability/Product)?
- Czy zapisane konfiguracje muszą pozostać **ważne po zmianie reguł**?
- Proces: kolejne kroki w stałej kolejności czy dowolnie? Czy wolno **cofnąć** wybór?
- Wybór sprzeczny z wcześniejszym: **odrzucić** czy zaproponować **automatyczną zmianę** (usunąć kolidujące)?

**B — luki** (przykłady):
- wartości domyślne i ich zmiana po wyborze innej opcji? · automatyczne dobieranie wymaganych opcji (A → B dodaj samo)?
- reguły liczbowe (suma, limit ilości)? · reguły zależne od kanału/rynku/daty? · zapis niedokończonego procesu i powrót?
- konfiguracja jako podstawa zamówienia (zamrożenie wersji definicji)? · test definicji: czy każda opcja jest w ogóle osiągalna?

## Kroki mapowania
1. **Opcje i grupy** — lista opcji, grupy „jedna z”, opcje obowiązkowe.
2. **Reguły** — każdą zależność z wymagań zapisz jako regułę z tabeli rodzajów; nazwij ją językiem biznesu (do wyjaśnień).
3. **Wartości domyślne** — które, i czy są poprawne względem reguł (sprawdź solverem).
4. **Proces** — kroki (kolejność stała/dowolna), wybór, cofnięcie, obsługa konfliktu (odrzuć / zaproponuj zmianę), brakujące opcje.
5. **Silnik** — SAT (tylko tak/nie) czy CSP (liczby, sumy); co zwraca: możliwe opcje, brakujące, wyjaśnienie.
6. **Wersjonowanie** — definicja w wersjach; co z procesami w toku i zapisanymi konfiguracjami przy zmianie reguł.
7. **Granice** — cena (Pricing), stan/dostępność (Product/Availability), uprawnienia (kto widzi opcje) poza archetypem.

## Decyzje do kontroli (R/A/X)
rodzaj każdej reguły · grupy „jedna z” vs „co najmniej jedna” · wartości domyślne · kolejność kroków · cofanie wyborów ·
obsługa konfliktu (odrzuć / auto-zmiana) · automatyczne dobieranie wymaganych · SAT vs CSP · zakres wyjaśnień ·
wersjonowanie definicji i los zapisanych konfiguracji · kto edytuje definicję.

## Format wyniku
```markdown
# Model Configurator: <obszar>
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Opcje i grupy      — | Opcja | Grupa | Obowiązkowa | Domyślna |
## Reguły             — | Nazwa (biznesowa) | Rodzaj | Opcje | Źródło |
## Proces konfiguracji — kroki, cofanie, obsługa konfliktu, brakujące opcje
## Silnik             — SAT/CSP, zapytania: możliwe / brakujące / wyjaśnienie
## Wersjonowanie      — | Zmiana definicji | Procesy w toku | Zapisane konfiguracje |
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), parametry polityk zmiennych, granice z Pricing/Product/Availability
```

## Wzorce i pułapki
- Te same reguły w UI i backendzie zapisane `if`-ami rozjeżdżają się — **jedna definicja**, UI pyta solver o możliwe opcje.
- Sprawdzanie reguł tylko parami nie wykryje ślepego zaułka (wybory poprawne, ale nie da się dokończyć) — potrzebne sprawdzenie
  **możliwych dokończeń** solverem.
- Wyszarzona opcja bez powodu frustruje klienta — reguły mają **nazwy biznesowe**, wyjaśnienie wskazuje regułę i wybór.
- Domyślne wartości sprzeczne z regułami po zmianie definicji — testuj definicję (każda opcja osiągalna, domyślne poprawne).
- Zmiana reguł „w miejscu” unieważnia zamówienia — **wersjonuj**; zapisana konfiguracja wskazuje wersję.
- Cena wpisana w opcję → mieszanie archetypów; cena opcji to kalkulator Pricing.
- **Poza archetypem:** „czy ten klient może zamówić wersję flotową?” to autoryzacja/polityka (warstwa aplikacji), która
  podaje dozwolony zbiór opcji lub dodatkowe reguły jako **parametr** definicji; Configurator liczy mechanicznie.

## Kontrola jakości
- [ ] każda zależność z wymagań jest regułą z rodzajem i nazwą biznesową
- [ ] każda opcja osiągalna, domyślne wartości spełniają reguły
- [ ] proces ma: wybór, cofnięcie (lub jawne „nie”), konflikt, brakujące opcje
- [ ] silnik (SAT/CSP) dobrany do rodzaju reguł; wyjaśnienia zdefiniowane
- [ ] wersjonowanie definicji i los zapisanych konfiguracji rozstrzygnięte
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Kamper: zabudowa krótka albo długa. Długa wymaga silnika 2.2. Panel solarny wymaga akumulatora dodatkowego.
Markiza nie pasuje do bagażnika dachowego. Standardowo zabudowa krótka.”

```markdown
## Opcje i grupy
| krótka / długa | zabudowa (jedna z) | tak | krótka |
| silnik 2.0 / 2.2 | silnik (jedna z) | tak | 2.0 (X → A) |
| panel_solarny, akumulator_dod, markiza, bagażnik | — | nie | — |
## Reguły
| Długa zabudowa tylko z mocnym silnikiem | wymaga | długa → 2.2 | R |
| Panel potrzebuje akumulatora | wymaga | panel → akumulator | R |
| Markiza koliduje z bagażnikiem | wyklucza | markiza, bagażnik | R |
## Proces — dowolna kolejność; wybór „długa” przy silniku 2.0: zaproponuj zmianę na 2.2 (A)
## Decyzje
| auto-dobieranie akumulatora do panelu | „To zależy” → parametr `auto_dobieraj_wymagane` per kanał (salon/online) (A) |
| zapisane konfiguracje po zmianie reguł | X → hot spot |
```
