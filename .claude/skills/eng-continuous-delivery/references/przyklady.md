# Przykłady ciągłego dostarczania

## 1. Trzytygodniowa gałąź funkcji → seria małych kroków
**Sytuacja:** „Gałąź `feature/new-checkout` żyje od 3 tygodni, ma 74 pliki zmian i konflikty przy każdym rebase.
Jak to dowieźć i nie powtórzyć?”

**Jak:**
1. **Trunk-based development:** gałęzie ≤ 1–2 dni, integracja co najmniej codziennie — obecna gałąź to ukryte ryzyko
   integracji.
2. **Małe partie:** duża zmiana → seria PR-ów, każdy wdrażalny osobno.
3. **Feature flag** oddziela wdrożenie od udostępnienia; flaga ma właściciela i datę usunięcia.
4. **Branch by abstraction** dla wymiany starego koszyka: interfejs, nowa implementacja obok, przełączenie flagą.
5. **Główna zawsze wdrażalna:** każdy PR przechodzi pełny pipeline, a czerwony build naprawiasz przed nową pracą.

**Wynik** — plan wydzielenia gałęzi na kroki i definicja flagi:

| Krok | PR | Wdrażalny bez udostępnienia? |
|---|---|---|
| 1 | interfejs `CheckoutFlow` + stary koszyk za nim (bez zmiany zachowania) | tak |
| 2 | nowy `CheckoutFlowV2` za flagą `checkout-v2`, domyślnie wyłączoną | tak |
| 3 | migracja danych *expand*: nowe kolumny obok starych (be-database) | tak |
| 4 | włączenie flagi dla zespołu wewnętrznego | tak |
| 5 | włączenie dla wszystkich, potem *contract*: usunięcie starego koszyka i flagi | tak |

```ts
type FeatureFlag = { key: string; owner: string; removeBy: string; defaultOn: boolean };

export const flags: FeatureFlag[] = [
  { key: "checkout-v2", owner: "zespol-platnosci", removeBy: "2026-12-15", defaultOn: false },
];
```

## 2. Metryki DORA jako cel dla zespołów
**Sytuacja:** „Chcę dać zespołom cel: co najmniej 20 wdrożeń tygodniowo, i ranking zespołów co miesiąc”.

**Jak:**
1. Metryki DORA służą do uczenia się, **nie są celami** (prawo Goodharta) — cel liczbowy zachęca do dzielenia wdrożeń
   na sztuczne kawałki.
2. **Porównuj system z nim samym w czasie**, nie zespoły między sobą (różne usługi, różne ryzyko).
3. Mierz razem przepustowość i niestabilność — szybkość i stabilność idą w parze.
4. Poziom pomiaru: aplikacja/usługa, nie osoba.

**Wynik** — rekomendacja: zamiast celu i rankingu kwartalny przegląd trendu usługi `orders-api`:

| Metryka | Q2 | Q3 | Wniosek |
|---|---|---|---|
| czas realizacji zmiany | 6 dni | 2 dni | mniejsze PR-y działają |
| częstotliwość wdrożeń | 3 / tydz. | 9 / tydz. | — |
| czas przywrócenia po nieudanym wdrożeniu | 5 h | 1,5 h | — |
| odsetek nieudanych zmian | 18% | 9% | szybciej nie znaczy gorzej |
| odsetek przeróbek wdrożeń | 7% | 6% | bez zmian — zadanie: przegląd hotfixów |

## 3. Konfiguracja w kodzie a Twelve-Factor
**Sytuacja:** „Review serwisu: adres bazy jest wpisany w `settings.py`, logi idą do pliku `app.log`, a obraz budujemy
osobno na test i produkcję”.

**Jak:**
1. **Konfiguracja w środowisku**, nie w kodzie — jeden obraz na wszystkie środowiska.
2. **Rozdzielone build/release/run:** build raz, release = obraz + konfiguracja środowiska.
3. **Logi jako strumień zdarzeń:** `stdout`, zbieraniem zajmuje się platforma.
4. **Shift left:** skan sekretów w pipeline złapałby hasło w `settings.py` przed scaleniem.

**Wynik:**
```python
import logging
import os
import sys

DATABASE_URL = os.environ["DATABASE_URL"]  # brak zmiennej = błąd przy starcie, nie cicha wartość domyślna
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

logging.basicConfig(stream=sys.stdout, level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s %(message)s")
```
Uwagi z review: usunąć hasło z historii i je zmienić (ops-secrets-identities), jeden obraz promowany test → produkcja.
