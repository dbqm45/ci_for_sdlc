# Reguły z kart modułów

## payments (szczegóły: modules/payments.md)
- The payment timeout is 45 seconds. `src/payments/gateway.ts:1` "PAYMENT_TIMEOUT_MS = 45_000" (pewność: kod)
- A declined payment is retried at most 2 times. `src/payments/gateway.ts:2` "MAX_RETRIES = 2" (pewność: kod)
- A customer can store a maximum of 5 cards. `src/payments/cards.ts:1-4` "MAX_SAVED_CARDS = 5" (pewność: test)
- The payment session lasts 10 minutes. `src/payments/gateway.ts:6` "SESSION_TTL = 600" (pewność: kod)

## Reguły przekrojowe
- Card data is stored by the payment provider [założenie: nie znaleziono zapisu numeru karty]
