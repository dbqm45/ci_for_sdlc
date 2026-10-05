# PII Redaction

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/pii-redaction.

## Metadane

Kategoria: Security. Poziom: Advanced. Framework: Native web. Autor: Den Odell. Data aktualizacji:
17 czerwca 2026.

## TLDR

Usuwaj/maskuj dane wrażliwe na granicy aplikacji, przed wysłaniem do logów, analityki czy error
reporterów — najbezpieczniejsza wartość to ta, którą nigdy nie zebrałeś.

## Uwagi (stan 2026, poprawki względem źródła)

- Logger przykładowy używa `process.stdout` (Node/SSR); w przeglądarce ten sam redaktor podpinasz do transportu
  logów/telemetrii (np. `beforeSend` Sentry, `beforeSendTransaction`, procesory OpenTelemetry — ops-observability).
- Nie wysyłaj PII w URL-ach (query string trafia do logów serwerów, historii, `Referer`) — ustaw
  `Referrer-Policy: strict-origin-when-cross-origin` (domyślna w nowych przeglądarkach).
- Session replay (Sentry Replay, LogRocket…) — domyślnie maskuj wszystkie pola i tekst, odmaskowuj wybiórczo.

## Problem

Wrażliwe dane użytkowników (hasła, numery kart, tokeny, e-maile) trafiają do systemów zewnętrznych
przez logi, raporty błędów i narzędzia analityczne. Dane, które nigdy nie miały opuszczać
przeglądarki, siedzą w dashboardzie stron trzecich dostępnym dla dziesiątek osób. Wycieki powstają
szczególnie, gdy dane rozprzestrzeniają się przez wiele systemów bez scentralizowanej kontroli.

## Rozwiązanie

Redakcja na granicy aplikacji — przed transmisją danych:

1. **Allow-list** zamiast deny-list (fail-closed: nowe pola domyślnie redagowane).
2. **Centralizacja redaktora** — jedno miejsce dla wszystkich sinków (logi, error reporting,
   analytics).
3. **Pattern matching** jako warstwa bezpieczeństwa dla wolnego tekstu (stack trace'y, wiadomości).
4. **Haki integracyjne** — np. Sentry `beforeSend`, wrappery dla logowania.

## Przykłady kodu

### Redaktor rdzeniowy (vanilla JS)

```javascript
const SENSITIVE_KEYS = new Set([
  'password', 'pwd', 'token', 'accessToken', 'refreshToken',
  'authorization', 'cookie', 'ssn', 'creditCard', 'cardNumber',
  'cvv', 'email', 'phone',
]);

const PATTERNS = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'],
  [/\b(?:\d[ -]*?){13,16}\b/g, '[CARD]'],
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]'],
  [/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[TOKEN]'],
];

function redactString(value) {
  return PATTERNS.reduce((acc, [pattern, label]) => acc.replace(pattern, label), value);
}

function redact(input, { allowList } = {}) {
  if (typeof input === 'string') return redactString(input);
  if (Array.isArray(input)) return input.map((item) => redact(item, { allowList }));
  if (input && typeof input === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      if (allowList && !allowList.has(key)) {
        output[key] = '[REDACTED]';
      } else if (SENSITIVE_KEYS.has(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = redact(value, { allowList });
      }
    }
    return output;
  }
  return input;
}

export { redact };
```

### Integracja Sentry (`beforeSend` hook)

```javascript
import * as Sentry from '@sentry/browser';
import { redact } from './redact';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event) {
    if (event.request) {
      event.request.data = redact(event.request.data);
      event.request.headers = redact(event.request.headers);
      event.request.cookies = '[REDACTED]';
    }

    if (event.extra) {
      event.extra = redact(event.extra);
    }

    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        data: crumb.data ? redact(crumb.data) : crumb.data,
      }));
    }

    return event;
  },
});
```

### Logowanie strukturalne z allow-list

```javascript
import { redact } from './redact';

const SAFE_KEYS = new Set([
  'level', 'message', 'timestamp', 'requestId', 'userId',
  'route', 'method', 'statusCode', 'durationMs',
]);

function write(level, message, context = {}) {
  const record = {
    level,
    message: redact(message),
    timestamp: new Date().toISOString(),
    ...redact(context, { allowList: SAFE_KEYS }),
  };

  process.stdout.write(JSON.stringify(record) + '\n');
}

const logger = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
};

logger.error('Checkout failed', {
  userId: 'u_123',
  route: '/checkout',
  email: 'user@example.com',
  cardNumber: '4111 1111 1111 1111',
});
// {"level":"error","message":"Checkout failed","timestamp":"...",
//  "userId":"u_123","route":"/checkout","email":"[REDACTED]","cardNumber":"[REDACTED]"}

export { logger };
```

## Zalety

- Wrażliwe wartości nigdy nie opuszczają przeglądarki w stronę systemów zewnętrznych.
- Allow-list automatycznie redaguje nowe pola (fail-closed) — nowe, niewymienione pole jest
  bezpieczne z definicji.
- Jednolita definicja danych wrażliwych dla wszystkich sinków (logi, error reporting, analytics).
- Wspiera zgodność GDPR/CCPA — brak wrażliwych danych w niekontrolowanych systemach.
- Zmniejsza szkody po wycieku — baza możliwa do wykorzystania przez atakującego jest znacznie
  bardziej pusta.
- Zachowuje wartość diagnostyczną rekordów (nazwy pól, strukturę) — redaguje wartości, nie
  wywala całych rekordów.
- Pattern matching wychwytuje PII w wolnym tekście (stack trace'y, wiadomości błędów).

## Wady / tradeoffs

- **Over-redaction** — każdy log staje się `[REDACTED]`, utrudniając diagnozę podczas incydentów.
- **Niedoskonałe wzorce** — międzynarodowe formaty numerów bywają omijane, zdarzają się fałszywe
  alarmy na zwykłych ciągach.
- **Koszt wydajności** — głębokie klonowanie i skanowanie przy każdym logowaniu.
- **Utrzymanie** — listy wymagają aktywnej synchronizacji z rozwojem architektury/pól danych.
- **Dyscyplina allow-list** — każde przydatne pole musi być jawnie wymienione, inaczej przepada.
- **Punkt awarii** — błąd w redaktorze wpływa na wszystkie sinki równocześnie.
- **Ukryte struktury** — JSON zserializowany wewnątrz stringów, blob'y base64 mogą przemycić PII
  niezauważone.
- **Nie zastępuje zapobiegania** — najbezpieczniejsza wartość to ta, którą nigdy nie zebrałeś.
- **Trzecie strony** — SDK zewnętrzne mogą zbierać dane z pominięciem Twoich haków redakcji.

## Powiązane wzorce

- Error Handling — Resilience (`../resilience/error-handling.md`)
- Zewnętrzne: [PII / GDPR](https://gdpr.eu/eu-gdpr-personal-data/),
  [Information exposure — OWASP](https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url),
  [CCPA Compliance — California AG](https://oag.ca.gov/privacy/ccpa)

## Kiedy używać / kiedy NIE używać

Wprowadź redaktora **zawsze**, gdy aplikacja wysyła dane do jakiegokolwiek systemu trzeciego (error
reporting, analytics, logi scentralizowane) — to nie jest wzorzec „na potem”, to podstawowy
wymóg zgodności (GDPR/CCPA) w większości jurysdykcji. Zacznij od najprostszej wersji: allow-list na
kluczach dla danych strukturalnych — dodawaj pattern matching dla wolnego tekstu tylko, jeśli
realnie logujesz surowe wiadomości/stack trace'y, które mogą zawierać PII (nie dodawaj tego z góry
„na wszelki wypadek”, zgodnie z YAGNI z `../principles.md`, bo over-redaction ma realny
koszt diagnostyczny podczas incydentów).
