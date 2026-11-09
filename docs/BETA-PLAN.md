# Zamknięta beta Quorum (ci_for_sdlc jako usługa)

Stan: 2026-11-09, plan do decyzji właściciela. Poprzedza kroki 6–7 z [`SAAS.md`](SAAS.md) (AI w cenie, billing):
najpierw sprawdzamy, czy zespoły chcą z tego korzystać i za co zapłacą, potem budujemy rozliczenia.

## 1. Po co beta
Produkt nie ma jeszcze zewnętrznych użytkowników — to większe ryzyko niż techniczne. Beta ma odpowiedzieć na trzy
pytania, każde z miarą i progiem ustalonym z góry:

| Pytanie | Miara | Próg „idziemy dalej” |
|---|---|---|
| Czy zespół wraca do narzędzia bez przypominania? | tygodnie z co najmniej jedną analizą i jedną decyzją na zespół | ≥ 3 z 5 zespołów w 6 z 8 tygodni |
| Czy ustalenia są trafne? | odsetek ustaleń zamkniętych decyzją „rozwiązane” lub „przyjęte ryzyko” wobec „odrzucone” (audyt) | ≥ 60% trafnych; < 20% odrzuconych jako fałszywe |
| Czy ktoś zapłaci? | deklaracja zakupu po becie (list intencyjny lub zgoda na płatny plan od dnia X) z ceną | ≥ 2 zespoły z ceną w przedziale planu Team |
| Czy to jest „musieć mieć”? | pytanie Seana Ellisa w ankiecie końcowej: „bardzo rozczarowany”, gdyby Quorum zniknęło | ≥ 40% odpowiadających |

Dodatkowo, jakościowo (z ankiet, §7): które ustalenia oszczędziły pracę, czego brakowało, co przeszkadzało. Miary
liczymy z pomiaru (§8), nie z deklaracji; ankieta je uzupełnia i sprawdza.

## 2. Kto
- **3–5 zespołów** (design partners), nie więcej — każdy dostaje uwagę: ankietę co dwa tygodnie (§7) i odpowiedź
  na każde zgłoszenie w 1 dzień roboczy. Rozmowa tylko wtedy, gdy zespół jej chce albo ankieta tego wymaga.
  **Najpierw jeden zespół:** betę zaczynamy od jednego zespołu, żeby sprawdzić przebieg (zapis, ankiety, pomiar,
  hosting) na prawdziwych danych; kolejne dołączamy po decyzji właściciela. Wnioski z jednego zespołu mówią tylko, czy
  Quorum sprawdza się u niego — progi z §1 oceniamy dopiero przy 3–5 zespołach.
- **Profil:** zespół produktowy na Jira Cloud i Confluence (Figma mile widziana), 5–30 osób, z PO lub analitykiem,
  który pisze historyjki; najlepiej taki, który już narzeka na niejasne wymagania lub poprawki po review.
- **Źródła kontaktów:** własna sieć, społeczności PO/QA, osoby z poprzednich projektów. Bez płatnej reklamy.
- **Umowa bety:** bezpłatnie na czas bety, w zamian **ankieta co dwa tygodnie (ok. 5 minut, [`BETA-SURVEYS.md`](BETA-SURVEYS.md))**,
  ankieta wejściowa i końcowa oraz zgoda na mierzenie użycia w zakresie z §8 (zdarzenia bez treści historyjek);
  DPA podpisane przed podłączeniem prawdziwych danych. Zgodę zespół daje w formularzu zgłoszenia do bety (§7).

## 3. Zakres produktu w becie
**W becie:** analiza gotowości historyjek i epiców z Jiry, Confluence i (opcjonalnie) Figmy; pytania i decyzje;
zatwierdzenie i dryf; impact; konta Atlassian z rolami i zaproszeniami (`CI_AUTH_MODE=accounts`); przestrzenie
robocze per zespół lub produkt; recenzja AI z limitem; serwer MCP dla Claude.

**Opcjonalnie dla chętnych:** bramka na PR (`analyze --repo`) i zmiany w repo; połączenie z pdi.

**Poza betą:** Stripe i plany, SAML/SCIM, BYOK, Marketplace Atlassiana, wiele serwerów na bazę.

## 4. Prace techniczne przed pierwszym zespołem
Każda pozycja to osobny PR z testami; kolejność według zależności.

| # | Co | Dlaczego w becie | Stan dziś |
|---|---|---|---|
| T1 | **Hosting produkcyjny:** obraz z `Dockerfile`, usługa w regionie UE, zarządzany Postgres z odtwarzaniem do punktu w czasie, domena i HTTPS | dane klientów nie mogą leżeć na laptopie | `render.yaml` (Render, Frankfurt), instrukcja i mapa w `DEPLOYMENT.md`; założenie kont i domena — właściciel |
| T2 | **Aplikacja Atlassian (OAuth 3LO) na domenie produkcyjnej**, logowanie i połączenie Jiry/Confluence per przestrzeń | każdy zespół łączy własną witrynę | kod jest (#104, OAuth Atlassian), rejestracja aplikacji na produkcji brak |
| T3 | **Figma per przestrzeń:** token Figmy zapisany zaszyfrowany w przestrzeni (albo OAuth Figmy) zamiast `FIGMA_TOKEN` serwera | dziś jeden token na instalację — nie do przyjęcia przy kilku klientach | brak |
| T4 | **AI z limitem per przestrzeń:** klucz platformy (Anthropic albo Bedrock w UE), licznik zużycia z telemetrii (#91) i twardy limit miesięczny; po przekroczeniu analiza bez AI | koszt AI to główny koszt zmienny | zrobione w kodzie: AI platformy (`CI_AI_PROVIDER`, w becie Claude przez Bedrock w UE), limit $50 na przestrzeń i miesiąc zmieniany przez operatora ([`AI-PLATFORM.md`](AI-PLATFORM.md)); konto AWS i dostęp do modelu — właściciel |
| T5 | **Kopie i odtwarzanie:** dzienna kopia bazy poza dostawcą hostingu, próba odtworzenia przed startem i raz w becie | utrata decyzji klienta zabija zaufanie | zrobione w kodzie: zadanie `quorum-backup` do Backblaze B2 (UE) i `restore-check` ([`BACKUPS.md`](BACKUPS.md)); konfiguracja B2 i pierwsza próba odtworzenia — właściciel |
| T6 | **Monitoring i alerty:** `/api/health` w zewnętrznym monitorze, logi błędów z alertem, panel zużycia AI | dowiadujemy się o awarii przed klientem | health jest |
| T7 | **Usunięcie danych klienta na żądanie:** usunięcie przestrzeni z kasowaniem (dziś archiwizacja) i odłączenie OAuth | wymóg RODO i DPA | archiwizacja jest, kasowania brak |
| T8 | **Pomiar użycia (§8):** zdarzenia wysyłane przez serwer (bez treści) do własnego logu i do PostHog, wyłącznik zespołu, ankiety w aplikacji, raport miar dla operatora | miary z §1 | zrobione (§8, „Zrobione”); ankiety w T10 |
| T9 | **Przegląd bezpieczeństwa przed startem:** skan zależności, przegląd tras bez uwierzytelnienia, prosty test DAST (np. OWASP ZAP) na środowisku testowym | minimum przed prawdziwymi danymi | skan zależności w CI jest |
| T10 | **Zapisy i uczestnictwo w becie ([`BETA-ENROLLMENT-PLAN.md`](BETA-ENROLLMENT-PLAN.md)):** formularz zgłoszenia, zatwierdzenie przez operatora, jednorazowe zaproszenie tworzące przestrzeń, okres bety z datą końca, ankiety w aplikacji z terminami, codzienne zadanie (przypomnienia, wstrzymanie, koniec bety), panel operatora | zapis, ankiety i czas bety bez ręcznego pilnowania | zrobione (#114–#117, #121–#124) |

Świadomie odkładamy krok 5 z `SAAS.md` (kolejka i workery): przy 3–5 zespołach jeden serwer wystarcza, a analiza
w procesie serwera jest już kolejkowana. Wracamy do tego, gdy analiza jednego zespołu zacznie blokować innych
(miara: czas odpowiedzi API przy analizie w tle, alert z T6).

## 5. Prawo i zaufanie (minimum)
- Podmiot, który zawiera umowy (działalność lub spółka) — decyzja właściciela, z doradcą.
- Regulamin bety, polityka prywatności, **umowa powierzenia (DPA)** z listą podprzetwarzających (hosting, baza,
  kopie bazy — Backblaze B2, dostawca AI — AWS Bedrock w UE, poczta) i regionem danych.
- Jasna informacja, co trafia do modelu AI (treść historyjek i stron, przycięta przez `maxCharsPerSource`, z
  `redactPersonalData`) i że dostawca AI nie trenuje na danych (sprawdzić w aktualnych warunkach dostawcy).
- Kontakt w sprawie incydentu i czas reakcji (np. odpowiedź w 1 dzień roboczy).
- Strona „Bezpieczeństwo” z tym, co już jest: szyfrowanie tokenów, RLS, audyt, tokeny tylko do odczytu dla maszyn.

## 6. Przebieg (około 12 tygodni)

| Faza | Czas | Co | Wynik |
|---|---|---|---|
| 0. Przygotowanie | 3–4 tyg. | T1–T9, dokumenty z §5, lista 10 kandydatów, formularz zgłoszenia i ankiety z [`BETA-SURVEYS.md`](BETA-SURVEYS.md) w narzędziu (§8), panel miar | środowisko produkcyjne, 3–5 zgód |
| 1. Pierwszy zespół | 2 tyg. | ankieta wejściowa, samodzielne wdrożenie według instrukcji (podłączenie Jiry, pierwsza analiza, decyzje) z nami na czacie, poprawki zgłoszonych błędów | lista poprawek przed kolejnymi; czas do pierwszej decyzji |
| 2. Pozostałe zespoły | 6 tyg. | onboarding po jednym zespole na tydzień, ankieta co 2 tygodnie, tygodniowy przegląd panelu miar | miary z §1 |
| 3. Ocena | 1–2 tyg. | ankieta końcowa (z ceną), podsumowanie miar, decyzja | go / zmiana kierunku / stop |

## 7. Ankiety i cena (zamiast rozmów)
Pytania są w [`BETA-SURVEYS.md`](BETA-SURVEYS.md), gotowe do przeniesienia do formularza:
- **Formularz zgłoszenia** (raz, przed startem): dane zespołu, zgoda na mierzenie i ankiety, akceptacja regulaminu bety.
- **Ankieta wejściowa** (raz, przed pierwszą analizą, ok. 7 min): jak dziś sprawdzają gotowość, punkt odniesienia
  (ile historyjek wróciło z developmentu przez niejasne wymagania w ostatnim sprincie).
- **Ankieta co dwa tygodnie** (ok. 5 min, 8 pytań): konkretne ustalenia z kluczem, szum, oszczędzony czas, co
  przeszkadza. Wysyłana w aplikacji i mailem do osoby kontaktowej zespołu.
- **Ankieta końcowa** (raz, w fazie 3, ok. 10 min): pytanie Seana Ellisa, cena (cztery pytania Van Westendorpa i
  propozycja planu Team), co musiałoby się zmienić, żeby zapłacić.

Zasady:
- **Pytania sprawdzające:** każda ankieta ma pytania, których odpowiedź da się porównać z pomiarem (np. „ile
  ustaleń odrzuciliście jako fałszywe” wobec zdarzeń `finding_decided` z `effect: dismiss`) albo które wymagają
  konkretu (klucz historyjki, który da się znaleźć w audycie). Rozbieżność > 50% albo przykład, którego nie ma w
  danych, oznacza, że odpowiedź traktujemy ostrożnie i pytamy dodatkowo (krótka wiadomość, nie rozmowa).
- **Wypełnialność:** cel ≥ 80% ankiet dwutygodniowych; dwie brakujące z rzędu → wiadomość do osoby kontaktowej.
- **Cena:** w ankiecie końcowej konkretna propozycja planu Team (per stanowisko z limitem AI, `SAAS.md` §6) i dwie
  alternatywy (per zespół, per przestrzeń); zapisujemy próg „za drogo”.
- **Oferta na koniec:** zniżka dla design partnerów na pierwszy rok w zamian za zgodę na referencję.

## 8. Pomiar: narzędzie i co mierzymy
**Narzędzie (rekomendacja): PostHog w regionie UE** — zdarzenia produktowe, panele (retencja, lejki) i ankiety
w jednym narzędziu, z biblioteką dla Node.js do wysyłki z serwera; ma też wersję do samodzielnego hostowania.
Przed wyborem potwierdzić: aktualny cennik i limit darmowy, region danych UE, DPA i miejsce na liście
podprzetwarzających (§5). Alternatywa bez nowego podprzetwarzającego: zdarzenia tylko w audycie Quorum, raport
tygodniowy z niego (T8) i ankiety w formularzu (np. Tally albo Google Forms — też z DPA).

Zasady:
- Zdarzenia wysyła **serwer**, nie przeglądarka: bez automatycznego zbierania kliknięć, bez nagrywania sesji, bez
  treści z Jiry, Confluence i Figmy, bez imion i e-maili. Osoba i przestrzeń jako pseudonimy (skrót HMAC z sekretem
  serwera), organizacja jako identyfikator grupy.
- Wyłącznik per przestrzeń w ustawieniach (`telemetry: off`) i zmienna serwera wyłączająca wysyłkę w całości;
  bez zgody z formularza (§7) wysyłka wyłączona.
- Wspólna lista zdarzeń w kodzie (jeden moduł), testy, że żadne zdarzenie nie niesie pola spoza listy.

**Zdarzenia** (nazwa — kiedy — właściwości; wszystkie mają `workspace`, `org`, `user` jako pseudonimy i `at`):

| Zdarzenie | Kiedy | Właściwości |
|---|---|---|
| `source_connected` | podłączenie Jiry, Confluence, Figmy albo repo | `source` |
| `analysis_completed` | koniec analizy | `trigger` (manual, schedule, webhook, gate), `items`, `findings_open`, `durationMs`, `ai` (tak/nie), `ai_tokens`, `ai_cost_usd` |
| `finding_shown` | ustalenie po raz pierwszy w wyniku | `rule`, `severity`, `origin` (rule, ai) |
| `finding_decided` | decyzja na ustaleniu | `rule`, `severity`, `origin`, `effect` (resolve, accept_risk, dismiss, confirm), `age_hours` (od `finding_shown`) |
| `answer_proposal_judged` | przyjęcie, poprawka albo odrzucenie odpowiedzi ze źródła (A2a) | `outcome`, `rule` |
| `item_approved` | zatwierdzenie historyjki | `forced` (tak/nie), `blocking_findings` |
| `drift_detected` | dryf po zatwierdzeniu | `kind` |
| `item_viewed` | otwarcie strony elementu | `type` |
| `mcp_tool_called` | wywołanie narzędzia MCP | `tool` |
| `gate_run` | bramka na PR (`analyze --repo`) | `result` (pass, fail), `changes` |
| `survey_answered` | odpowiedź na ankietę | `survey` (entry, biweekly, exit) |

**Miary** (liczone w narzędziu, przeglądane co tydzień):

| Miara | Wzór | Do czego (§1) |
|---|---|---|
| Aktywny tydzień zespołu | tydzień z ≥ 1 `analysis_completed` i ≥ 1 `finding_decided` w przestrzeni | powroty |
| Retencja tygodniowa | odsetek zespołów aktywnych w tygodniu N od startu | powroty |
| Trafność ustaleń | `finding_decided` z `effect` resolve lub accept_risk ÷ wszystkie `finding_decided` | trafność |
| Fałszywe alarmy | `effect: dismiss` ÷ wszystkie `finding_decided`, osobno dla `origin: ai` i `rule` | trafność |
| Ustalenia bez reakcji | `finding_shown` bez `finding_decided` po 14 dniach ÷ `finding_shown` | szum |
| Czas do pierwszej wartości | od `source_connected` do pierwszego `finding_decided` | onboarding |
| Akceptacja odpowiedzi ze źródeł | przyjęte bez zmian ÷ ocenione `answer_proposal_judged` | A2a, autonomia |
| Koszt AI na zespół i analizę | suma `ai_cost_usd` per przestrzeń i tydzień; średnia na analizę | cena, T4 |
| Wymuszone zatwierdzenia | `item_approved` z `forced` ÷ wszystkie | czy blokady są trafne |

**Zrobione (2026-11-09, T8).** Decyzja właściciela: własny log zawsze, PostHog dodatkowo, gdy jest klucz.
- `packages/server/src/usage.ts`: zamknięta lista zdarzeń i ich właściwości (`USAGE_EVENTS`, `cleanProps()` odrzuca
  wszystko spoza listy), pseudonimy HMAC-SHA256 z sekretem instalacji (`CI_USAGE_SECRET` albo losowy, zapisany raz
  w `_platform`), własny log `usage-events` w `_platform` (organizacja i przestrzeń jawnie, osoba jako pseudonim),
  `PostHogSink` (API `/batch/`, region UE domyślnie, `POSTHOG_API_KEY`, `POSTHOG_HOST`): tylko pseudonimy, bez profili
  osób dla zdarzeń bez osoby, `$geoip_disable`; wysyłka partiami co 30 s, nieudana partia czeka na następną próbę.
- Mierzone są tylko zespoły bety, które zaczęły betę i nie wyłączyły pomiaru (zgoda z formularza). Pierwsza
  organizacja i tryb `token` nie są mierzone; `CI_USAGE=off` wyłącza całość.
- Źródła zdarzeń: po każdej analizie (`analysis_completed` z kosztem AI z audytu wywołań w oknie analizy,
  `finding_shown` raz na ustalenie, `drift_detected` raz na zdarzenie dryfu; pamięć „widzianych” w
  `usage-seen-<przestrzeń>.json`), z udanych żądań osób (`finding_decided` z `age_hours`, `answer_proposal_judged`,
  `item_approved`, `item_viewed`, `survey_answered`) i z połączenia Atlassiana (`source_connected`). Trasy nie wiedzą
  o pomiarze (hak `onResponse`).
- Raport: `GET /api/beta/enrollments/:id/usage` (operator) liczy miary z tabeli wyżej (`usageReport()`): tygodnie
  aktywne, trafność, fałszywe alarmy per pochodzenie, ustalenia bez reakcji po 14 dniach, czas do pierwszej decyzji,
  akceptację odpowiedzi ze źródeł, wymuszone zatwierdzenia, koszt AI, ankiety. Panel operatora: *Usage*.
- Wyłącznik: `PUT /api/beta/measurement { on }` (Admin zespołu), na stronie *Beta surveys*; `GET /api/auth/me` →
  `beta.measurement`.
- Różnice wobec planu: wyłącznik jest per zespół (organizacja), nie per przestrzeń; `mcp_tool_called` i `gate_run`
  nie są jeszcze mierzone (MCP i CLI działają tokenem maszyny, bez osoby i organizacji); „ustalenie bez reakcji”
  porównuje regułę w przestrzeni, nie pojedyncze ustalenie.
- Testy: `packages/server/test/usage.test.ts` (U-01–11), `packages/web/test/beta.test.ts` (BUI-11).

## 9. Ryzyka

| Ryzyko | Skutek | Ograniczenie |
|---|---|---|
| Za dużo fałszywych ustaleń | zespół przestaje otwierać narzędzie | polityka `suggest` zamiast `apply`, przegląd odrzuconych co tydzień, ewaluacje AI (`AI-QUALITY-PLAN.md`) |
| Koszt AI wyższy niż zakładany | strata na każdym zespole | T4 (twardy limit), pomiar kosztu na analizę od pierwszego tygodnia |
| Wyciek lub utrata danych klienta | koniec bety i reputacji | T1, T5, T7, T9, DPA |
| Zespół nie wypełnia ankiet | brak wniosków jakościowych | krótka ankieta (5 min) w aplikacji, przypomnienie, dwie brakujące → wiadomość; miary z §8 zbierają się i bez ankiet |
| Pomiar zbiera za dużo | ryzyko RODO, utrata zaufania | zdarzenia z serwera z zamkniętej listy, pseudonimy, wyłącznik, DPA z narzędziem analityki |
| Rozjazd uwagi na nowe funkcje w trakcie bety | beta bez wniosków | zamrożenie zakresu; nowe pomysły trafiają do `TODO.md` |

## 10. Decyzje właściciela przed startem
1. Hosting i region (rekomendacja: zarządzana platforma kontenerów w UE z zarządzanym Postgresem; ShipScope działa
   już na Render, co upraszcza obsługę — sprawdzić aktualny cennik i dostępność regionu UE).
2. Dostawca AI dla bety (Anthropic API albo Bedrock w regionie UE) i limit miesięczny na przestrzeń. **Decyzja
   (2026-11-09):** Claude przez Bedrock w UE, płaci platforma, $50 na przestrzeń i miesiąc, zmieniane w trakcie
   bety; własny klucz zespołu (BYOK) po becie.
3. Nazwa produktu i domena (potrzebne do aplikacji Atlassian, T2).
4. Podmiot prawny i dokumenty z §5.
5. Lista kandydatów do bety.
6. Narzędzie do pomiaru i ankiet (rekomendacja: PostHog w UE, §8) albo wariant bez nowego podprzetwarzającego.
7. Progi i dostawca maili dla T10 (`BETA-ENROLLMENT-PLAN.md`, „Decyzje właściciela”): po ilu dniach zaległej
   ankiety wstrzymanie, czy wstrzymanie automatyczne czy po potwierdzeniu, ile dni danych po końcu bety.
