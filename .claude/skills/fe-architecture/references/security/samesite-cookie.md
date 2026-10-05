# SameSite Cookie

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/samesite-cookie.

## Metadane

Kategoria: Security. Poziom: Advanced. Framework: Native web. Autor: Den Odell. Data aktualizacji:
18 czerwca 2026.

## TLDR

Atrybut `SameSite` na ciasteczku kontroluje, kiedy przeglądarka dołącza je do żądań cross-site — to
jedna z głównych, wymuszanych przez przeglądarkę obron przed CSRF.

## Uwagi (stan 2026, poprawki względem źródła)

- **Poprawka:** `SameSite=Lax` jako wartość domyślna dla ciasteczek bez atrybutu to zachowanie **Chromium**; Firefox i
  Safari go nie przyjęły (Safari ma własne ITP) — zawsze ustawiaj atrybut jawnie.
- „Same-site” ≠ „same-origin”: `a.example.com` i `b.example.com` to ten sam site — przejęta subdomena omija SameSite.
  Stąd prefiks `__Host-` dla ciasteczka sesji.
- Ciasteczka stron trzecich (`SameSite=None`) są w 2026 ograniczane przez przeglądarki (Safari/Firefox blokują,
  Chrome — kontrola użytkownika); dla embedów rozważ CHIPS (`Partitioned`) albo Storage Access API.

## Problem

Przeglądarki automatycznie dołączają ciasteczka do każdego żądania kierowanego na domenę serwera,
niezależnie od źródła żądania. To umożliwia ataki CSRF — złośliwa strona wysyła zakamuflowane
żądania wykorzystujące sesję uwierzytelnionego użytkownika, bez jego wiedzy.

## Rozwiązanie

Atrybut `SameSite` określa, kiedy przeglądarka dołącza ciasteczko do żądań cross-site. Trzy wartości:

- **`Strict`** — nigdy nie wysyła ciasteczka na żądania cross-site (maksymalna ochrona, ale może
  pogorszyć UX dla linków przychodzących — użytkownik ląduje niezalogowany).
- **`Lax`** — wysyła na żądania same-site i nawigacje GET z innych stron, ale blokuje POSTy i
  żądania AJAX cross-site (rekomendowana wartość domyślna w nowoczesnych przeglądarkach).
- **`None`** — wysyła na wszystkie żądania cross-site (wymaga atrybutu `Secure`; przeznaczone
  tylko dla uzasadnionych przypadków, np. embedy, SSO).

## Przykłady kodu

### Ustawienie via nagłówek Set-Cookie

```
# Strict: nigdy nie wysyłane cross-site — najlepsze dla wrażliwych ciasteczek sesji
Set-Cookie: sessionId=abc123; SameSite=Strict; Secure; HttpOnly; Path=/

# Lax: wysyłane na nawigacje GET — domyślnie dla większości sesji
Set-Cookie: sessionId=abc123; SameSite=Lax; Secure; HttpOnly; Path=/

# None: wysyłane na wszystkie żądania cross-site — WYMAGA Secure
Set-Cookie: widgetPrefs=xyz789; SameSite=None; Secure; Path=/
```

### Ustawienie z serwera Express

```javascript
// Strict session cookie dla aplikacji first-party
res.cookie('sessionId', 'abc123', {
  sameSite: 'strict', // nigdy nie wysyłane na żądania cross-site
  secure: true,       // tylko przez HTTPS
  httpOnly: true,     // niedostępne dla JavaScriptu (ogranicza kradzież XSS)
  maxAge: 1000 * 60 * 60 * 24, // 1 dzień
});

// Lax jako bezpieczniejsza domyślna opcja, gdy linki przychodzące muszą utrzymać logowanie
res.cookie('sessionId', 'abc123', {
  sameSite: 'lax',
  secure: true,
  httpOnly: true,
});

// None wymagane dla uzasadnionych ciasteczek cross-site (embedy, SSO)
// Przeglądarka odrzuca SameSite=None bez atrybutu Secure
res.cookie('widgetPrefs', 'xyz789', {
  sameSite: 'none',
  secure: true, // obowiązkowe z sameSite: 'none'
});
```

## Zalety

- Blokuje mechanizm CSRF, zapobiegając dołączaniu ciasteczek do żądań z innych stron.
- Wymuszane przez przeglądarkę — ochrona działa automatycznie, bez kodu aplikacji.
- W Chromium `Lax` jest wartością domyślną, gdy atrybut nie jest ustawiony (inne silniki — nie; ustawiaj jawnie).
- Jednolinijkowa konfiguracja na nagłówku `Set-Cookie`.
- Łączy się z `Secure` i `HttpOnly` dla wielowarstwowej ochrony.
- `Strict` praktycznie eliminuje CSRF dla ciasteczek niewymagających wysyłki cross-site.

## Wady / tradeoffs

- `Strict` pogarsza UX dla linków z poczty/wyszukiwarki (użytkownik musi się zalogować na nowo).
- `None` przywraca ekspozycję cross-site i wymusza `Secure` (tylko HTTPS).
- Sam `SameSite` nie stanowi kompletnej ochrony CSRF — dla operacji zmieniających stan trzymaj
  jeszcze tokeny (patrz `csrf-protection.md`).
- Starsze przeglądarki obsługują `SameSite` niekonsekwentnie.
- Subdomeny traktowane są jako same-site — brak izolacji między własnymi subdomenami.
- Brak `Secure` z `SameSite=None` powoduje ciche odrzucenie ciasteczka przez przeglądarkę.
- Różne ciasteczka w tej samej aplikacji zwykle wymagają różnych wartości (sesja: `Strict`/`Lax`,
  widget embedowalny: `None`).

## Powiązane wzorce

- CSRF Protection — Security (`csrf-protection.md`)
- Secure Token Storage — Security (`secure-token-storage.md`)
- Content Security Policy (CSP) — Security (`content-security-policy.md`)
- Zewnętrzne: [SameSite Cookie Attribute — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite),
  [CSRF Protection — OWASP](https://owasp.org/www-community/SameSite),
  [Cookie Security — web.dev](https://web.dev/samesite-cookies-explained/)

## Kiedy używać / kiedy NIE używać

Ustaw `SameSite` na **każdym** ciasteczku, które tworzysz — nie ma sensownego przypadku, żeby
zostawić to na wartości domyślnej przeglądarki bez świadomej decyzji. Domyślnie wybieraj `Strict`
dla ciasteczek sesji tej samej aplikacji; `Lax`, jeśli musisz wspierać nawigację z linków
zewnętrznych (poczta, wyszukiwarka) bez utraty sesji; `None` + `Secure` tylko wtedy, gdy masz
**konkretny, nazwany powód** cross-site (widget embedowalny, SSO) — nie „bo może się przydać”.
Traktuj to jako uzupełnienie `csrf-protection.md`, nie zamiennik — same `SameSite` nie chroni przed
wszystkimi wariantami CSRF (patrz Wady).
