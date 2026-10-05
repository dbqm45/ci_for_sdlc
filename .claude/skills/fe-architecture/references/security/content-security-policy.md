# Content Security Policy (CSP)

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/content-security-policy.

## Metadane

Kategoria: Security. Poziom: Advanced. Przykłady: Native web. Autor: Den Odell. Data aktualizacji:
16 czerwca 2026.

## TLDR

CSP to wymuszany przez przeglądarkę allowlist, dostarczany jako nagłówek HTTP, definiujący, skąd
mogą pochodzić skrypty, style i inne zasoby.

## Uwagi (stan 2026, poprawki względem źródła)

- Polityka oparta na **allowliście domen** jest słaba (obejścia przez JSONP/gadżety na dozwolonych CDN). Zalecana
  jest **strict CSP**: `script-src 'nonce-{losowy}' 'strict-dynamic'; object-src 'none'; base-uri 'none'`
  (+ `'unsafe-inline' https:` jako fallback ignorowany przez nowe przeglądarki). Allowlistę traktuj jako etap
  przejściowy.
- `report-uri` jest przestarzałe — używaj `report-to` + nagłówka `Reporting-Endpoints` (starsze `Report-To` też
  jest przestarzałe); `report-uri` zostaw tylko jako fallback.
- Frameworki: Angular wspiera nonce (`ngCspNonce` / `CSP_NONCE`) i Trusted Types (fw-angular); Next.js — nonce przez
  middleware; SPA hostowane statycznie — hashe (`'sha256-…'`) zamiast nonce.
- CSP ustawia serwer/CDN — to decyzja wspólna z backendem (be-auth-security).

## Problem

Aplikacje webowe są narażone na XSS mimo zastosowania sanitacji inputu i kodowania outputu — zagrożenie
pochodzi zarówno z wewnętrznego kodu, jak i zaufanych źródeł (CDN, dostawcy analityki, sieci
reklamowe). Inline skrypty pogarszają sytuację: gdy legalny inline kod jest normalny na stronie,
przeglądarka nie ma sposobu odróżnić `<script>onClick()</script>` od wstrzykniętego przez
atakującego — są identyczne w formie.

## Rozwiązanie

CSP to nagłówek HTTP odpowiedzi definiujący whitelistę źródeł dla skryptów, stylów i zasobów.
Przeglądarka natywnie egzekwuje te reguły, blokując źródła spoza listy. Kluczowe elementy:

- zasada „deny by default” z `default-src 'self'`,
- dyrektywy specjalizowane: `script-src`, `style-src`, `img-src`, `connect-src`,
- zakaz `'unsafe-inline'` i `'unsafe-eval'`,
- **nonce'y** (losowe wartości per-request) do autoryzacji konkretnych inline skryptów,
- **report-only mode** do testowania polityki przed jej wymuszeniem.

## Przykłady kodu

### Starter Policy (natywny nagłówek HTTP)

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://api.example.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

`object-src 'none'` wyłącza pluginy; `base-uri 'self'` zapobiega hijackingowi URL-i względnych;
`frame-ancestors 'none'` chroni przed clickjackingiem.

### Express + Helmet (Node.js middleware)

```javascript
import express from "express";
import helmet from "helmet";

const app = express();

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.example.com"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.example.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  })
);
```

### Nonce-based Inline Scripts (Node.js)

```javascript
import crypto from "node:crypto";

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'nonce-${res.locals.nonce}'`
  );
  next();
});
```

```html
<!-- Template markup (np. EJS, Handlebars) -->
<script nonce="r4nd0mPerRequestValue==">
  window.__APP_CONFIG__ = { theme: "dark" };
</script>
```

Nonce musi być **losowy i unikatowy per request** — reużycie wartości statycznej unieważnia ochronę.

### Violation Reporting

```
Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"
Content-Security-Policy: default-src 'self'; script-src 'self'; report-to csp-endpoint; report-uri /csp-reports
```

Report-only deployment (testowanie bez wpływu na funkcjonalność):

```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; report-to csp-endpoint
```

## Zalety

- Wstrzyknięte skrypty są blokowane na poziomie przeglądarki, nawet gdy sanitizacja inputu i
  kodowanie outputu coś przeoczą.
- Ochrona przed skompromitowanymi CDN/dostawcami trzecimi.
- Nonces/hashes pozwalają kontrolować inline skrypty bez `'unsafe-inline'`.
- Violation reports dają widoczność ataków i błędów konfiguracji.
- Egzekwowanie na poziomie nagłówka — niezależne od kodu aplikacji.
- Report-only mode do walidacji polityki bez wpływu na funkcjonalność.

## Wady / tradeoffs

- Złożoność autoringu — konfiguracja strict policy wymaga iteracyjnego tuningu.
- Istniejące inline skrypty i event handlery muszą być zrefaktoryzowane.
- Biblioteki trzeciej strony (analytics, tag managery, sieci reklamowe) często wymagają liberalnych
  uprawnień.
- Polityki oparte na nonce wymagają synchronizacji server-side → template (dodatkowe powiązanie).
- CSP łagodzi, nie zapobiega atakom — nie zastępuje output encodingu i input validation.
- Wsparcie przeglądarek i zachowanie dyrektyw się różni — wymaga fallbacków.
- Szerokie polityki z wildcardami `https:` dają fałszywe poczucie bezpieczeństwa.
- Reporting endpoints mogą generować szum z rozszerzeń przeglądarek.

## Powiązane wzorce

- Subresource Integrity — Security (`../security/subresource-integrity.md`)
- Trusted Types — Security (`../security/trusted-types.md`)
- CSRF Protection — Security (`../security/csrf-protection.md`)
- Output Encoding — Security (`../security/output-encoding.md`)
- Zewnętrzne: [CSP — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP),
  [CSP Quick Reference](https://content-security-policy.com/),
  [CSP Best Practices — web.dev](https://web.dev/strict-csp/)

## Kiedy używać / kiedy NIE używać

Użyj, gdy chcesz **ostatniej linii obrony przed XSS na poziomie przeglądarki**, niezależnej od tego,
czy sanitizacja/kodowanie w kodzie aplikacji zadziałały poprawnie — zwłaszcza jeśli aplikacja
ładuje skrypty z CDN/analityki/reklam, które są poza Twoją kontrolą. **Zacznij od report-only**,
żeby zmierzyć rzeczywisty koszt (ile istniejącego kodu złamie strict policy), zanim wymusisz
enforcement — wprowadzenie strict CSP „na produkcję od razu” bez tego kroku jest częstą przyczyną
ubitej aplikacji. Jeśli aplikacja jest mała, statyczna, bez treści od użytkowników i bez zasobów
trzecich — koszt utrzymania restrykcyjnej polityki może przewyższać realne ryzyko (patrz YAGNI w
`../principles.md`); wtedy solidne Output Encoding + Input Sanitization mogą wystarczyć
jako pierwsza warstwa.
