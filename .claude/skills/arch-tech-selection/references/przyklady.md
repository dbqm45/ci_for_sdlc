# Przykłady — dobór stacku

## 1. Backend nowej aplikacji: macierz ważona
**Sytuacja.** „Budujemy aplikację do zgłaszania i obsługi usterek w 300 sklepach. Zespół: 4 osoby, piszą na co dzień
w TypeScripcie, front już jest w Angularze. Dane muszą zostać w UE. Jaki backend?”

**Jak.**
1. **Czynniki** z wymagań, z wagami 1–5: QA-1 przypisanie zgłoszenia bez podwójnego przydziału (5), QA-2 nowa kategoria
   usterki w 1 module (4), ograniczenie: zespół 4 osób i start za 3 miesiące (5).
2. **Filtry obowiązkowe**: hosting w UE, licencja dopuszczająca użycie komercyjne, wsparcie w horyzoncie projektu,
   aktywne łatki — opcja, która odpada, nie dostaje punktów.
3. **Kandydaci**: 2–3, w tym „nudny” — to, co zespół zna.
4. **Fakty** (wersje, daty końca wsparcia, licencje, zgodność z wersją TypeScriptu frontu) deleguję do `researcher`; do macierzy
   trafiają tylko ze źródłem i datą sprawdzenia, nigdy z pamięci.
5. **Macierz** wg kryteriów skilla; wynik = suma (ocena 1–5 × waga).
6. **Wnioski z domeny**: przydział zgłoszeń to konkurencja o zasób → baza z mocną spójnością i ograniczeniami (PostgreSQL).

**Wynik** (fragment `04-architecture/stack-decision.md`, status `proposed`):

| Kryterium (waga) | A: TypeScript + Node.js („nudna”) | B: Java + Spring | C: Go |
|---|---|---|---|
| dopasowanie do czynników (5) | 4 | 5 | 4 |
| kompetencje zespołu (5) | 5 | 2 | 2 |
| dojrzałość ekosystemu (3) | 4 | 5 | 4 |
| koszt operacyjny i złożoność (3) | 4 | 3 | 4 |
| przyjazność dla agentów AI (4) | 5 (`lang-typescript`, wspólne typy z frontem) | 4 (`lang-java`) | 2 (brak skilla `lang-go`) |
| uzależnienie i koszt wyjścia (2) | 4 | 4 | 4 |
| bezpieczeństwo (3) | 3 | 4 | 4 |
| **Suma** | **106** | 95 | 82 |

Decyzja: A + PostgreSQL, styl: modularny monolit. Persony realizujące: `stack: [lang-typescript, fw-angular, be-database]`.
Ryzyko: łańcuch zależności npm → ops-supply-chain-security (lockfile, karencja nowych wersji). ADR-003, wiersz w decisions.md.

## 2. Stary system: zachowaj / usprawnij / zastąp
**Sytuacja.** „Mamy 10-letni system zamówień hurtowych. Zespół chce przepisać wszystko od zera na nowy framework.”

**Jak.**
1. Projekt istniejący → najpierw `python3 .claude/hooks/detect_stack.py`; rekomendacja per obszar, nie nowy stack.
2. Dla każdego obszaru: czy blokuje scenariusz (H,H)? ile kosztuje migracja?
3. Wymianę planuję wzorcem strangler fig, po granicach kontekstów — nowy kod obok starego, ruch przełączany kawałkami.
4. Odrzucam anty-wzorzec: przepisanie „bo framework jest stary”, bez związku z czynnikami.

**Wynik**:

| Obszar | Decyzja | Uzasadnienie (czynnik) | Koszt migracji |
|---|---|---|---|
| baza relacyjna | **zachowaj** | spełnia QA-2 (spójność stanów magazynowych) | 0 |
| backend zamówień | **usprawnij** | testy charakteryzujące + wydzielenie modułów; brak scenariusza, którego nie da się spełnić | 6 tygodni |
| moduł cennika | **zastąp** (strangler fig) | QA-4: zmiana reguły rabatowej trwa dziś 3 tygodnie | 3 miesiące, kontekst po kontekście |
| front panelu klienta | **zastąp** | framework bez łatek bezpieczeństwa — odpada na filtrze obowiązkowym | 4 miesiące |

Pełne przepisanie: odrzucone — koszt całości bez zysku w czynnikach i bez wartości dla użytkownika do ostatniego dnia migracji.

## 3. Jądro algorytmiczne: solver i spike z kryterium porzucenia
**Sytuacja.** „Planujemy trasy 25 serwisantów dziennie z oknami czasowymi klientów. Napiszemy własny algorytm?”

**Jak.**
1. `02-domain/algorithms.md` (ddd-algorithm-recognition) rozpoznał problem tras z oknami czasowymi — NP-trudny.
2. Reguła skilla: solver lub biblioteka optymalizacyjna **za interfejsem domenowym**, nie własny algorytm.
3. Konkretne biblioteki, licencje i wersje sprawdza `researcher` — do decyzji trafiają 2 kandydaci ze źródłami.
4. Niepewność (czas obliczeń przy realnej skali) zamieniam w spike ograniczony czasem, z **kryterium porzucenia**.

**Wynik** (wpis „Ryzyka i spike'i” w stack-decision.md):
```markdown
### SPIKE-02: solver tras serwisantów
Pytanie: czy kandydat X układa plan dla 25 serwisantów i 180 wizyt w < 60 s przy zachowaniu okien czasowych?
Czas: 5 dni roboczych, 1 osoba.
Dane: zanonimizowany dzień z marca (180 wizyt), plan ręczny dyspozytora jako punkt odniesienia.
Sukces: < 60 s i łączny czas jazdy ≤ planu ręcznego.
Kryterium porzucenia: > 60 s albo naruszone okno czasowe → kandydat Y; oba odpadają → plan ręczny + podpowiedzi.
Interfejs domenowy (niezależny od solvera): PlanowanieTras.zaplanuj(dzień, serwisanci, wizyty) -> PlanDnia
```
