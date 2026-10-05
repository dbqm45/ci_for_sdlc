# Przykłady obserwowalności

> **Spis treści:** 1. Alerty SLO dla nowej usługi · 2. Dysk i certyfikaty — alert z trendu · 3. Log, który da się przeszukać i połączyć ze śladem

Nazwy metryk aplikacji (`http_requests_total`, `http_request_duration_seconds`) są przykładowe — użyj tych, które
eksportuje Twoja biblioteka. Progi to wartości z przykładowego SLO.

## 1. Alerty SLO dla nowej usługi
**Sytuacja:** „Dodaj alerty dla `checkout-api`. SLO: 99,5% żądań bez błędu 5xx i p95 poniżej 500 ms.”

**Jak:**
1. Alertuj na objawy z SLO (odsetek błędów, p95), nie na CPU czy restarty podów.
2. Metryki RED per endpoint, etykiety o niskiej kardynalności (`route`, nie pełny URL).
3. Każdy alert: próg, czas trwania (`for`), właściciel, link do runbooka.
4. Sprawdź, czy alert ma kto obsłużyć — inaczej go nie dodawaj.

**Wynik:** `alerts/checkout-api.yml`
```yaml
groups:
  - name: checkout-api-slo
    rules:
      - alert: CheckoutApiHighErrorRate
        expr: |
          sum(rate(http_requests_total{service="checkout-api", status=~"5.."}[5m]))
            /
          sum(rate(http_requests_total{service="checkout-api"}[5m]))
            > 0.005
        for: 10m
        labels:
          severity: page
          team: checkout
        annotations:
          summary: "checkout-api: ponad 0,5% odpowiedzi 5xx od 10 min"
          runbook_url: https://wiki.acme.example/runbooks/checkout-api#bledy-5xx
      - alert: CheckoutApiSlowP95
        expr: |
          histogram_quantile(0.95,
            sum by (le, route) (rate(http_request_duration_seconds_bucket{service="checkout-api"}[5m]))
          ) > 0.5
        for: 15m
        labels:
          severity: ticket
          team: checkout
        annotations:
          summary: "checkout-api {{ $labels.route }}: p95 powyżej 500 ms od 15 min"
          runbook_url: https://wiki.acme.example/runbooks/checkout-api#latencja
```
Na dashboardzie te same zapytania plus adnotacje wdrożeń — porównanie „przed / po” w pierwszych minutach wydania.

## 2. Dysk i certyfikaty — alert z trendu
**Sytuacja:** W zeszłym miesiącu baza stanęła, bo zapełnił się wolumen, a tydzień później wygasł certyfikat
wewnętrznego webhooka. Oba problemy rosły tygodniami.

**Jak:**
1. Dysk: próg 80% jako ostrzeżenie i prognoza `predict_linear` na dobę jako alert; osobno i-węzły.
2. Certyfikaty: niezależny pomiar z zewnątrz (blackbox_exporter), progi 21 i 7 dni — także dla certyfikatów wewnętrznych.
3. Runbook i właściciel przy każdej regule.

**Wynik:** `alerts/slow-growth.yml`
```yaml
groups:
  - name: slow-growth
    rules:
      - alert: FilesystemFullIn24h
        expr: predict_linear(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}[6h], 24*3600) < 0
        for: 30m
        labels:
          severity: page
          team: platform
        annotations:
          summary: "{{ $labels.instance }} {{ $labels.mountpoint }}: dysk zapełni się w ciągu doby"
          runbook_url: https://wiki.acme.example/runbooks/disk-full
      - alert: FilesystemInodesLow
        expr: node_filesystem_files_free{fstype!~"tmpfs|overlay"} / node_filesystem_files < 0.10
        for: 30m
        labels:
          severity: ticket
          team: platform
        annotations:
          summary: "{{ $labels.instance }} {{ $labels.mountpoint }}: mniej niż 10% wolnych i-węzłów"
          runbook_url: https://wiki.acme.example/runbooks/disk-full#i-wezly
      - alert: CertExpiresIn21Days
        expr: probe_ssl_earliest_cert_expiry - time() < 21*86400
        for: 1h
        labels:
          severity: ticket
          team: platform
        annotations:
          summary: "{{ $labels.instance }}: certyfikat wygasa za mniej niż 21 dni"
          runbook_url: https://wiki.acme.example/runbooks/tls-renewal
      - alert: CertExpiresIn7Days
        expr: probe_ssl_earliest_cert_expiry - time() < 7*86400
        for: 1h
        labels:
          severity: page
          team: platform
        annotations:
          summary: "{{ $labels.instance }}: certyfikat wygasa za mniej niż 7 dni — automat odnawiania zawiódł"
          runbook_url: https://wiki.acme.example/runbooks/tls-renewal
```
Lista celów blackbox_exportera obejmuje też webhooki Kubernetes, bazę i kolejkę z mTLS, a nie tylko domeny publiczne.

## 3. Log, który da się przeszukać i połączyć ze śladem
**Sytuacja:** Przy incydencie nie dało się znaleźć nieudanych płatności: logi to zdania tekstem, ten sam błąd zapisany
trzy razy na różnych poziomach stosu, a w jednym z nich pełny token.

**Jak:**
1. Jeden obiekt JSON na zdarzenie z `timestamp`, `level`, `message`, `service`, `trace_id` i kontekstem.
2. Błąd logowany raz — w miejscu obsługi, nie w repozytorium, serwisie i kontrolerze.
3. Token i dane osobowe maskowane; `user_id` w logu tak, ale nie jako etykieta metryki.
4. `trace_id` z kontekstu OpenTelemetry, żeby przejść z logu do śladu.

**Wynik:** przed (trzy linie, jedna z sekretem):
```text
ERROR PaymentRepository: payment failed
ERROR PaymentService: payment failed for user jan.kowalski@example.com token=tok_live_8f3a…
ERROR PaymentController: Error: payment failed
```
po (jedna linia):
```json
{"timestamp": "2026-10-05T10:14:52.120Z", "level": "error", "message": "payment authorization declined", "service": "checkout-api", "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736", "route": "POST /payments", "user_id": "u_18842", "provider": "acquirer-a", "reason": "insufficient_funds", "card": "**** 4242", "duration_ms": 812}
```
Zapytanie przy incydencie: `level="error" AND service="checkout-api" AND reason="insufficient_funds"`, a z `trace_id`
od razu do śladu, który pokaże, w którym wywołaniu zewnętrznym minęło 812 ms.
