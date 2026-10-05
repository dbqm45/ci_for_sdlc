# Subresource Integrity

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/subresource-integrity.

## Metadane

Kategoria: Security. Poziom: Advanced. Framework: Native web. Autor: Den Odell. Data aktualizacji:
21 czerwca 2026.

## TLDR

Atrybut `integrity` na `<script>`/`<link>` weryfikuje kryptograficznie, że zasób z CDN nie został
podmieniony — przeglądarka blokuje wykonanie, jeśli hash się nie zgadza.

## Uwagi (stan 2026, poprawki względem źródła)

- **Poprawki:** dyrektywa CSP `require-sri-for` nigdy nie weszła do przeglądarek (usunięta ze specyfikacji) — nie
  polegaj na niej. Fallback przez `document.write` jest przestarzały (blokowany/ostrzegany, łamie CSP) —
  wstrzykuj `<script>` przez DOM (`document.createElement('script')`).
- SRI ma sens głównie dla zasobów z **cudzych** originów; własne bundlowane assety z hashem w nazwie pliku
  chroni już proces wdrożenia. Import maps obsługują pole `integrity` dla modułów ES.
- Przykładowe URL-e (`react@18.2.0` UMD) są ilustracją — nowoczesne aplikacje bundlują zależności zamiast ładować je z CDN.

## Problem

Ładowanie skryptów z CDN wiąże się z permanentnym zaufaniem do dostawcy. Bez mechanizmu weryfikacji
każdy plik wykonywany w przeglądarce może zawierać złośliwy kod w wyniku kompromitacji CDN, ataku
man-in-the-middle, pomyłki konfiguracyjnej czy działań wewnętrznych. Zmanipulowany skrypt może
czytać hasła prosto z pól formularza, wykradać tokeny sesji, wstrzykiwać koparkę kryptowalut albo
po cichu przekierowywać użytkowników.

## Rozwiązanie

Subresource Integrity (SRI) wykorzystuje kryptograficzną sumę kontrolną w atrybucie `integrity`
tagów `<script>` i `<link>`. Przeglądarka porównuje hash pobranego zasobu z wartością oczekiwaną —
niedopasowanie blokuje wykonanie. Wymaga `crossorigin="anonymous"` dla poprawnej obsługi CORS.

## Przykłady kodu

### Dodanie integrity do skryptu z CDN

```html
<!-- Skrypt zewnętrzny, przypięty do dokładnej wersji -->
<script
  src="https://cdn.example.com/react@18.2.0/react.min.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  crossorigin="anonymous"
></script>

<!-- Arkusz stylów zewnętrzny -->
<link
  rel="stylesheet"
  href="https://cdn.example.com/bootstrap@5.3.0/bootstrap.min.css"
  integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM"
  crossorigin="anonymous"
/>
```

### Generowanie hasha

```bash
# Hash pliku lokalnego
cat react.min.js | openssl dgst -sha384 -binary | openssl base64 -A
# -> oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC

# Hash bezpośrednio z CDN
curl -s https://cdn.example.com/react@18.2.0/react.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

### Automatyzacja SRI w buildzie — Vite/Rollup

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import sri from 'vite-plugin-sri';

export default defineConfig({
  plugins: [
    sri({ algorithm: 'sha384' }),
  ],
});
```

Dla webpack — analogicznie `webpack-subresource-integrity`.

### Fallback dla zasobów zablokowanych

```html
<script
  src="https://cdn.example.com/jquery@3.7.1/jquery.min.js"
  integrity="sha384-1H217gwSVyLSIfaLxHbE7dRb3v4mYCKbpQvzx0cegeju1MVsGrX5xXxAvs/HgeFs"
  crossorigin="anonymous"
></script>
<script>
  // Jeśli SRI zablokuje albo CDN jest niedostępny, window.jQuery będzie niezdefiniowany
  if (!window.jQuery) {
    const s = document.createElement('script');
    s.src = '/vendor/jquery-3.7.1.min.js'; // self-hosted fallback
    document.head.append(s);
  }
</script>
```

Dla arkuszy stylów — nasłuchiwanie zdarzenia `error`:

```javascript
const link = document.querySelector('link[data-cdn]');
link.addEventListener('error', () => {
  link.href = '/vendor/bootstrap-5.3.0.min.css';
});
```

## Zalety

- Weryfikacja kryptograficzna każdego zasobu przed wykonaniem.
- Automatyczne blokowanie skompromitowanych CDN i manipulacji w tranzycie.
- Zmusza do przypinania dokładnych wersji, eliminując niespodziewane aktualizacje pod tym samym URL.
- Deklaratywna ochrona — jeden atrybut, brak dodatkowych żądań sieciowych.
- Automatyzacja dla zasobów własnych już w kroku budowania (build).
- Komponuje się z self-hosted fallbackami.

## Wady / tradeoffs

- Każda zmiana w pliku wymaga regeneracji hasha — utrudnia rutynowe aktualizacje CDN.
- Niemożliwe użycie z mutowalnymi URL-ami (np. „latest”) — plik się zmienia, hash zawsze się nie
  zgadza.
- Konieczność śledzenia i synchronizacji każdego hasha z bumpami wersji zależności.
- Wymóg poprawnej obsługi CORS przez CDN — bez odpowiednich nagłówków weryfikacja jest niemożliwa.
- Wszystko albo nic — zablokowany zasób krytyczny przerywa działanie strony bez fallbacku, jeśli
  go nie przygotujesz.
- Nie nadaje się do szybko rotujących zasobów (analityka, reklamy).
- Aktualizacja biblioteki staje się świadomym, ręcznym krokiem, nie pasywnym pobraniem.
- Błędy failują milcząco z perspektywy użytkownika — wymaga monitoringu, żeby to zauważyć.
- Chroni integralność zasobu, nie jego dostępność czy prywatność.

## Powiązane wzorce

- Content Security Policy (CSP) — Security (`content-security-policy.md`)
- Trusted Types — Security (`trusted-types.md`)
- Zewnętrzne: [Subresource Integrity — MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity),
  [SRI Hash Generator](https://www.srihash.org/), [CDN Security — web.dev](https://web.dev/codelab-sri/)

## Kiedy używać / kiedy NIE używać

Dodaj `integrity` **zawsze**, gdy ładujesz skrypt/styl z zewnętrznego CDN pod konkretną, przypiętą
wersją (`react@18.2.0`, nie `react@latest`) — koszt jest jednorazowy (wygenerowanie hasha), a
ochrona realna. **Nie** stosuj SRI do zasobów, które z natury muszą się zmieniać bez Twojej
kontroli (tagi analityczne, sieci reklamowe, „latest” CDN linki) — tam hash i tak będzie się
rozjeżdżał, a jedyną sensowną obroną jest CSP + izolacja (patrz `content-security-policy.md`), nie
SRI.
