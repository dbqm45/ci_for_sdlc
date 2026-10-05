# Natywne API przeglądarki — zanim dodasz bibliotekę

> **Spis treści:** Zasady · Mapa obsługi (MDN browser-compat-data 8.1.4, 2026-10-01) · Wzorce

Wiele funkcji (udostępnianie, schowek, synchronizacja kart, skaner kodów) przeglądarka ma wbudowane. Zanim dodasz
zależność (a nową zależność i tak zatwierdza człowiek), sprawdź, czy nie wystarczy API platformy. Najpierw jednak
sprawdź, **gdzie** ono działa: część popularnych list API pomija, że połowa z nich działa tylko w Chromium.

## Zasady
1. **Wykrywanie funkcji, nie przeglądarki**: `if ('share' in navigator)`, `if ('BarcodeDetector' in globalThis)`.
   Bez wsparcia → zwykła ścieżka (przycisk „Kopiuj link” zamiast arkusza udostępniania), nie komunikat „zmień przeglądarkę”.
2. **HTTPS (secure context)** — większość API poniżej działa tylko tam; `localhost` liczy się jako bezpieczny.
3. **Aktywacja użytkownika** — `share()`, prośby o uprawnienia, `showOpenFilePicker()`, `EyeDropper.open()` wywołujesz
   w obsłudze kliknięcia. Wywołanie przy ładowaniu strony zostanie odrzucone albo zirytuje użytkownika.
4. **Uprawnienia w kontekście**: pytasz o lokalizację lub powiadomienia dopiero wtedy, gdy użytkownik robi coś, co ich
   wymaga, i najpierw wyjaśniasz po co. Odmowa to normalny wynik — aplikacja działa dalej.
5. **Permissions-Policy**: wyłącz w nagłówku funkcje, których aplikacja nie używa, także dla ramek osadzonych
   (`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), idle-detection=()`); nadawaj je ramkom
   jawnie (`<iframe allow="screen-wake-lock">`).
6. **SSR**: na serwerze nie ma `navigator`, `window` ani `document`. W Angularze: dostęp tylko w przeglądarce
   (`isPlatformBrowser(inject(PLATFORM_ID))`, `afterNextRender`), sprzątanie przez `DestroyRef` (fw-angular).
7. **Za adapterem**: każde takie API w jednej małej usłudze z wykrywaniem funkcji i ścieżką zastępczą. Komponenty
   i testy znają tylko jej interfejs; w testach podmieniasz adapter (eng-module-depth: zewnętrzna zależność).
8. **Dane z tych API są niezaufane**: tekst ze schowka, `rawValue` kodu QR i nazwa pliku to wejście użytkownika
   (walidacja, bez `innerHTML`, URL z kodu QR tylko `http(s):`). Kontakty i lokalizacja to dane osobowe — minimalizacja,
   bez wysyłania bez potrzeby.

## Mapa obsługi (MDN browser-compat-data 8.1.4, 2026-10-01)
Ch = Chrome/Edge, FF = Firefox, Sf = Safari, A = Android, iOS = Safari iOS. Przed wdrożeniem sprawdź aktualny stan
na MDN lub w `caniuse` — obsługa się zmienia.

**Można używać wszędzie (z wykrywaniem funkcji)**
| API | Do czego | Uwagi |
|---|---|---|
| Page Visibility (`visibilitychange`, `document.hidden`) | wstrzymanie odpytywania, animacji, wideo w ukrytej karcie | do zapisu stanu na wyjściu używaj `visibilitychange`, nie `unload` |
| BroadcastChannel | wylogowanie, zmiana koszyka lub motywu we wszystkich kartach tego samego pochodzenia | Sf od 15.4; nie przesyłaj tokenów — tylko sygnał „odśwież stan” |
| ResizeObserver | komponent reagujący na własny rozmiar (wykres, tabela) | do samego układu najpierw container queries (fe-css) |
| Clipboard `writeText` / `readText` | przycisk „Kopiuj” | odczyt: FF od 125, Sf i FF pokazują systemowe potwierdzenie wklejenia; zapis w obsłudze kliknięcia |
| Screen Wake Lock | przepis, prezentacja, skaner — ekran nie gaśnie | Baseline 2025 (iOS od 18.4); zwalniany po ukryciu karty → pobierz ponownie po `visibilitychange` |
| Geolocation (`getCurrentPosition`, `watchPosition`) | mapa, „w pobliżu” | `clearWatch` przy opuszczeniu widoku; `enableHighAccuracy` kosztuje baterię |
| Speech Synthesis | czytanie komunikatu na głos | głosy zależą od systemu; nie zastępuje czytnika ekranu |
| Origin Private File System (`navigator.storage.getDirectory()`) | prywatne pliki aplikacji (cache dużych danych, edytor offline) | to nie są pliki użytkownika na dysku |

**Z rezerwą — brak w części przeglądarek**
| API | Gdzie nie działa | Ścieżka zastępcza |
|---|---|---|
| Web Share (`navigator.share`, `canShare`) | FF desktop (tylko flaga); Ch desktop od 128 | przycisk „Kopiuj link” |
| Notification | iOS: tylko aplikacja dodana do ekranu głównego (z manifestem); Ch A i iOS: tylko przez service worker (`showNotification`) | powiadomienia w aplikacji; push — service-workers.md |
| Payment Request | brak w FF; metoda `basic-card` usunięta (Chrome 100) | metody dostawców (Google Pay, Apple Pay) według ich dokumentacji, zwykły formularz płatności dostawcy |
| SpeechRecognition | FF brak; Sf tylko z prefiksem `webkit`; w Chrome rozpoznawanie zwykle odbywa się na serwerach dostawcy (audio opuszcza urządzenie — RODO) | pole tekstowe; dyktowanie systemowe klawiatury |
| Screen Orientation `lock()` | Ch desktop zawsze rzuca `NotSupportedError`, brak w Sf/iOS; zwykle wymaga pełnego ekranu | układ responsywny dla obu orientacji |
| Vibration | brak w Sf/iOS; FF A wyłączone, FF desktop usunięte (129) | tylko dodatek, nigdy jedyna informacja zwrotna |

**Tylko Chromium, eksperymentalne — wyłącznie jako ulepszenie**
| API | Obsługa | Uwagi |
|---|---|---|
| File System Access (`showOpenFilePicker`, `createWritable`) | pickery: Ch desktop, Ch A od 132 | zapis do istniejącego pliku: FF 111+, Sf 26+; wszędzie indziej `<input type="file">` + pobranie pliku |
| EyeDropper | Ch desktop | pole `<input type="color">` |
| Idle Detection | Ch; prośba o uprawnienie, próg min. 60 s, tylko ramka główna | śledzi aktywność człowieka — tylko z jasnym celem i zgodą |
| Contact Picker | tylko Ch A | ręczne wpisanie, zaproszenie linkiem |
| WebOTP | Ch, Ch A; SMS kończy się linią `@twoja-domena #kod` | `autocomplete="one-time-code"` na polu (działa też w Sf) — zawsze to ustaw |
| BarcodeDetector | Ch A; Ch desktop tylko macOS i ChromeOS; formaty sprawdzasz `getSupportedFormats()` | biblioteka dekodująca w Web Workerze (nowa zależność → zgoda) |
| Credential Management (`PasswordCredential`) | tylko Chromium | `autocomplete="username"` / `"current-password"` / `"new-password"`; logowanie bez hasła — passkeys (WebAuthn, be-auth-security) |
| Network Information (`navigator.connection`) | tylko Chromium | ustawienie „tryb oszczędny” w aplikacji; adaptacyjne strumieniowanie po stronie odtwarzacza |

**Nie używaj**
- **Battery Status** (`getBattery`) — tylko Chromium, usunięte z Firefoksa (52) z powodu fingerprintingu; brak w Sf.
  Do oszczędzania energii użyj Page Visibility i `prefers-reduced-motion`.

## Wzorce
```ts
// Wake lock, który wraca po powrocie do karty
let lock: WakeLockSentinel | null = null;
async function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  try { lock = await navigator.wakeLock.request('screen'); } catch { /* np. tryb oszczędzania */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lock?.released) keepAwake();
});

// Wylogowanie we wszystkich kartach — sam sygnał, bez danych sesji
const auth = new BroadcastChannel('auth');
auth.onmessage = (e) => { if (e.data === 'logout') location.assign('/login'); };
function logoutEverywhere() { auth.postMessage('logout'); location.assign('/login'); }

// Udostępnij albo skopiuj
async function shareOrCopy(data: ShareData) {
  if (navigator.canShare?.(data)) {
    try { await navigator.share(data); return 'shared'; }
    catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelled'; }
  }
  await navigator.clipboard.writeText(data.url ?? '');
  return 'copied'; // ogłoś wynik w regionie aria-live
}
```
Testy: Playwright pozwala nadawać uprawnienia (`context.grantPermissions(['geolocation'])`) i ustawiać lokalizację;
API bez emulacji testujesz przez adapter (tool-playwright).

## Źródła
- D. Turnbull, [21 Native Browser APIs You Might Not Have Used Before](https://dev.to/lingodotdev/21-native-browser-apis-you-might-not-have-used-before-1nbp)
  (Lingo.dev, 2025) — lista API i przykłady; artykuł nie podaje obsługi przeglądarek ani zastrzeżeń.
- [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API) i pakiet `@mdn/browser-compat-data` 8.1.4 —
  obsługa, wymagania bezpiecznego kontekstu, aktywacji i Permissions-Policy. Opisane własnymi słowami.
