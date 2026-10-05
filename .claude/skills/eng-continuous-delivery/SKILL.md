---
name: eng-continuous-delivery
description: Użyj przy sposobie dostarczania — trunk-based, małe partie, feature flags, CI/CD, metryki DORA, Twelve-Factor.
metadata:
  katalog: "Użyj przy decyzjach o sposobie dostarczania — trunk-based development, małe partie, feature flags, ciągła integracja i dostarczanie, metryki DORA, zasady Twelve-Factor App, bezpieczeństwo „shift left”. Nie do konfiguracji konkretnych narzędzi CI (ops-ci-cd) ani gita na co dzień (core-git-workflow)."
---

# Ciągłe dostarczanie

## Praktyki
- **Trunk-based development**: krótko żyjące gałęzie (≤ 1–2 dni) albo commity prosto do głównej z review w parach;
  integracja co najmniej codziennie. Długie gałęzie funkcji = ukryte ryzyko integracji.
- **Małe partie**: mały PR łatwiej zrecenzować, wdrożyć i wycofać. Duża zmiana → seria kroków, każdy wdrażalny.
- **Feature flags** oddzielają wdrożenie od udostępnienia; każda flaga ma właściciela i datę usunięcia.
- **Główna gałąź zawsze wdrażalna**: czerwony build naprawiamy przed nową pracą.
- **Branch by abstraction / expand–contract** dla dużych zmian i migracji danych (be-database).
- **Shift left**: testy, analiza statyczna, skan zależności i sekretów w pipeline, nie przed wydaniem.
- **Postmortemy bez szukania winnych**; wnioski jako zadania.

## Metryki DORA (poziom aplikacji/usługi)
| Grupa | Metryka | Definicja |
|---|---|---|
| przepustowość | czas realizacji zmiany | od commita do produkcji |
| przepustowość | częstotliwość wdrożeń | liczba wdrożeń w okresie |
| przepustowość | czas przywrócenia po nieudanym wdrożeniu | czas do naprawy wdrożenia wymagającego interwencji |
| niestabilność | odsetek nieudanych zmian | wdrożenia wymagające natychmiastowej interwencji (rollback, hotfix) |
| niestabilność | odsetek przeróbek wdrożeń | nieplanowane wdrożenia wynikające z incydentów |

Szybkość i stabilność idą w parze, nie są kompromisem. Metryki do uczenia się, **nie cele** (prawo Goodharta);
porównuj system z nim samym w czasie, nie zespoły między sobą.

## Twelve-Factor (skrót)
Jedna baza kodu, jawne zależności, konfiguracja w środowisku, usługi zewnętrzne jako podłączane zasoby, rozdzielone
build/release/run, bezstanowe procesy, port binding, skalowanie procesami, szybki start i łagodne zamykanie,
parytet środowisk, logi jako strumień zdarzeń, zadania administracyjne jako jednorazowe procesy.

## Przykład
**Sytuacja:** gałąź `feature/new-checkout` żyje 3 tygodnie, 74 pliki, konflikty przy każdym rebase.
**Wynik:** seria 5 wdrażalnych PR-ów: (1) interfejs `CheckoutFlow` nad starym koszykiem (branch by abstraction),
(2) `CheckoutFlowV2` za flagą `checkout-v2` (właściciel, data usunięcia, domyślnie wyłączona), (3) migracja *expand*,
(4) flaga dla zespołu wewnętrznego, (5) włączenie dla wszystkich i *contract* — usunięcie starego kodu i flagi.
Dalej gałęzie ≤ 1–2 dni i integracja codzienna.
Więcej przykładów: `references/przyklady.md`.
