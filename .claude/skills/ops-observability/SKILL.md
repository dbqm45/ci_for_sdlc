---
name: ops-observability
description: Użyj przy logach, metrykach, tracingu, healthcheckach, alertach i dashboardach (OpenTelemetry, Prometheus, Grafana).
metadata:
  katalog: "Użyj przy logowaniu, metrykach, tracingu, healthcheckach, alertach i dashboardach (OpenTelemetry, Prometheus, Grafana). Nie do debugowania logiki biznesowej ani pipeline'ów CI."
  slowa: "po wdrożeniu, regresja wydajności, opóźnienia wzrosły, metryki biznesowe, adnotacje wdrożeń, alerty, dashboard"
---

# Obserwowalność

## Logi
- Strukturalne (JSON), jeden obiekt na zdarzenie: `timestamp`, `level`, `message`, `service`, `trace_id`, kontekst.
- Poziomy: `error` = wymaga działania, `warn` = nietypowe, ale obsłużone, `info` = zdarzenia biznesowe, `debug` = wyłączony na produkcji.
- Nigdy: hasła, tokeny, pełne numery kart, pełne dane osobowe. Maskuj.
- Loguj błąd raz, w miejscu obsługi — nie na każdym poziomie stosu.

## Metryki (RED + USE)
- Usługi: **R**ate, **E**rrors, **D**uration (histogram, percentyle p50/p95/p99) per endpoint.
- Zasoby: **U**tilization, **S**aturation, **E**rrors (CPU, pamięć, pula połączeń, kolejki).
- Etykiety o niskiej kardynalności — nigdy `user_id` czy pełny URL jako etykieta.

## Tracing
- OpenTelemetry; propagacja kontekstu (`traceparent`) przez HTTP i kolejki.
- `trace_id` w każdym logu, aby łączyć logi ze śladami.

## Healthchecki
- `/health/live` — proces żyje (bez zależności).
- `/health/ready` — gotowy na ruch (baza, cache osiągalne). Orkiestrator kieruje ruch tylko do „ready”.

## Alerty
- Alertuj na objawy odczuwalne przez użytkownika (SLO: odsetek błędów, latencja p95), nie na każdą przyczynę.
- Każdy alert: próg, czas trwania, link do runbooka (core-tech-docs), właściciel.
- Alert, na który nikt nie reaguje, usuń lub popraw.
- Wdrożenia jako adnotacje na dashboardach: porównanie „przed / po” (błędy, p95, kluczowa akcja biznesowa, np. liczba
  zamówień) przez pierwsze minuty po wydaniu; skok latencji z 200 ms do 5 s bez błędów to też awaria.

## Zasoby, które rosną powoli (dysk, certyfikaty)
Awarie „znikąd” najczęściej mają przyczynę, która rosła tygodniami. Alarmujesz o **trendzie**, nie dopiero o 100%.
- **Dysk** (węzły, wolumeny, bazy): próg ostrzegawczy (np. 80%) i alert z prognozy — Prometheus:
  `predict_linear(node_filesystem_avail_bytes[6h], 24*3600) < 0` (zapełni się w ciągu doby); dla wolumenów w
  Kubernetes `kubelet_volume_stats_available_bytes`. Sprawdzaj też i-węzły (`node_filesystem_files_free`).
- **Rotacja logów** skonfigurowana i sprawdzona: Docker `--log-opt max-size=… max-file=…` (sterownik `json-file`),
  kubelet `containerLogMaxSize`, `logrotate` na maszynach; pliki tymczasowe, stare kopie i obrazy sprzątane zadaniem
  z alertem, gdy zadanie przestanie działać. Pod w Kubernetes ma `ephemeral-storage` w requests/limits.
- **Certyfikaty TLS**: odnawianie automatyczne (cert-manager, ACME) **i** niezależny pomiar z zewnątrz, bo automat też
  się psuje — np. blackbox_exporter `probe_ssl_earliest_cert_expiry - time() < 21*86400` (ostrzeżenie), 7 dni (pilne);
  w cert-manager `certmanager_certificate_expiration_timestamp_seconds`. Obejmij też certyfikaty wewnętrzne (mTLS,
  webhooki Kubernetes, bazy, kolejki). Ważność publicznych certyfikatów maleje (CA/B Forum: 200 dni od 15.03.2026,
  100 dni od 2027, 47 dni od 2029) — ręczne odnawianie przestaje być realne.
- Inne liczniki z datą końca: tokeny i klucze kont usług, domeny, licencje, limity planu (ops-secrets-identities).

## Koszt telemetrii
- Najpierw ustal, na jakie pytania telemetria ma odpowiadać, potem tnij. Każda reguła próbkowania lub odrzucania
  danych to zapisana decyzja — cięcie „na ślepo” zostawia martwe pola akurat tam, gdzie będą potrzebne przy incydencie.
- Potok w OpenTelemetry Collector: filtrowanie i odrzucanie szumu, parsowanie do struktury, maskowanie danych
  osobowych, próbkowanie śladów (np. zachowuj wszystkie z błędem i wolne, z reszty próbkę), agregacja przy przyjęciu.
- Etykieta o wysokiej kardynalności (ID użytkownika, pełny URL) tylko wtedy, gdy napędza alert lub decyzję.
- Dane o niskiej wartości do taniego magazynu obiektowego zamiast indeksowanego backendu; stare dane zwijane (rollup).
- Jeden kolektor na warstwę — bez zbierania tych samych danych dwa razy; interwały scrapowania dopasowane do potrzeb.
- Źródła (devops.com): [The Green Side of Observability](https://devops.com/the-green-side-of-observability-why-less-data-can-mean-more-insight/),
  [Observability's Gaslighting Problem](https://devops.com/observabilitys-gaslighting-problem-send-less-data-isnt-a-strategy/),
  [Maximize Telemetry Data Value With Observability Pipelines](https://devops.com/how-to-maximize-telemetry-data-value-with-observability-pipelines/)

## Sygnały bezpieczeństwa
Logi aplikacji i metryki to też materiał dowodowy. Warto alarmować (wnioski z analiz Huntress):
- **proces aplikacji uruchamia proces potomny** (powłokę, `curl`, instalator) — typowy ślad po podatności typu RCE;
- nowe wpisy cron, usługi systemd lub zadania harmonogramu, których nie dodał pipeline;
- trwałe, nietypowe obciążenie CPU (koparki kryptowalut) i połączenia do nieznanych hostów, zwłaszcza długie WebSockety;
- wydanie lub odświeżenie tokenu użytkownika z zakresów adresów centrów danych i PaaS, odświeżanie o stałych porach
  (automat), sprzeczny user agent (be-auth-security).
Zasady: loguj linie poleceń i zdarzenia uwierzytelniania; trzymaj logi poza maszyną (napastnicy kasują lokalne logi
i historię powłoki); retencja wystarczająca, żeby odpowiedzieć, czy ktoś miał dostęp. Agent, który zauważy takie
sygnały, zgłasza je człowiekowi (core-agent-security).

## Przykład
**Sytuacja:** „Alerty dla `checkout-api`; SLO: 99,5% żądań bez 5xx.” **Wynik** (reguła Prometheus):
```yaml
- alert: CheckoutApiHighErrorRate
  expr: sum(rate(http_requests_total{service="checkout-api",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="checkout-api"}[5m])) > 0.005
  for: 10m
  labels: { severity: page, team: checkout }
  annotations: { runbook_url: "https://wiki.acme.example/runbooks/checkout-api#bledy-5xx" }
```
Objaw z SLO zamiast przyczyny, czas trwania, właściciel i runbook; p95 to drugi alert.
Więcej przykładów: `references/przyklady.md`.

## Checklista dla nowej usługi
- [ ] logi strukturalne z trace_id
- [ ] metryki RED
- [ ] live/ready healthcheck
- [ ] co najmniej jeden alert SLO z runbookiem
- [ ] zdarzenia uwierzytelniania i procesy potomne aplikacji logowane poza maszyną
- [ ] alert z prognozy zapełnienia dysku, rotacja logów sprawdzona
- [ ] niezależny pomiar wygasania certyfikatów (21 i 7 dni)
- [ ] wdrożenia jako adnotacje na dashboardach

## Źródła
- [10 Minor DevOps Mistakes That Can Cause Major Production Issues](https://medium.com/coinmonks/10-minor-devops-mistakes-that-can-cause-major-production-issues-191d141e7686) — Pawan Natekar, 2026 (dysk, certyfikaty, monitoring po wdrożeniu); metryki: dokumentacja node_exporter, blackbox_exporter, cert-manager i Kubernetes.
