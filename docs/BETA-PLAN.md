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

Dodatkowo, jakościowo: które ustalenia oszczędziły pracę (przykłady z rozmów), czego brakowało, co przeszkadzało.

## 2. Kto
- **3–5 zespołów** (design partners), nie więcej — każdy dostaje uwagę i rozmowę co dwa tygodnie.
- **Profil:** zespół produktowy na Jira Cloud i Confluence (Figma mile widziana), 5–30 osób, z PO lub analitykiem,
  który pisze historyjki; najlepiej taki, który już narzeka na niejasne wymagania lub poprawki po review.
- **Źródła kontaktów:** własna sieć, społeczności PO/QA, osoby z poprzednich projektów. Bez płatnej reklamy.
- **Umowa bety:** bezpłatnie na czas bety, w zamian rozmowy co dwa tygodnie i zgoda na mierzenie użycia; DPA
  podpisane przed podłączeniem prawdziwych danych.

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
| T1 | **Hosting produkcyjny:** obraz z `Dockerfile`, usługa w regionie UE, zarządzany Postgres z odtwarzaniem do punktu w czasie, domena i HTTPS | dane klientów nie mogą leżeć na laptopie | obraz jest, wdrożenia brak |
| T2 | **Aplikacja Atlassian (OAuth 3LO) na domenie produkcyjnej**, logowanie i połączenie Jiry/Confluence per przestrzeń | każdy zespół łączy własną witrynę | kod jest (#104, OAuth Atlassian), rejestracja aplikacji na produkcji brak |
| T3 | **Figma per przestrzeń:** token Figmy zapisany zaszyfrowany w przestrzeni (albo OAuth Figmy) zamiast `FIGMA_TOKEN` serwera | dziś jeden token na instalację — nie do przyjęcia przy kilku klientach | brak |
| T4 | **AI z limitem per przestrzeń:** klucz platformy (Anthropic albo Bedrock w UE), licznik zużycia z telemetrii (#91) i twardy limit miesięczny; po przekroczeniu analiza bez AI | koszt AI to główny koszt zmienny | telemetria jest, limitu brak |
| T5 | **Kopie i odtwarzanie:** dzienna kopia bazy poza dostawcą hostingu, próba odtworzenia przed startem i raz w becie | utrata decyzji klienta zabija zaufanie | brak |
| T6 | **Monitoring i alerty:** `/api/health` w zewnętrznym monitorze, logi błędów z alertem, panel zużycia AI | dowiadujemy się o awarii przed klientem | health jest |
| T7 | **Usunięcie danych klienta na żądanie:** usunięcie przestrzeni z kasowaniem (dziś archiwizacja) i odłączenie OAuth | wymóg RODO i DPA | archiwizacja jest, kasowania brak |
| T8 | **Pomiar użycia bez zewnętrznej analityki:** zdarzenia z audytu (analiza, decyzja, zatwierdzenie, odrzucone ustalenie) w raporcie per przestrzeń i tydzień | miary z §1 | audyt jest, raportu brak |
| T9 | **Przegląd bezpieczeństwa przed startem:** skan zależności, przegląd tras bez uwierzytelnienia, prosty test DAST (np. OWASP ZAP) na środowisku testowym | minimum przed prawdziwymi danymi | skan zależności w CI jest |

Świadomie odkładamy krok 5 z `SAAS.md` (kolejka i workery): przy 3–5 zespołach jeden serwer wystarcza, a analiza
w procesie serwera jest już kolejkowana. Wracamy do tego, gdy analiza jednego zespołu zacznie blokować innych
(miara: czas odpowiedzi API przy analizie w tle, alert z T6).

## 5. Prawo i zaufanie (minimum)
- Podmiot, który zawiera umowy (działalność lub spółka) — decyzja właściciela, z doradcą.
- Regulamin bety, polityka prywatności, **umowa powierzenia (DPA)** z listą podprzetwarzających (hosting, baza,
  dostawca AI, poczta) i regionem danych.
- Jasna informacja, co trafia do modelu AI (treść historyjek i stron, przycięta przez `maxCharsPerSource`, z
  `redactPersonalData`) i że dostawca AI nie trenuje na danych (sprawdzić w aktualnych warunkach dostawcy).
- Kontakt w sprawie incydentu i czas reakcji (np. odpowiedź w 1 dzień roboczy).
- Strona „Bezpieczeństwo” z tym, co już jest: szyfrowanie tokenów, RLS, audyt, tokeny tylko do odczytu dla maszyn.

## 6. Przebieg (około 12 tygodni)

| Faza | Czas | Co | Wynik |
|---|---|---|---|
| 0. Przygotowanie | 3–4 tyg. | T1–T9, dokumenty z §5, lista 10 kandydatów, scenariusz rozmowy | środowisko produkcyjne, 3–5 zgód |
| 1. Pierwszy zespół | 2 tyg. | wdrożenie z nami na rozmowie (podłączenie Jiry, pierwsza analiza, decyzje), poprawki zgłoszonych błędów | lista poprawek przed kolejnymi |
| 2. Pozostałe zespoły | 6 tyg. | onboarding po jednym zespole na tydzień, rozmowy co 2 tygodnie, tygodniowy raport T8 | miary z §1 |
| 3. Ocena | 1–2 tyg. | podsumowanie miar, rozmowy o cenie, decyzja | go / zmiana kierunku / stop |

## 7. Rozmowy i cena
- Scenariusz rozmowy: ostatnie ustalenie, które pomogło; ostatnie, które było szumem; co robili przed Quorum; czego
  brakuje. Notatki w jednym miejscu, cytaty z datą.
- Pytanie o cenę pod koniec bety, z konkretną propozycją planu Team (per stanowisko z limitem AI, `SAAS.md` §6)
  i dwoma alternatywami (per zespół, per przestrzeń). Zapisujemy próg, przy którym „za drogo”.
- Oferta na koniec: zniżka dla design partnerów na pierwszy rok w zamian za zgodę na referencję.

## 8. Ryzyka

| Ryzyko | Skutek | Ograniczenie |
|---|---|---|
| Za dużo fałszywych ustaleń | zespół przestaje otwierać narzędzie | polityka `suggest` zamiast `apply`, przegląd odrzuconych co tydzień, ewaluacje AI (`AI-QUALITY-PLAN.md`) |
| Koszt AI wyższy niż zakładany | strata na każdym zespole | T4 (twardy limit), pomiar kosztu na analizę od pierwszego tygodnia |
| Wyciek lub utrata danych klienta | koniec bety i reputacji | T1, T5, T7, T9, DPA |
| Zespół nie ma czasu na rozmowy | brak wniosków | umowa bety z rytmem rozmów; mniej zespołów, ale zaangażowanych |
| Rozjazd uwagi na nowe funkcje w trakcie bety | beta bez wniosków | zamrożenie zakresu; nowe pomysły trafiają do `TODO.md` |

## 9. Decyzje właściciela przed startem
1. Hosting i region (rekomendacja: zarządzana platforma kontenerów w UE z zarządzanym Postgresem; ShipScope działa
   już na Render, co upraszcza obsługę — sprawdzić aktualny cennik i dostępność regionu UE).
2. Dostawca AI dla bety (Anthropic API albo Bedrock w regionie UE) i limit miesięczny na przestrzeń.
3. Nazwa produktu i domena (potrzebne do aplikacji Atlassian, T2).
4. Podmiot prawny i dokumenty z §5.
5. Lista kandydatów do bety.
