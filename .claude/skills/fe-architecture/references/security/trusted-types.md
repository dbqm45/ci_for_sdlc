# Trusted Types

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/trusted-types.

## Metadane

Kategoria: Security. Poziom: Advanced. Technologia: Native web (Browser APIs). Autor: Den Odell.
Data aktualizacji: 22 czerwca 2026.

## TLDR

Trusted Types API przeglądarki wymusza, żeby niebezpieczne sinki DOM (np. `innerHTML`) przyjmowały
tylko typowane, przepuszczone przez audytowaną politykę obiekty (`TrustedHTML` itp.), nie surowe
stringi — eliminuje DOM-based XSS na źródle.

## Uwagi (stan 2026, poprawki względem źródła)

- Wsparcie: Chromium od dawna; w 2025–2026 dołączają pozostałe silniki (Safari 26, Firefox) — sprawdź Baseline dla
  swojej publiczności. Bez wsparcia enforcement jest po prostu ignorowany — Trusted Types to warstwa dodatkowa.
- Nagłówek `Report-To` jest przestarzały — używaj `Reporting-Endpoints` + `report-to` w CSP.
- Angular obsługuje Trusted Types natywnie (polityki `angular`, `angular#bundler`) — fw-angular. W React `dangerouslySetInnerHTML`
  przyjmuje `TrustedHTML` z polityki.
- Polityka `default` to siatka bezpieczeństwa dla bibliotek trzecich — loguj jej użycia, żeby je stopniowo usuwać.

## Problem

Podatności typu DOM-based XSS powstają, gdy niezaufany string trafia do „sinka” DOM, który
interpretuje go jako kod. Klasyczny przykład: `element.innerHTML = userInput`. Inne niebezpieczne
sinki: `outerHTML`, `document.write`, `insertAdjacentHTML`, `script.src`, `eval`, `iframe.srcdoc`.

Dwa problematyczne aspekty:
1. Takie błędy wyglądają niewinnie (zwykłe przypisania) i łatwo omijają code review.
2. Niebezpieczne sinki są rozproszone po całej bazie kodu; sanityzacja bywa zapominana i
   niekonsystentna między miejscami.

## Rozwiązanie

Trusted Types zmienia domyślne zachowanie przeglądarki — niebezpieczne sinki przestają akceptować
zwykłe stringi i wymagają specjalnych, typowanych obiektów: `TrustedHTML`, `TrustedScript`,
`TrustedScriptURL`. Obiekty te można tworzyć **tylko** przez audytowaną politykę, zdefiniowaną raz
przez `trustedTypes.createPolicy()`.

Włączenie: nagłówek `Content-Security-Policy: require-trusted-types-for 'script'`.

## Przykłady kodu

### Włączenie enforcement

```
Content-Security-Policy: require-trusted-types-for 'script'
Content-Security-Policy: trusted-types sanitize default;
```

Po włączeniu: `element.innerHTML = '<b>hi</b>'` wyrzuca `TypeError`.

### Tworzenie polityki (native web)

```javascript
import DOMPurify from 'dompurify';

const sanitizer = trustedTypes.createPolicy('sanitize', {
  createHTML: (input) => DOMPurify.sanitize(input),
});

// Zwraca TrustedHTML, nie string
const safe = sanitizer.createHTML(userInput);
element.innerHTML = safe; // Zaakceptowane: sanityzowane przez politykę

// Zwykły string jest odrzucony
element.innerHTML = userInput; // TypeError: wymaga TrustedHTML
```

### Polityka domyślna

```javascript
trustedTypes.createPolicy('default', {
  createHTML: (input) => DOMPurify.sanitize(input),
  createScriptURL: (input) => {
    const url = new URL(input, location.origin);
    if (url.origin !== location.origin) {
      throw new Error(`Untrusted script URL: ${input}`);
    }
    return url.href;
  },
});
```

### Report-only mode

```
Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"
Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; report-to csp-endpoint
```

## Zalety

- Eliminuje podatności XSS na źródle, nie pozwalając przekazać niezasanityzowanego stringa do
  chronionego sinka.
- Centralizuje sanityzację w jednej, audytowanej polityce, zamiast rozproszonych, niespójnych
  wywołań w całym kodzie.
- Przesuwa wychwytywanie błędu z produkcji na `TypeError` już w trakcie developmentu.
- Warstwuje się z CSP i output encoding dla defense-in-depth.
- Report-only mode pozwala zmierzyć realną ekspozycję na produkcyjnych danych przed wymuszeniem.

## Wady / tradeoffs

- Wsparcie przeglądarek długo ograniczało się do Chromium; inne silniki dołączają dopiero w 2025–2026.
- Wymaga refaktoringu istniejącego kodu — każde niebezpieczne przypisanie musi przejść przez
  politykę.
- Biblioteki trzecich stron piszące do `innerHTML` wewnętrznie mogą się łamać pod enforcement.
- Zbyt permisywna polityka `default` jest zagrożeniem samym w sobie — może otworzyć dziurę, którą
  miała zamykać.
- Chroni tylko chronione sinki; nie łapie XSS przez `javascript:` URL w atrybutach czy przez
  wstrzyknięcie stylów (style injection).
- Enforcement zależy od poprawnie wysyłanych nagłówków CSP — błąd konfiguracji cicho wyłącza
  ochronę.
- Tworzenie polityk dodaje złożoność operacyjną.
- Trusted Types gwarantuje tylko, że treść przeszła przez politykę — błędna implementacja
  `createHTML` może i tak zatwierdzić niebezpieczny markup.

## Powiązane wzorce

- Content Security Policy (CSP) — Security (`content-security-policy.md`)
- Output Encoding — Security (`output-encoding.md`)
- Input Sanitization — Security (`input-sanitization.md`)
- Zewnętrzne: [Trusted Types API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API),
  [Specyfikacja Trusted Types — GitHub](https://w3c.github.io/trusted-types/dist/spec/),
  [XSS Prevention with Trusted Types — web.dev](https://web.dev/trusted-types/)

## Kiedy używać / kiedy NIE używać

Wprowadź Trusted Types w aplikacjach, gdzie DOM-based XSS jest realnym ryzykiem — duża baza kodu z
wielu miejscami pisania do `innerHTML`/podobnych sinków, zwłaszcza z wielu zespołów naraz, gdzie
sanityzacja „w każdym miejscu z osobna” już się rozjechała. **Nie** traktuj tego jako pierwszy krok
— to jest wzorzec dopełniający Input Sanitization i Output Encoding, nie ich zamiennik; jeśli
projekt nie ma jeszcze podstawowej sanityzacji/kodowania poukładanych, Trusted Types tylko dodadzą
`TypeError`-y bez realnej korzyści, dopóki tamten fundament nie jest gotowy. Sprawdź wsparcie
przeglądarek dla docelowej publiczności przed enforcement na produkcji — dla części użytkowników
(starsze Safari/Firefox) ochrona po prostu nie zadziała, więc nie licz na nią jako jedyną warstwę.
