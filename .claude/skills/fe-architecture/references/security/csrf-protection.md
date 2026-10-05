# CSRF Protection

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/csrf-protection.

## Metadane

Kategoria: Security. Poziom: Advanced. Frameworki: React, Vue, Svelte, Native Web. Autor: Den Odell.
Data aktualizacji: 16 czerwca 2026.

## TLDR

Wymuszaj niedogadalny, losowy token per-sesję na każdym żądaniu zmieniającym stan, walidowany po
stronie serwera przed wykonaniem pracy — dodaj `SameSite` cookies jako drugą warstwę.

## Uwagi (stan 2026, poprawki względem źródła)

- Dodatkowa, tania warstwa 2026: **Fetch Metadata** — serwer odrzuca żądania zmieniające stan z
  `Sec-Fetch-Site: cross-site` (oraz sprawdza `Origin`). Wspierane we wszystkich głównych przeglądarkach.
- Ciasteczko sesji z prefiksem `__Host-` (wymusza `Secure`, `Path=/`, brak `Domain`) utrudnia nadpisanie z subdomeny —
  ważne dla double-submit.
- Nie zakładaj, że `SameSite=Lax` jest domyślne — to zachowanie Chromium, nie wszystkich przeglądarek
  (samesite-cookie.md).
- Wiele frameworków ma to wbudowane: Angular `HttpClient` automatycznie odsyła token z ciasteczka `XSRF-TOKEN` w
  nagłówku `X-XSRF-TOKEN` (`withXsrfConfiguration`) — fw-angular. Serwerowa strona — be-auth-security.
- Przykład Svelte: `<script context="module">` to Svelte 4; w Svelte 5 `<script module>`.

## Problem

Ataki CSRF wykorzystują automatyczne dołączanie cookies przez przeglądarki. Gdy zalogowany
użytkownik odwiedzi złośliwą stronę, może ona wysłać w jego imieniu żądanie zmieniające stan
(transfer, zmiana hasła). Serwer odbiera prawidłowo uwierzytelnione żądanie, bo cookies są
dołączone, ale użytkownik nigdy nie wydał takiego polecenia. Atakujący nigdy nie widzi odpowiedzi i
nie czyta żadnych danych — potrzebuje tylko, żeby ofiara załadowała stronę, podczas gdy aktywna
sesja istnieje w przeglądarce.

## Rozwiązanie

Trzy uzupełniające się mechanizmy:

1. **Synchronizer Token Pattern** — token przechowywany po stronie serwera, przekazywany klientowi
   (meta tag albo endpoint), odsyłany w nagłówku `X-CSRF-Token` na każdym żądaniu POST/PUT/PATCH/DELETE.
2. **Double-Submit Cookie Pattern** — serwer ustawia token w ciasteczku czytelnym dla JS, klient
   kopiuje wartość do nagłówka; atakujący może wysłać ciasteczko, ale nie może odczytać jego
   zawartości z innej domeny.
3. **Warstwa `SameSite`** — `SameSite=Lax`/`Strict` na ciasteczku sesji jako dodatkowa ochrona,
   uniemożliwiająca załączanie go do żądań cross-site (patrz `samesite-cookie.md`).

## Przykłady kodu

### Client-side token attachment — React

```javascript
import { useCallback } from 'react';

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function useCsrfFetch() {
  return useCallback((url, options = {}) => {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);

    if (UNSAFE_METHODS.has(method)) {
      headers.set('X-CSRF-Token', getCsrfToken());
    }

    return fetch(url, { ...options, headers, credentials: 'same-origin' });
  }, []);
}

function TransferButton() {
  const csrfFetch = useCsrfFetch();

  const handleTransfer = () =>
    csrfFetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100 }),
    });

  return <button onClick={handleTransfer}>Transfer $100</button>;
}
```

### Client-side token attachment — Vue

```vue
<script setup>
function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfFetch(url, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (UNSAFE_METHODS.has(method)) {
    headers.set('X-CSRF-Token', getCsrfToken());
  }

  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}

function handleTransfer() {
  return csrfFetch('/api/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  });
}
</script>

<template>
  <button @click="handleTransfer">Transfer $100</button>
</template>
```

### Client-side token attachment — Svelte

```svelte
<script context="module">
  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
  }

  const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  export function csrfFetch(url, options = {}) {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);

    if (UNSAFE_METHODS.has(method)) {
      headers.set('X-CSRF-Token', getCsrfToken());
    }

    return fetch(url, { ...options, headers, credentials: 'same-origin' });
  }
</script>

<script>
  function handleTransfer() {
    return csrfFetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100 }),
    });
  }
</script>

<button on:click={handleTransfer}>Transfer $100</button>
```

### Client-side token attachment — Web Components

```javascript
function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfFetch(url, options = {}) {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (UNSAFE_METHODS.has(method)) {
    headers.set('X-CSRF-Token', getCsrfToken());
  }

  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}

class TransferButton extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<button>Transfer $100</button>`;
    this.querySelector('button').addEventListener('click', () =>
      csrfFetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100 }),
      })
    );
  }
}

customElements.define('transfer-button', TransferButton);
```

### Reading the token from a cookie (Double-Submit Pattern)

```javascript
function getCookie(name) {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')[1] ?? '';
}

function csrfFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('X-CSRF-Token', getCookie('csrf_token'));
  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}
```

### Server-side issuing and validation (Express)

```javascript
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
app.use(cookieParser());
app.use(express.json());

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Issue a token cookie if one isn't already present.
app.use((req, res, next) => {
  if (!req.cookies.csrf_token) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf_token', token, {
      sameSite: 'lax',
      secure: true,
      // Readable by JS so the client can echo it back in the header.
      httpOnly: false,
    });
    req.cookies.csrf_token = token;
  }
  next();
});

// Reject unsafe requests whose header doesn't match the cookie.
app.use((req, res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies.csrf_token;
  const headerToken = req.get('X-CSRF-Token');

  const valid =
    cookieToken &&
    headerToken &&
    cookieToken.length === headerToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));

  if (!valid) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
});

app.post('/api/transfer', (req, res) => {
  // Reaching here means the CSRF check passed.
  res.json({ status: 'ok', amount: req.body.amount });
});

app.listen(3000);
```

Uwaga: `crypto.timingSafeEqual` zamiast `===` zapobiega wyciekom informacji na podstawie czasu
porównania — patrz też be-auth-security (sekcja o timing
attacks). Dla wzorca synchronizer token przechowuj go w `req.session.csrfToken`.

## Zalety

- Żądania z trzecich stron są odrzucane, bo atakujący nie posiada ważnego tokenu.
- Ochrona konkretnych niebezpiecznych operacji (transfery, zmiana hasła, usunięcie konta).
- Same-origin policy odrabia ciężką pracę — token musi być niedogadalny, nie zaszyfrowany.
- Naturalne łączenie z `SameSite` cookies dla warstwowej obrony.
- Strona kliencka to cienka otoczka wokół `fetch`, pisana raz i używana wszędzie.
- Wariant double-submit nie wymaga magazynu sesji po stronie serwera — łatwiej skalować.
- Niepowodzenia walidacji są widoczne i głośne (HTTP 403) — łatwo złapać błędy konfiguracji.

## Wady / tradeoffs

- Każde żądanie zmieniające stan nosi bagaż tokenowy; zapomniane nagłówki powodują ciche błędy.
- Serwer musi generować, przechowywać i bezpiecznie porównywać tokeny — dodaje kwestie kryptografii.
- Legalni klienci cross-origin łamią się przez ten wzorzec z projektu — natywne aplikacje/API
  wymagają innego schematu (np. bearer tokens).
- SPA muszą utrzymywać token świeży po logowaniu/wylogowaniu; żądania mogą zawieść mid-sesji.
- Double-submit wymaga ciasteczka czytelnego dla JS — potencjalna pułapka przy stosowaniu do
  wrażliwych ciasteczek.
- `SameSite` cookies nie są pełną obroną; starsze przeglądarki ignorują atrybut, `Lax` pozwala na
  niektóre nawigacje.
- Cachowanie i CDN się komplikują — strona zcache'owana z tokenem jednego użytkownika nigdy nie
  powinna trafić do innego.
- Naiwne porównanie stringów przecieka informacje czasowe — walidacja wymaga stałoczasowego
  porównania (`crypto.timingSafeEqual`).

## Powiązane wzorce

- SameSite Cookie — Security (`samesite-cookie.md`)
- Secure Token Storage — Security (`secure-token-storage.md`)
- Content Security Policy (CSP) — Security (`content-security-policy.md`)
- Patrz też be-auth-security — sekcja CSRF pokrywa ten sam temat
  z perspektywy backendu Node.js/Express, ten plik — z perspektywy frontendu.
- Zewnętrzne: [Cross-Site Request Forgery — OWASP](https://owasp.org/www-community/attacks/csrf),
  [CSRF Prevention Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
  [SameSite Cookies — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)

## Kiedy używać / kiedy NIE używać

Użyj **zawsze**, gdy aplikacja ma żądania zmieniające stan (POST/PUT/PATCH/DELETE) wykonywane w
imieniu zalogowanego użytkownika przez sesję opartą na cookies — to nie jest opcjonalny dodatek,
to fundamentalna ochrona dla tego modelu autentykacji. Jeśli aplikacja używa **wyłącznie** bearer
tokenów w nagłówku `Authorization` (nie cookies) do autentykacji API, CSRF w klasycznej formie nie
ma zastosowania (przeglądarka nie dołącza nagłówków automatycznie tak jak cookies) — w takim
przypadku skup się na `secure-token-storage.md` zamiast dodawać niepotrzebną warstwę tokenów CSRF.
