# Archetyp General Assignment — mapper (zadania, zasoby, przydział z ograniczeniami)

> **Spis treści:** Test dopasowania · Model (istota) · Heurystyka czy solver · Optymalizacja a symulacja — dwa moduły · Rekomendacja czy decyzja wiążąca · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których trzeba wybrać, **które** zadania/zlecenia/projekty zrealizować i **którymi** zasobami, gdy
zasoby mają różne cechy, a zadania różne wymagania i wartość (specjaliści do projektów, pojazdy do zleceń, sale do zajęć,
maszyny do zamówień), na model optymalizacji. Ręczne `if`-y i sortowanie „po wartości” dają przypadkowe wyniki. Efekt:
przydział jako **czysta funkcja** — testowalna przykładami i gotowa do symulacji „co jeśli”. Protokół wspólny: `SKILL.md` →
„Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy trzeba wybrać podzbiór zadań i dopasować do nich zasoby o różnych cechach tak, by zmaksymalizować
wartość przy ograniczonej pojemności?* Tak → pasuje. Pytanie brzmi tylko „czy zasób jest wolny?” → Availability.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| „kogo przydzielić do projektu”, „który pojazd do zlecenia” | ✅ |
| zasoby różnią się cechami (kompetencje, ładowność, wyposażenie) | ✅ |
| „nie starczy dla wszystkich — które zadania wziąć?” | ✅ |
| „ile zyskamy, zatrudniając jeszcze jedną osobę?” | ✅ symulacja |
| „czy sala jest wolna we wtorek?”, podwójne rezerwacje | ❌ → Availability |
| „w jakiej kolejności etapy, co równolegle?” | ❌ → Planning |
| „kto pierwszy w kolejce po zwolnione miejsce” | ❌ → Waitlist |
| „które opcje produktu wolno łączyć” | ❌ → Configurator |
| „przypisz zgłoszenie dyżurnemu wg grafiku” | ⚠️ graniczny |

**Przypadki graniczne:**
- *Przypisanie wg prostej reguły* (round-robin, grafik) — czy istnieje **wybór z konfliktem wartości** (nie wszystko się zmieści,
  zasoby nie są wymienne)? Nie → reguła/polityka; tak → General assignment.
- *Harmonogram z czasem* — kolejność i zależności to Planning; kto wykona etap — General assignment; zajęcie w czasie — Availability.

## Model (istota)
| Element | Istota |
|---|---|
| **Wymiar pojemności** (capacity dimension) | pojedynczy dostępny zasób o określonych cechach („programista Java senior”, „ciężarówka 12 t w poniedziałek”) |
| **Wymiar wagi** (weight dimension) | wymaganie zadania, które **jest spełniane przez** określony wymiar pojemności — predykat „czy ten zasób spełnia to wymaganie” |
| **Item** | zadanie z nazwą, **wartością** (zysk, priorytet) i łączną wagą (listą wymagań); zadania bez wymagań są brane **zawsze** |
| **Całkowita pojemność** | zbiór dostępnych zasobów |
| **Rozwiązanie** | wielowymiarowy **problem plecakowy**: podzbiór zadań o maksymalnej łącznej wartości, gdzie każde wymaganie wybranego zadania przypisano do **innego**, pasującego zasobu. Wynik: wartość, wybrane zadania, przypisanie zadanie → zasoby |
| **Kolejność rozważania** | parametr (np. malejąco po wartości) |

Klasa problemu **transformacja/obliczenia** (ddd-deep-modeling): czysta funkcja, łatwa do testowania przykładami i do
symulacji „co jeśli” (co zyskamy, zatrudniając jeszcze jedną osobę).

## Heurystyka czy solver
| Sytuacja | Silnik |
|---|---|
| mało zadań i zasobów, wynik „wystarczająco dobry”, szybka odpowiedź | **heurystyka zachłanna** (sortuj po wartości/gęstości, bierz, co pasuje) |
| średnia skala, potrzebne optimum | programowanie dynamiczne / przeszukiwanie z odcięciami |
| duża skala, wiele ograniczeń (koszty, preferencje, limity), wymagana optymalność | **solver MIP** (programowanie całkowitoliczbowe) |
| wartość zależy od pary zadanie–zasób (koszt dojazdu, dopasowanie) | problem przydziału ważonego / MIP |

Silnik wymienny za jednym interfejsem — zacznij od najprostszego, zmierz jakość przykładami.

## Optymalizacja a symulacja — dwa moduły
| Moduł | Rola |
|---|---|
| **Optymalizacja** | generyczny silnik: elementy z wartością i wymaganiami, pojemności jako wymiary z predykatem „czy spełnia”; nic nie wie o projektach ani ludziach. Łatwy do testowania przykładami z podręcznika |
| **Symulacja** | adapter domenowy: mapuje projekty, wymagania kompetencyjne i dostępność ludzi na elementy i pojemności, a wynik — z powrotem na język biznesu |

- Typowe pytania wsparcia decyzji jako dwie symulacje **przed/po**: „ile zyskamy, zatrudniając/kupując dodatkową zdolność?”,
  „co się stanie z zyskiem, jeśli przeniesiemy osobę między projektami?”. **Różnica wartości = odpowiedź.**
- Pułapka implementacyjna: przy tablicach **programowania dynamicznego** nie wypełniaj wszystkich komórek **tym samym** obiektem
  mutowalnym — każda komórka potrzebuje własnej instancji.

## Rekomendacja czy decyzja wiążąca
Wynik przydziału to domyślnie **rekomendacja** (plan, symulacja) — nic nie blokuje. Gdy staje się **decyzją wiążącą**, osobny
krok zatwierdzenia woła **Availability**, które **blokuje** zasoby; konflikt blokady (ktoś zajął zasób w międzyczasie) → ponowne
przeliczenie. General assignment planuje, Availability blokuje.

## Pytania
**A — decyzje standardowe:**
- Co jest „wartością” zadania dla biznesu? **Czy wartość zależy od przydzielonego zasobu?**
- Jakie cechy zasobu decydują o dopasowaniu? **Czy jeden zasób może obsłużyć kilka wymagań?**
- Czy przydział jest **planem** (symulacja), czy **decyzją wiążącą** (wtedy Availability blokuje zasoby)?
- Jak często przeliczamy i czy wynik musi być **optymalny**, czy wystarczy **dobry**?
- Czy zadanie można zrealizować **częściowo** (część wymagań), czy wszystko albo nic?

**B — luki** (przykłady):
- zadania obowiązkowe (umowa, kara) niezależnie od wartości? · preferencje/zakazy (ta osoba nie z tym klientem)?
- stabilność: czy przeliczenie może przetasować ogłoszony przydział? · remisy między równymi wynikami?
- dlaczego zadanie odpadło (wyjaśnienie)? · zasoby częściowo dostępne (pół etatu)?

## Kroki mapowania
1. **Zasoby → wymiary pojemności** — lista zasobów z cechami istotnymi dla dopasowania; źródło dostępności (Availability).
2. **Wymagania → wymiary wagi** — dla każdego wymagania predykat „spełnia” (np. poziom ≥ senior, ładowność ≥ 10 t).
3. **Zadania → items** — nazwa, wartość (skąd), wymagania; zadania obowiązkowe i bez wymagań.
4. **Reguły dopasowania** — jeden zasób = jedno wymaganie? częściowa realizacja? preferencje i zakazy.
5. **Silnik** — heurystyka / DP / MIP wg tabeli; kolejność rozważania jako parametr; kryterium „dość dobre”.
6. **Moduły** — granica optymalizacja (generyczna) / symulacja (adapter domenowy); scenariusze przed/po.
7. **Status wyniku** — rekomendacja czy decyzja; punkt zatwierdzenia i wywołanie Availability; obsługa konfliktu.

## Decyzje do kontroli (R/A/X)
definicja wartości · wartość zależna od zasobu · predykaty dopasowania · jeden zasób — jedno czy wiele wymagań ·
częściowa realizacja · zadania obowiązkowe · silnik (heurystyka/DP/MIP) i kryterium jakości · kolejność rozważania ·
częstotliwość przeliczeń i stabilność · rekomendacja vs decyzja wiążąca · remisy.

## Format wyniku
```markdown
# Model General Assignment: <obszar>
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Wymiary pojemności — | Zasób | Cechy | Dostępność |
## Wymiary wagi       — | Wymaganie | Predykat „spełnia” |
## Items              — | Zadanie | Wartość (reguła) | Wymagania | Obowiązkowe |
## Silnik             — heurystyka/DP/MIP, kolejność, kryterium jakości
## Moduły             — optymalizacja / symulacja; scenariusze przed/po
## Status wyniku      — rekomendacja/decyzja, zatwierdzenie, blokada, konflikt
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), parametry polityk zmiennych, granice z Availability/Planning
```

## Wzorce i pułapki
- Sortowanie „po wartości” bez sprawdzenia dopasowania to przypadkowe wyniki — jeśli heurystyka, to jawnie nazwana.
- Silnik znający „projekty” i „programistów” — nietestowalny przykładami; domena tylko w **symulacji**.
- Przydział od razu blokujący zasoby uniemożliwia „co jeśli” — blokada dopiero po zatwierdzeniu.
- **Poza archetypem:** „kto może zatwierdzić przydział?” i „czy wolno przenieść osobę z projektu klienta X?” — autoryzacja
  i polityki (warstwa aplikacji). Polityki zmienne (waga wartości, lista zakazów) przychodzą jako **parametry** silnika.

## Kontrola jakości
- [ ] zasoby i wymagania zmapowane; predykaty „spełnia” jednoznaczne
- [ ] wartość zadania zdefiniowana (i czy zależy od zasobu)
- [ ] silnik dobrany uzasadnieniem (skala, optymalność); kolejność rozważania jako parametr
- [ ] rozdział optymalizacja/symulacja; co najmniej jeden scenariusz przed/po
- [ ] rozstrzygnięte: rekomendacja czy decyzja, gdzie blokada Availability
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Firma remontowa ma 5 ekip (różne uprawnienia: gaz, elektryka, dekarstwo). Co tydzień jest więcej zleceń
niż ekip. Chcemy brać zlecenia o największej marży. Czy opłaca się wyszkolić drugą ekipę gazową?”

```markdown
## Wymiary pojemności | ekipa_A | gaz, elektryka | grafik (Availability) | … |
## Wymiary wagi       | uprawnienie_gaz | ekipa ma „gaz” | uprawnienie_dach | ekipa ma „dekarstwo” |
## Items              | remont_łazienki_12 | marża 8 000 PLN | gaz + elektryka | nie |
## Silnik — ≤ 30 zleceń/tydzień: DP, optimum (A)
## Symulacja — przed: 5 ekip → 41 000 PLN; po: + gaz dla ekipy_C → 47 500 PLN; różnica 6 500 PLN/tydz. vs koszt szkolenia
## Decyzje
| jedna ekipa = jedno zlecenie w tygodniu? | X → zapytano: „To zależy” → parametr `max_zleceń_na_ekipę` z polityki operacyjnej (A) |
| wynik = rekomendacja; kierownik zatwierdza → blokada ekip w Availability | A |
| zlecenia gwarancyjne obowiązkowe | X → hot spot |
```
