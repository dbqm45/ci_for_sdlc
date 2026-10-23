# Połączenie z Atlassianem jednym kliknięciem (OAuth)

Zamiast tokenu API (`JIRA_API_TOKEN`) i e-maila w ustawieniach administrator klika raz **Connect Atlassian**
w *Settings → Integrations*, loguje się w Atlassianie i zgadza się na dostęp. Jedno połączenie obsługuje Jirę
i Confluence. Figma działa dalej na `FIGMA_TOKEN`.

## Przełącznik

| `CI_CONNECT_MODE` | Jak aplikacja łączy się z Jirą i Confluence |
|---|---|
| `token` (domyślnie) | jak dotąd: `JIRA_API_TOKEN` (i `CONFLUENCE_API_TOKEN`) ze zmiennych środowiskowych, adres strony i e-mail w Settings |
| `oauth` | przycisk *Connect Atlassian*; adres strony i e-mail nie są potrzebne |

Żeby wrócić do tokenu, ustaw `CI_CONNECT_MODE=token` i uruchom serwer ponownie. Zapisane połączenie OAuth zostaje na dysku
(zaszyfrowane), więc powrót na `oauth` nie wymaga ponownego klikania. Usuwa je dopiero *Disconnect*.

## Jak to działa

1. *Connect Atlassian* (tylko admin, jak każda zmiana ustawień) prosi serwer o adres strony zgody Atlassiana. Serwer
   losuje jednorazowy kod `state`, zapamiętuje go na 10 minut i zapisuje w ciasteczku tej przeglądarki (HttpOnly,
   SameSite=Lax, wysyłane tylko na adres powrotu).
2. Przeglądarka przechodzi do `auth.atlassian.com`, admin wybiera konto i klika *Accept*.
3. Atlassian odsyła przeglądarkę na `<CI_PUBLIC_URL>/api/connections/atlassian/callback`. Serwer sprawdza, że `state`
   wydał on sam i że pasuje do ciasteczka (inaczej nikt nie podepnie aplikacji pod swoje konto), wymienia kod na tokeny
   i pobiera listę stron Atlassiana, do których konto ma dostęp. Przeglądarka wraca do Settings z komunikatem.
4. Na dysk trafia tylko **token odświeżania**, w `connections.json` w katalogu danych, zawsze zaszyfrowany kluczem
   `CI_ENCRYPTION_KEY` (AES-256-GCM). Token dostępu (ważny ok. godziny) jest tylko w pamięci serwera.
5. Analiza pobiera token dostępu, a gdy wygasł, odświeża go. Atlassian przy każdym odświeżeniu wydaje nowy token
   odświeżania; serwer zapisuje go od razu i odświeża jeden raz naraz. Jeśli Atlassian odmówi (np. dostęp odebrano),
   połączenie dostaje status „stopped working” i trzeba kliknąć *Reconnect Atlassian*.

Zapytania idą przez bramkę `https://api.atlassian.com/ex/jira/<cloudId>/…` i `…/ex/confluence/<cloudId>/…`, a linki
w aplikacji prowadzą na adres strony (`https://<twoja-strona>.atlassian.net/browse/…`).

Konto ma kilka stron Atlassiana? Pod przyciskiem pojawia się lista *Atlassian site*. Analiza czyta wybraną stronę.

## Konfiguracja (raz, robi to administrator)

### 1. Aplikacja w Atlassian Developer Console

1. Wejdź na <https://developer.atlassian.com/console/myapps/> i zaloguj się kontem Atlassiana.
2. **Create → OAuth 2.0 integration**. Nazwa np. „Continuous Intelligence”. Zaakceptuj warunki.
3. **Permissions**:
   - *Jira API → Add → Configure*: zakres `read:jira-work` (*View Jira issue data*).
   - *Confluence API → Add → Configure → Granular scopes*: `read:space:confluence`, `read:page:confluence`,
     `read:label:confluence`.
4. **Authorization → OAuth 2.0 (3LO) → Configure**: w *Callback URL* wpisz adres z Settings (pokazuje go plakietka,
   gdy czegoś brakuje), np. `http://localhost:4317/api/connections/atlassian/callback`. Adres musi się zgadzać co do znaku
   z `CI_PUBLIC_URL`.
5. **Settings**: skopiuj *Client ID* i *Secret* prosto do menedżera haseł albo zmiennych środowiskowych serwera
   (`ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`). Nie wklejaj ich do plików w repozytorium ani do czatu.
6. Aplikacja zostaje prywatna: może jej używać tylko Twoje konto. Żeby łączyli się też inni, włącz
   *Distribution → Sharing*; Atlassian pokaże im ostrzeżenie, że aplikacji nie sprawdził.

### 2. Zmienne środowiskowe serwera

| Zmienna | Wartość |
|---|---|
| `CI_CONNECT_MODE` | `oauth` |
| `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` | z kroku 1.5 |
| `CI_ENCRYPTION_KEY` | dowolny długi losowy ciąg (np. `openssl rand -hex 32`); bez niego połączenia nie da się zapisać |
| `CI_PUBLIC_URL` | adres, pod którym otwierasz aplikację; domyślnie `http://localhost:4317`. W `npm run dev` (Vite) ustaw `http://localhost:5173` |
| `ATLASSIAN_SCOPES` | opcjonalnie: inne zakresy, rozdzielone spacją, gdy aplikacja w konsoli ma inne niż domyślne |

Serwer dostępny pod inną nazwą niż `localhost`: dopisz ją też do `CI_ALLOWED_HOSTS`, tak jak dla każdego innego adresu.

Najprościej lokalnie: `npm run local -- --oauth`. Skrypt ustawia `CI_CONNECT_MODE=oauth` i `CI_PUBLIC_URL`, bierze trzy
klucze z powyższej tabeli ze zmiennych środowiskowych albo z 1Password (`~/.config/ci-sdlc.env` z odwołaniami `op://`),
a o brakujące pyta w terminalu bez wyświetlania i zapisywania. Po starcie wypisuje adres aplikacji i *Callback URL* do
wpisania w konsoli Atlassiana.

### 3. Połączenie

*Settings → Integrations → Connect Atlassian* → zaloguj się → *Accept*. Po powrocie włącz Jirę i/lub Confluence,
podaj klucz projektu i spaces, *Test connections*, *Save & re-analyze*.

**Odłączenie:** *Disconnect* usuwa token z serwera. Żeby odebrać aplikacji dostęp także po stronie Atlassiana, usuń ją
w ustawieniach konta Atlassiana (lista połączonych aplikacji).

## Ograniczenia

- Połączenie jest jedno dla całej instalacji (aplikacja nie ma kont użytkowników). Klika je admin, korzystają wszyscy.
- `npm run analyze` (CLI) w trybie `oauth` korzysta z tego samego połączenia. Nie uruchamiaj go w tej samej chwili co
  analizy w serwerze: oba procesy mogłyby odświeżyć token jednocześnie, a Atlassian unieważnia stary token odświeżania.
- Zakresy dobrano do wywołań, których używa konektor (wyszukiwanie JQL, remote links, Confluence REST v2: spaces, pages,
  labels). Przy pierwszym połączeniu sprawdź *Test connections*; błąd 401/403 przy Confluence oznacza zwykle brakujący
  zakres w konsoli.
