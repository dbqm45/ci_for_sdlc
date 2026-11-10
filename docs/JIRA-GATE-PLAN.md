# Bramka gotowości w Jirze (aplikacja Forge) — plan

Stan: 2026-11-10, plan do decyzji. Fakty o Forge i Marketplace pochodzą z wyszukiwania w dokumentacji i forach
Atlassiana (źródła w §9); część jest sprzeczna albo niepotwierdzona i jest tak oznaczona — przed każdą decyzją
sprawdź aktualną dokumentację.

## 1. Cel

PO dodaje historyjkę w Jirze. Quorum ją ocenia (kryteria akceptacji, kształt historyjki, braki w pokryciu,
gotowość dla agentów AI). Dopóki ocena to „not ready”, **Jira nie pozwala przenieść historyjki do „Ready for
Development”** i pokazuje, czego brakuje. Gdy PO poprawi historyjkę, przejście działa. Świadome odstępstwo („akceptuję
ryzyko”) jest możliwe i zostaje w audycie.

## 2. Co już jest, a czego brakuje

| Jest | Brakuje |
|---|---|
| Reguły kryteriów akceptacji (AC-001…004), kształtu historyjki (STORY-*, „One user action”, „Observable result”…), obsługi błędów (ERR-*), pokrycia, projektu i dokumentacji, przegląd AI | reguły „gotowe dla agenta” (AGENT-*), §5 |
| Ocena każdej historyjki: `ready` / `needs_attention` / `not_ready` z listą braków i pytaniami | wyniku nie widać w Jirze |
| Ponowna analiza po webhooku z Jiry | blokady przejścia w Jirze |
| Decyzje (odpowiedź na pytanie zamyka ustalenie) i polityki (które reguły włączone) | ustawienie, które reguły **blokują**, a które tylko ostrzegają |

## 3. Rozwiązanie: aplikacja Forge

Forge to platforma Atlassiana do aplikacji w Jirze i Confluence w chmurze (Connect jest wygaszany). Aplikację piszemy
sami (TypeScript, Forge CLI), wdrażamy `forge deploy` na infrastrukturę Atlassiana — bez serwera po naszej stronie.
W repo: nowy pakiet `packages/forge/` (`manifest.yml` + kilkaset linii).

**Moduły:**
1. **`jira:workflowValidator`** na przejściu do „Ready for Development”: funkcja Forge pyta Quorum o gotowość
   historyjki i zwraca odmowę z listą braków. Dokumentacja opisuje wzorzec walidatora-funkcji wołającego zewnętrzny
   system; domena Quorum musi być zadeklarowana w manifeście (`permissions.external.fetch.backend`).
2. **`jira:issuePanel`** „Quorum readiness”: braki, pytania, link do Quorum, przycisk „akceptuję ryzyko”.
3. **Forge Remote** do rozmowy z Quorum: Atlassian podpisuje każde wywołanie tokenem, więc Quorum wie, z której
   strony Jiry i od jakiej aplikacji przychodzi pytanie, bez naszych kluczy w aplikacji.

**Ważne:** walidator ma mało czasu na odpowiedź, więc **nie uruchamia analizy**, tylko czyta gotową ocenę. Quorum
liczy ją wcześniej (webhook po każdej zmianie historyjki). Gdy oceny nie ma albo jest starsza niż treść historyjki,
walidator odmawia z komunikatem „Quorum jeszcze sprawdza — spróbuj za chwilę” (albo przepuszcza — do decyzji, §8).

**Plus tego wariantu:** Quorum dalej potrzebuje tylko **odczytu** Jiry (`read:jira-work`); blokuje sama Jira.

## 4. Po stronie Quorum

- `GET /api/forge/readiness?issue=<KEY>`: ocena historyjki (status, blokujące braki, ostrzeżenia, data oceny,
  wersja treści) dla zapytania podpisanego przez Forge Remote; strona Jiry (`cloudId`) → przestrzeń zespołu.
- `POST /api/forge/override`: „akceptuję ryzyko” od zalogowanego w Jirze użytkownika → decyzja w Quorum + audyt.
- Ustawienie przestrzeni: które reguły **blokują** (domyślnie tylko twarde, deterministyczne: brak AC, AC w złym
  formacie, niesprawdzalne sformułowania, brak celu, reguły AGENT); ustalenia AI **nigdy nie blokują** (mogą być
  fałszywe), tylko ostrzegają.
- Rejestracja instalacji: strona Jiry, która zainstalowała aplikację, łączy się z przestrzenią (operator albo Owner
  przestrzeni potwierdza powiązanie).

## 5. Reguły „gotowe dla agenta” (AGENT-*)

Historyjka, którą agent AI może zrealizować bez dopytywania. Propozycja (do dopracowania przykładami, test-first):

| Reguła | Sprawdza |
|---|---|
| AGENT-001 Zakres | jest sekcja „poza zakresem / czego nie robić” albo jednoznaczny zakres |
| AGENT-002 Kryteria sprawdzalne automatem | każde kryterium ma obserwowalny wynik (Given/When/Then, wartości, komunikaty), bez „szybko”, „intuicyjnie” |
| AGENT-003 Ograniczenia | wymienione kontrakty (API, zdarzenia, schemat), wymagania niefunkcjonalne tam, gdzie mają znaczenie |
| AGENT-004 Przykłady | przykładowe dane wejściowe/wyjściowe albo przypadki brzegowe |
| AGENT-005 Odnośniki | link do projektu (Figma), dokumentu lub kodu, którego historyjka dotyczy |
| AGENT-006 Zależności | zależności od innych historyjek nazwane i rozwiązane albo oznaczone |
| AGENT-007 Rozmiar | jedna rzecz do zrobienia (łączy się z „One user action” i „Story size”) |

## 6. Uprawnienia i konta

**Po naszej stronie (budowa):**
- konto deweloperskie Atlassiana (darmowe) i Forge CLI;
- witryna testowa Jira Cloud, na której jesteśmy adminem (`forge install` na cudzą witrynę wymaga admina tej witryny);
- konsola deweloperska: link dystrybucyjny (*Distribution*) do instalacji u zespołów bez Marketplace.

**Po stronie zespołu (instalacja i konfiguracja):**
- **instalacja:** administrator Jiry (uprawnienie *Administer Jira*, admin produktu). Źródła się różnią — w części
  przypadków potrzebny był też admin organizacji/witryny; sprawdzić na witrynie pierwszego zespołu;
- **dodanie walidatora do przejścia:** admin Jiry w **projekcie zarządzanym przez firmę (company-managed)** —
  edycja schematu workflow;
- **projekty zarządzane przez zespół (team-managed):** manifest dopuszcza `team-managed`, ale zgłoszenia deweloperów
  mówią, że edytor workflow tych projektów nie uruchamia walidatorów aplikacji. **Do sprawdzenia w próbie (P0)**;
  jeśli nie działa, w takim projekcie zostaje tylko panel z ostrzeżeniem;
- **PO i zespół:** zwykły dostęp do projektu (panel widzi każdy, kto widzi historyjkę);
- **plan Jiry:** walidatory działają w planach z edycją workflow — sprawdzić, czy plan *Free* na to pozwala.

**Uprawnienia aplikacji (scopes):** `read:jira-work` (treść historyjki), `storage:app` (ustawienia instalacji),
zewnętrzny `fetch` tylko do domeny Quorum. Bez zapisu w Jirze.

## 7. Czy Forge jest płatny — i jak sprzedawać razem z Quorum

**Koszt platformy (dla nas, jako twórców):** od stycznia 2026 Forge rozlicza się za zużycie, z darmową pulą na
aplikację i miesiąc. Funkcje: darmowe **100 000** albo **200 000 GB-sekund** miesięcznie (źródła Atlassiana podają
różne liczby), potem $0,000025 za GB-sekundę; funkcja ma 0,5 GB, więc 100 000 GB-s to ok. 200 000 sekund pracy.
Walidator i panel to krótkie wywołania — przy kilku zespołach to darmowa pula. Wywołania asynchroniczne są
płatne od 1 lipca 2026; my ich nie potrzebujemy.

**Prowizja Marketplace (gdy sprzedajemy przez Atlassiana):** dla aplikacji Forge 15% → 16% (od 1.04.2026) → 17% (od
1.10.2026), według najnowszego ogłoszenia; wcześniejszy plan mówił o 0% do 1 mln USD przychodu — **sprawdzić aktualne
warunki**. Aplikacje z Forge Remote mogą mieć stawkę Forge, jeśli nie zawierają modułów Connect.

**Modele sprzedaży:**

| Model | Jak | Plusy | Minusy |
|---|---|---|---|
| **A. Quorum sprzedawane bezpośrednio, aplikacja jako darmowy „konektor”** | Klient płaci nam za Quorum (abonament na przestrzeń); aplikacja Forge jest darmowa i działa tylko z kontem Quorum — jak integracje GitHub czy Figma dla Jiry | własny cennik i klienci, pełny przychód | **niepewne prawnie w Marketplace:** Forge ma tylko modele *Free* i *Paid via Atlassian*; wg forum Atlassian odmawiał listingu darmowej aplikacji, gdy SaaS ma własne płatności (spór, czy dotyczy to aplikacji, która tylko łączy z zewnętrzną usługą). **Wymaga pisemnej zgody Atlassiana** przed listingiem. Poza Marketplace (link dystrybucyjny) działa bez tego |
| **B. Wszystko przez Atlassiana (*Paid via Atlassian*)** | Aplikacja płatna w Marketplace (cena za użytkownika Jiry, według progów), w cenie konto Quorum zakładane przy instalacji | jeden zakup w znanym kanale, faktura od Atlassiana — łatwiej w dużych firmach | prowizja 16–17%, cena zależna od liczby użytkowników Jiry, nie od wartości; klient Quorum bez Jiry kupuje osobno |
| **C. Hybryda** | Klienci bezpośredni płacą nam (model A poza Marketplace, link dystrybucyjny); klienci z Marketplace kupują model B; Quorum sprawdza uprawnienie (licencja Marketplace albo abonament) | dwa kanały | dwa cenniki i rozliczenia do utrzymania |

**Pomysł na osobne funkcjonowanie — „Quorum Lite for Jira”:** reguły deterministyczne (AC, kształt historyjki,
AGENT-*) są czystym TypeScriptem w `packages/core`, więc mogą działać **w samej aplikacji Forge, bez serwera
Quorum**: walidator ocenia historyjkę na miejscu, dane nie opuszczają Atlassiana (szansa na odznakę *Runs on
Atlassian*, łatwiej o zgodę działów bezpieczeństwa). To darmowe albo tanie wejście przez Marketplace; pełne Quorum
(źródła krzyżowe, Confluence, Figma, AI, drift, decyzje) jako płatne rozszerzenie. Uwaga: jeśli „rozszerzenie”
odblokowuje funkcje w samej aplikacji, to znów pytanie z modelu A — do potwierdzenia z Atlassianem.

**Rekomendacja:** w becie **link dystrybucyjny, bez Marketplace i bez płatności** (pytanie o model nas nie blokuje).
Przed sprzedażą: zapytać pisemnie Atlassian Marketplace o model A i Lite; jeśli odmówią, model C.

## 8. Plan prac (PR-y)

| # | Co | Wynik |
|---|---|---|
| P0 | **Próba:** minimalna aplikacja Forge z walidatorem, który odmawia na podstawie sztywnej odpowiedzi Quorum; instalacja na witrynie testowej | odpowiedź na pytania: czas walidatora, team-managed, plan Free, kto instaluje |
| P1 | Quorum: `GET /api/forge/readiness` z weryfikacją Forge Remote, powiązanie witryny z przestrzenią | walidator czyta prawdziwą ocenę |
| P2 | Reguły AGENT-001…007 (najpierw przypadki testowe z przykładów) i ustawienie „blokuje / ostrzega” | „gotowe dla agenta” w ocenie |
| P3 | Walidator i panel w pełni: lista braków, „akceptuję ryzyko” → decyzja w Quorum, audyt | proces z §1 |
| P4 | Instrukcja dla zespołu (instalacja, dodanie walidatora do przejścia) w `DEPLOYMENT.md`; link dystrybucyjny | pierwszy zespół z blokadą |
| P5 | Po becie: decyzja o modelu sprzedaży (§7), listing w Marketplace, przegląd bezpieczeństwa Atlassiana | kanał sprzedaży |

**Decyzje otwarte:** (1) co robi walidator, gdy oceny jeszcze nie ma — odmawia czy przepuszcza z ostrzeżeniem;
(2) kto może „zaakceptować ryzyko” (każdy z prawem przejścia czy tylko PO/Admin); (3) czy pierwszy zespół ma projekt
company-managed.

## 9. Źródła (dostęp 2026-11-10)

- [Updates to Forge Pricing: Effective January 2026](https://www.atlassian.com/blog/developer/updates-to-forge-pricing-effective-january-2026)
- [Forge platform pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/)
- [Questions about billing for Forge asynchronous invocations](https://community.developer.atlassian.com/t/questions-about-billing-for-forge-asynchronous-invocations/99871)
- [jira:workflowValidator — manifest reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-validator/)
- [jira:workflowCondition — manifest reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-workflow-condition)
- [How to block the transition with Forge](https://community.developer.atlassian.com/t/how-to-block-the-transition-with-forge/57922)
- [Distributing your Atlassian Forge app](https://moserit.com/blog/distributing-your-atlassian-forge-app)
- [Insufficient permissions to install app](https://community.developer.atlassian.com/t/error-insufficient-permissions-to-install-app-install-on-staging/99187)
- [CLOUD-12942: Control for Forge apps installation](https://jira.atlassian.com/browse/CLOUD-12942)
- [Marketplace revenue share updates: 2026](https://community.developer.atlassian.com/t/marketplace-revenue-share-updates-2026/91727)
- [Extended timelines for Marketplace revenue share changes](https://community.developer.atlassian.com/t/extended-timelines-for-marketplace-revenue-share-changes/96668)
- [Free Forge app with a paid plan sold on our own site?](https://community.developer.atlassian.com/t/free-forge-app-with-a-paid-plan-sold-on-our-own-site-via-a-merchant-of-record-permitted-or-must-it-be-paid-via-atlassian/103068)
- [Listing Forge app as paid by vendor](https://community.developer.atlassian.com/t/listing-forge-app-as-paid-by-vendor-on-marketplace/67145)
- [Marketplace pricing, payment and billing](https://developer.atlassian.com/platform/marketplace/pricing-payment-and-billing/)
