# Przykłady wydań

> **Spis treści:** 1. Canary z bramkami w Argo Rollouts · 2. Zmiana nazwy kolumny przez expand–contract · 3. Zmiana awaryjna przy włączonym GitOps

Liczby w scenariuszach są ilustracyjne; progi bramek zawsze bierzesz z SLO danej usługi (ops-sre-incidents).

## 1. Canary z bramkami w Argo Rollouts
**Sytuacja:** „Nowy ranking w `search-api` przeszedł staging, ale staging nie ma prawdziwego ruchu ani pełnego indeksu.
Chcemy wydać bez ryzyka dla wszystkich użytkowników”. SLO: błędy < 0,1%, p99 < 200 ms.

**Jak:**
1. Wybór strategii (sekcja 1): staging nie odtwarza produkcji → canary.
2. Drabina 5% → 25% → 50% → 100%, najdłuższa obserwacja na pierwszym kroku (15 min).
3. Bramki z metryk wersji kanarkowej, progi z SLO; przekroczenie = automatyczne wycofanie.
4. `revisionHistoryLimit` zostawia poprzednie ReplicaSety, a obraz przypięty digestem (sekcja 6a).
5. Agent przygotowuje PR w repozytorium GitOps; promocję na produkcję zatwierdza człowiek (sekcja 7).

**Wynik:** plan i manifesty.

| Krok | Ruch | Obserwacja | Bramka (canary) | Gdy przekroczona |
|---|---|---|---|---|
| 1 | 5% | 15 min | błędy 5xx < 0,1%, p99 < 200 ms | automatyczne wycofanie do 0% |
| 2 | 25% | 10 min | jak wyżej | automatyczne wycofanie |
| 3 | 50% | 10 min | jak wyżej | automatyczne wycofanie |
| 4 | 100% | — | analiza w tle do końca rolloutu | — |

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: search-api
  namespace: search
spec:
  replicas: 10
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: search-api
  template:
    metadata:
      labels:
        app: search-api
    spec:
      containers:
        - name: search-api
          image: registry.example.com/search-api@sha256:3f1c0d9e8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e
          ports:
            - containerPort: 8080
  strategy:
    canary:
      canaryService: search-api-canary
      stableService: search-api-stable
      trafficRouting:
        nginx:
          stableIngress: search-api
      analysis:
        startingStep: 1
        templates:
          - templateName: search-api-slo
        args:
          - name: service
            value: search-api
      steps:
        - setWeight: 5
        - pause: {duration: 15m}
        - setWeight: 25
        - pause: {duration: 10m}
        - setWeight: 50
        - pause: {duration: 10m}
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: search-api-slo
  namespace: search
spec:
  args:
    - name: service
  metrics:
    - name: error-rate
      interval: 1m
      failureLimit: 2
      successCondition: result[0] < 0.001
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_requests_total{service="{{args.service}}",track="canary",code=~"5.."}[5m]))
            /
            sum(rate(http_requests_total{service="{{args.service}}",track="canary"}[5m]))
    - name: p99-latency
      interval: 1m
      failureLimit: 2
      successCondition: result[0] < 0.2
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            histogram_quantile(0.99, sum by (le) (
              rate(http_request_duration_seconds_bucket{service="{{args.service}}",track="canary"}[5m])))
```
W opisie PR: „Bramki: błędy < 0,1%, p99 < 200 ms; trzy nieudane pomiary = wycofanie. Mierzymy czas od wykrycia
do wycofania”.

## 2. Zmiana nazwy kolumny przez expand–contract
**Sytuacja:** „Zmień `customers.phone` na `phone_e164` i dodaj indeks po nowej kolumnie — w jednym PR, będzie szybciej”.
Tabela ma kilkadziesiąt milionów wierszy, wdrożenie jest rolling (stara i nowa wersja działają razem).

**Jak:**
1. Rozbij na trzy wydania (sekcja 4) — jeden PR łamałby starą wersję aplikacji w trakcie rollingu.
2. Każda migracja idempotentna i zgodna z dwiema wersjami aplikacji.
3. Indeks z `CONCURRENTLY`, bo linter DDL w CI zablokuje wersję blokującą tabelę.
4. Backfill i migrację testujesz na danych o rozmiarze produkcyjnym (be-database).
5. Wydanie 3 oznaczasz w PR jako nieodwracalne (sekcja 6a).

**Wynik:** plan wydań.

| Wydanie | Schemat | Aplikacja | Wycofanie |
|---|---|---|---|
| v2.14.0 (expand) | `ADD COLUMN IF NOT EXISTS phone_e164 text`; indeks `CONCURRENTLY`; backfill partiami po 10 000 wierszy | zapis do obu kolumn, odczyt ze starej | `git revert`, kolumna zostaje (nieszkodliwa) |
| v2.15.0 (przełączenie) | bez zmian | odczyt z `phone_e164`, zapis nadal do obu | revert do v2.14.0, dane spójne |
| v2.16.0 (contract) | `DROP COLUMN IF EXISTS phone` | tylko `phone_e164` | **nieodwracalne** — naprawa w przód lub kopia |

```sql
-- V2_14_0__expand_phone_e164.sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_e164 text;
CREATE INDEX CONCURRENTLY IF NOT EXISTS customers_phone_e164_idx ON customers (phone_e164);
```

## 3. Zmiana awaryjna przy włączonym GitOps
**Sytuacja:** incydent o 2:40 — `checkout-api` wyczerpuje pulę połączeń z bazą. Dyżurny chce od razu zwiększyć
`DB_POOL_SIZE` z 20 do 40 przez `kubectl edit`, a Argo CD ma włączoną samonaprawę.

**Jak:**
1. Wpis w dzienniku incydentu: kto, co, dlaczego (sekcja 6b).
2. Jawnie wyłącz samonaprawę tylko dla tej aplikacji — inaczej Argo CD cofnie zmianę po kilku minutach.
3. Zmiana ręczna, obserwacja metryk puli.
4. Ta sama zmiana jako PR w repozytorium konfiguracji w ciągu jednego dnia roboczego.
5. Po scaleniu przywróć samonaprawę; sprawdź, że Argo CD nie pokazuje dryfu.

**Wynik:** stan aplikacji Argo CD w trakcie incydentu i oś czasu.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: checkout-api-prod
  namespace: argocd
spec:
  project: checkout
  source:
    repoURL: https://git.example.com/platform/gitops-config.git
    targetRevision: main
    path: apps/checkout-api/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: checkout
  syncPolicy:
    automated:
      prune: true
      selfHeal: false  # INC-2291: wstrzymane na czas zmiany awaryjnej, przywrócić po scaleniu PR
```

| Czas | Działanie | Kto |
|---|---|---|
| 02:45 | wpis w INC-2291, `selfHeal: false` dla `checkout-api-prod` | dyżurny |
| 02:48 | `DB_POOL_SIZE=40` ręcznie, błędy wracają do normy | dyżurny |
| 10:30 | PR „fix(checkout): DB_POOL_SIZE 40” w `gitops-config` | właściciel usługi |
| 11:15 | scalenie, `selfHeal: true`, brak dryfu w Argo CD | właściciel usługi |
