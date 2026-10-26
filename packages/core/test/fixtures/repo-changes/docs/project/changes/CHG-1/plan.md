---
artifact: plan
phase: plan
status: accepted
version: 1
created: 2026-10-20
updated: 2026-10-21
change: CHG-1
---

# Plan zmiany CHG-1

Breaks REL-008: a foundation without "Odblokowuje" and a slice without a requirement.

| Cięcie | Rodzaj | Wydanie | Flaga | Wartość | Wymagania | Odblokowuje | Weryfikacja |
|---|---|---|---|---|---|---|---|
| TSK-1 | F-01 | R1 | — | (fundament) Retry queue is ready | — | — | the queue accepts a job |
| TSK-2 | S-01 | R1 | payment-retry | Customer retries a failed payment | — | — | |
