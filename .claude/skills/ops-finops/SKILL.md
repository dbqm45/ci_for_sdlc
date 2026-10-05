---
name: ops-finops
description: Użyj przy kosztach chmury — tagi, koszt w PR (Infracost), budżety i alerty, sprzątanie, rozmiar, koszt jednostkowy.
metadata:
  katalog: "Użyj, gdy zmiana wpływa na koszty chmury albo trzeba je obniżyć — tagi właściciela, koszt w PR (Infracost), budżety i alerty, sprzątanie nieużywanych zasobów, dopasowanie rozmiaru, polityki kosztowe jako kod, czas życia środowisk, koszt jednostkowy. Nie do samego pisania Terraform (ops-iac-terraform) ani kosztu telemetrii (ops-observability)."
---

# FinOps dla inżynierów

Koszt to atrybut jakości jak wydajność: decyzja o nim zapada w PR, a nie na kwartalnym przeglądzie faktury.

## 1. Własność
- Każdy zasób ma tagi `team`, `env`, `project` (i `expires` dla tymczasowych). Brak tagu blokuje plan — polityka,
  nie strona w wiki.
- Koszty widoczne per zespół i usługa; zespół, który tworzy zasób, widzi jego rachunek.

## 2. Koszt przed wdrożeniem
- Infracost (lub odpowiednik) komentuje każdy PR z Terraform/OpenTofu różnicą kosztu miesięcznego.
- Polityki kosztowe jako kod (OPA/Conftest, Sentinel) w warstwach: tanie wartości domyślne w modułach i szablonach,
  ostrzeżenie przy ryzykownych wyborach, twarda blokada tylko dla oczywistego marnotrawstwa (np. najdroższe klasy
  instancji poza produkcją).
- Środowiska nieprodukcyjne: lista dozwolonych rozmiarów, obowiązkowy czas życia (ops-release-engineering, sekcja 5).

## 3. Budżety i anomalie
- Budżety per zespół i środowisko z alertami przy 80%, 100% i 120%.
- Wykrywanie anomalii kosztowych dostawcy (np. AWS Cost Anomaly Detection) z powiadomieniem właściciela.

## 4. Sprzątanie i dopasowanie rozmiaru
Cotygodniowy przegląd, właściciel dostaje 7 dni na sprzeciw, potem usunięcie:
- maszyny z CPU < 5% przez 30 dni, niepodpięte dyski, migawki starsze niż 90 dni, load balancery bez celów;
- zasoby wykorzystane poniżej 40% przez 30 dni — zmniejszenie, chyba że właściciel uzasadni rozmiar.
W Kubernetes: żądania zasobów (requests) z rzeczywistego zużycia, a nie z zapasu (ops-kubernetes); Kubecost lub
OpenCost pokazuje koszt per namespace.

## 5. Miary
Koszt jednostkowy (na klienta, na transakcję, na wdrożenie) i odsetek marnotrawstwa mówią więcej niż suma faktury —
rosnący rachunek przy rosnącym ruchu bywa zdrowy.

## Agent a koszty
Agent pokazuje różnicę kosztu w opisie zmiany infrastruktury; nie usuwa zasobów „nieużywanych” bez akceptacji
właściciela i człowieka (usuwanie to operacja nieodwracalna).

## Przykład
**Sytuacja:** PR w Terraform powiększa `orders-db` i dodaje bazę w `preview`; Infracost: +1 240 USD/mies.
**Wynik** (fragment opisu PR):
```text
| Zasób             | Różnica | Uwagi                                    |
| orders-db (prod)  | +610    | CPU p95 = 85% od 3 tyg. — uzasadnione    |
| orders-preview-db | +630    | WARN: klasa spoza listy dla env=preview  |
Decyzja: preview → najmniejsza dozwolona klasa (+90), tag expires=2026-11-15; razem +700 USD/mies.
```
Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] tagi właściciela wymuszane polityką
- [ ] różnica kosztu w PR
- [ ] budżety z alertami 80/100/120%
- [ ] cotygodniowe sprzątanie z okresem na sprzeciw
- [ ] koszt jednostkowy śledzony

## Źródła (devops.com)
- [FinOps Meets DevOps: Engineering Cost Ownership in 2026](https://devops.com/finops-meets-devops-engineering-cost-ownership-in-2026/)
- [Policy as Code for Cost Control, Not Just Compliance](https://devops.com/policy-as-code-for-cost-control-not-just-compliance/)
