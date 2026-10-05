---
name: ddd-model-stress-test
description: Użyj przy teście rozszerzalności modelu wzdłuż metryki biznesowej — wymagania na ślepo, wpływ na moduły.
metadata:
  katalog: "Użyj, by sprawdzić rozszerzalność modelu/dekompozycji wzdłuż metryki biznesowej — brief bez rozwiązania, wymagania generowane „na ślepo” (agent bez wglądu w architekturę), ocena wpływu na moduły, porównanie dekompozycji. Nie do zbierania wymagań od klienta ani pomiaru sprzężeń w kodzie (ddd-connascence-analysis)."
  slowa: "czy model wytrzyma przyszłe wymagania, rozszerzalność, nowe wymagania, porównanie dekompozycji, wpływ zmian na moduły"
---

# Test obciążeniowy modelu („potrząśnij modelem”)

Pytanie: **ile modułów musi się zmienić, gdy biznes zechce poprawić swoją metrykę?** Dobra dekompozycja przyjmuje typowe
zmiany lokalnie. Test ma sens tylko wtedy, gdy wymagania wymyśla ktoś, kto **nie widział architektury** — wymagania
pisane ze znajomością modułów pasują do nich z konstrukcji i niczego nie dowodzą.

## Przebieg
1. **Metryka** — od człowieka, dosłownie (np. „marża na projekcie”, „czas od zamówienia do dostawy”). Nigdy jej nie wymyślaj.
   Metrykę opisaną rozwiązaniem („szybsze API”) przeformułuj z człowiekiem na liczbę biznesową. Bramka.
2. **Brief biznesowy** (główny wątek) → `docs/project/02-domain/_blind/brief.md`. Opowieść o **działalności**: co firma robi i dla kogo,
   gdzie zarabia i ryzykuje, reguły gry, co już umie, słownik, skala. Materiały techniczne (mapa kontekstów, moduły) czytasz jako
   źródło wiedzy o biznesie, ale ich **formę usuwasz**: `references/business-brief.md`. Dwa testy przed wydaniem: lustra
   i niezmienności. Bramka.
3. *(opcjonalnie)* **Przegląd konkurencji** → `docs/project/02-domain/_blind/competitors.md` (`references/competitor-digest.md`); sieć tylko za zgodą.
4. **Wymagania na ślepo** — agent `blind-analyst` (świeży kontekst, tylko Read; hook `cleanroom_guard.py` w profilu `blind`
   pozwala mu czytać wyłącznie `docs/project/02-domain/_blind/**`). Dostaje: metrykę, ścieżki do briefu/przeglądu, liczbę wymagań.
   W briefie dla niego **nie podawaj** nazw modułów ani ścieżek spoza `02-domain/_blind/`. Wynik → `02-domain/_blind/requirements.md`.
   Bramka: człowiek zatwierdza i **zamraża** zbiór.
5. **Ocena wpływu** (dopiero teraz architektura) → `docs/project/02-domain/stress/<metryka>.md` (`references/change-impact.md`).

## Wymaganie z generatora
- **Prośba** („co gdyby biznes chciał…”), **Mechanizm** (łańcuch przyczynowy do metryki), **Podstawa** (fakt z briefu lub wpis
  z przeglądu). Bez podstawy → odrzuć albo oznacz `ambitne:`.
- Zakaz słownictwa rozwiązań i przewidywania, co się zmieni w systemie.
- Różne dźwignie (reguły, oferta, ceny, presja zewnętrzna) i różna ambicja; z przeglądu konkurencji najwyżej 1/3 wymagań.
- Braki w materiale generator zgłasza zamiast zgadywać.

## Wynik i użycie
- Rozkład klas: **lokalne** (0–1 modułów) · **rozproszone** (≥ 2) · **nowy moduł** (wygrywa z pozostałymi).
- Ten sam zamrożony zbiór można puścić przeciw **innej** dekompozycji (powtarzasz tylko krok 5) — to uczciwe porównanie
  wariantów granic (ddd-strategic-analysis) i dowód do ADR.
- Bez ocen „dobrze/źle” — raport pokazuje, gdzie model się napina; decyzję podejmuje człowiek.

## Szczelność izolacji
Hook pilnuje plików, ale nie treści, którą agent dostaje inaczej: **brief w wywołaniu** (tylko metryka i ścieżki), `CLAUDE.md`
projektu (ładowany każdemu agentowi — nie opisuj w nim modułów) i sam brief (test lustra). Generator uruchamiaj zawsze jako
podagenta — w głównym wątku izolacja nie działa.

## Koszt
Brief i przegląd konkurencji robisz raz i używasz dla wielu metryk; generator na modelu std; inwentarz zdolności modułów zapisz
raz (`02-domain/stress/modules.md`) i używaj ponownie.

## Przykład
**Sytuacja:** „Software house, moduły `oferty`, `projekty`, `czas-pracy`, `fakturowanie`. Metryka zarządu: marża na projekcie.”
**Wynik** (8 wymagań na ślepo, zamrożone; fragment raportu):

| Wymaganie | Zmienione moduły | Klasa | Dlaczego |
|---|---|---|---|
| W-1 alert przy 80% budżetu godzin | projekty | lokalne | godziny tylko odczytywane |
| W-3 rezerwa na ryzyko w ryczałcie | oferty, fakturowanie | rozproszone | zmienia wycenę i fakturę końcową |
| W-7 premia od marży dla kierownika | 0 (+1 nowy) | nowy moduł | brak naturalnego miejsca |

Rozkład: lokalne 3 · rozproszone 4 · nowy moduł 1. Bez ocen — decyzja człowieka.
Więcej przykładów: `references/przyklady.md`.
