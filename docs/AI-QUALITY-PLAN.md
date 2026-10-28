# Jakość warstwy AI — telemetria wywołań i zestaw ewaluacyjny

Stan: 2026-10-28 — kroki 1 i 2 zrealizowane (bez płatnego przebiegu). Decyzja właściciela z 2026-10-28: najpierw telemetria kosztu i czasu, potem zestaw ewaluacyjny,
a o wyszukiwaniu na embeddingach decyduje wynik ewaluacji.

## TL;DR
Warstwa AI (recenzent specyfikacji w `packages/core/src/ai/`) działa, ale nie da się o niej powiedzieć dwóch
rzeczy: **ile kosztuje i jak długo trwa** oraz **czy jest dobra i czy zmiana jej nie pogorszy**. Ten plan dodaje
(1) tokeny, koszt i czas do każdego wpisu audytu wywołania AI oraz zestawienie per model, (2) stały zestaw przypadków
z oczekiwanymi ustaleniami, ocenę wyniku modelu (czułość, trafność, poprawność cytatów, fałszywe alarmy) i raport
porównujący modele lub prompty razem z kosztem i czasem.

## Dlaczego to ważne

### Stan dziś (sprawdzone w kodzie 2026-10-28)
- `AiAuditRecord` (`packages/core/src/project.ts`) zapisuje dostawcę, model, źródła, liczbę ustaleń, odrzuconych
  i pytań oraz błąd. **Nie ma tokenów, kosztu ani czasu**, choć API zwraca zużycie w każdej odpowiedzi.
- Jakość mierzy tylko `auto-close-stats.ts`: ile propozycji odpowiedzi ludzie przyjęli, poprawili lub odrzucili.
  To pomiar **po wdrożeniu**, na produkcji. Nie mówi, czy zmiana promptu (`SYSTEM_PROMPT` w `ai/types.ts`), modelu
  albo poziomu `effort` czegoś nie zepsuje, zanim zobaczy to użytkownik.

### Co to da
- **Koszt pod kontrolą.** Widać koszt analizy jednej pozycji, całego przebiegu i modelu. Wywołanie, które przez
  długi kontekst kosztuje kilka razy więcej niż reszta, jest widoczne w zestawieniu zamiast dopiero na fakturze.
- **Czas pod kontrolą.** Wiadomo, czy analiza jest wolna przez model, czy przez nasz kod; p50 i p95 czasu wywołania
  pokazują, czy zmiana modelu albo przycięcie źródeł coś daje.
- **Bezpieczne zmiany w AI.** Każdą zmianę promptu, modelu lub `effort` sprawdzamy przed wdrożeniem na tych samych
  przypadkach — jak testy jednostkowe, tylko dla części z modelem. Regresja jakości wychodzi w raporcie, nie u klienta.
- **Liczby zamiast wrażeń.** Czułość (ile znanych problemów model znalazł), trafność według etykiet, odsetek
  cytatów, których nie ma w źródle (zmyślone dowody), fałszywe alarmy na poprawnych specyfikacjach, odpowiedzi
  na otwarte pytania (trafne, błędne, zmyślone).
- **Tańszy model tam, gdzie wystarcza.** Raport stawia jakość obok kosztu i czasu, więc widać, czy tańszy model
  lub niższy `effort` daje prawie tę samą jakość. W fabryce tf podobny pomiar pozwolił mocno obciąć koszt bez utraty
  jakości (tf `docs/evals/`).
- **Podstawa decyzji o embeddingach.** Zestaw pokaże, czy problemy z dopasowaniem źródeł (dziś TF-IDF w `text.ts`)
  przekładają się na zgubione ustalenia. Embeddingi dodamy tylko wtedy, gdy pomiar to uzasadni.

## Zakres

### Krok 1 — telemetria wywołań (TDD)
- `packages/core/src/ai/usage.ts`:
  - `AiUsage` — tokeny wejścia, wyjścia, odczytu i zapisu cache;
  - cennik (USD za milion tokenów) dla modeli Claude na API Anthropic, z datą źródła; własne stawki organizacji
    (Bedrock, OpenAI, umowy) przyjmuje `AiRunOptions.prices` w core — model bez stawki ma koszt „nieznany”, nie zero.
    Pole w ustawieniach serwera na własne stawki: później, gdy ktoś będzie go potrzebował;
  - `aiCallCost(usage, price)` i `summarizeAiCalls(records)` — per dostawca i model: wywołania, błędy, tokeny,
    koszt, czas p50/p95, liczba wywołań bez ceny.
- Analizatory (`ai/providers.ts`) zwracają zużycie z odpowiedzi (Claude: `usage.*_tokens`, OpenAI-zgodne:
  `usage.prompt_tokens`/`completion_tokens`). Zużycie nie trafia do cache wyników.
- `semanticPass` (`project.ts`) mierzy czas wywołania i dopisuje do `AiAuditRecord`: `latencyMs`, `usage`,
  `costUsd`. Wpis z cache nie ma kosztu (nie było wywołania).
- Serwer: szczegóły wpisu `ai_call` zawsze mają telemetrię (także przy `recordEvidenceSources: false` — to liczby,
  nie treść źródeł); podsumowanie wpisu ma tokeny i koszt; `GET /ai/usage` zwraca zestawienie z dziennika audytu.

### Krok 2 — zestaw ewaluacyjny (TDD dla oceny; dane jako pliki)
- `packages/core/evals/spec-review.cases.json` — przypadki: wejście recenzenta (`SemanticInput`: pozycja i źródła)
  i oczekiwania:
  - `findings` — oczekiwane ustalenia: kategoria (lub dopuszczalne kategorie), źródła, które powinny być cytowane,
    słowa kluczowe, z których co najmniej jedno ma paść w tytule lub wyjaśnieniu;
  - `answers` / `noAnswer` — odpowiedzi na otwarte pytania, których źródło udziela, i pytania bez odpowiedzi
    (model nie może jej wymyślić);
  - `clean: true` — poprawna specyfikacja, na której każde ustalenie `critical` jest fałszywym alarmem.
- Rodzaje przypadków: luka, konflikt między źródłami, niejednoznaczność, brak stanu w projekcie Figmy, nieaktualna
  dokumentacja, decyzja człowieka (nie podważać, zgłosić sprzeczne źródło), odpowiedź na otwarte pytanie, pytanie
  bez odpowiedzi, poprawna specyfikacja, polecenie wstrzyknięte w treść źródła, źródła po polsku i angielsku.
  Start: kilkanaście przypadków; cel 30–50, dopisywanych z prawdziwych pomyłek (każdy błąd z produkcji → przypadek).
- `packages/core/src/ai/eval.ts` — ocena bez modelu (deterministyczna):
  - dopasowanie ustalenia do oczekiwanego: zgodna kategoria, cytuje oczekiwane źródło, pada słowo kluczowe;
    jedno ustalenie pokrywa najwyżej jedno oczekiwane;
  - miary: czułość (pokryte oczekiwane / oczekiwane), trafność według etykiet (dopasowane / zgłoszone — dolna
    granica, bo ustalenie bez etykiety może być słuszne), poprawność cytatów (cytat dosłownie w cytowanym źródle),
    fałszywe alarmy `critical` na poprawnych przypadkach, odpowiedzi trafne / błędne / zmyślone;
  - raport Markdown: tabela konfiguracji (dostawca, model, effort) z miarami jakości obok tokenów, kosztu i czasu
    p50/p95; pod nią przypadki z różnicami.
- `packages/core/evals/run.ts` (`npm run eval:ai`):
  - bez `--paid` (domyślnie): sprawdza zestaw i szacuje tokeny wejścia oraz koszt wejścia per konfiguracja,
    **bez wywołań modelu i bez kosztu**;
  - `--paid --config anthropic:claude-haiku-5-5:low --config anthropic:claude-opus-5-5:high …` — wywołuje modele
    i zapisuje raport (`docs/evals/<data>-spec-review.md`) oraz surowe wyniki (`.json`). **Kosztuje; uruchamiamy
    tylko za zgodą właściciela.**
  - `--replay <plik.json>` — ocenia zapisane wyniki jeszcze raz, bez modelu (po zmianie etykiet lub miar);
  - `--only <id,id>`, `--cases <plik>`, `--out <ścieżka>`.
- Testy (vitest, bez sieci): poprawność zestawu (referencje źródeł istnieją, oczekiwane cytaty są w źródłach,
  identyfikatory unikalne), ocena na ręcznie przygotowanych wynikach (trafienie, pudło, zmyślony cytat, fałszywy
  alarm, zmyślona odpowiedź), raport.

### Poza zakresem (świadomie)
- Embeddingi i RAG — decyzja po pierwszym raporcie ewaluacji.
- Sędzia LLM do oceny ustaleń bez etykiety — najpierw etykiety i słowa kluczowe (tanie, powtarzalne); sędzia,
  jeśli trafność według etykiet okaże się zbyt zaniżona.
- Ewaluacja w CI z modelem — w CI działają testy oceny i walidacja zestawu (zwykłe `npm test`), bez wywołań modelu.

## Kolejność
1. Ten plan. ✓
2. Telemetria: testy (czerwone) → `usage.ts`, analizatory, `semanticPass`, serwer → testy zielone. ✓
   (core `test/ai-usage.test.ts` TEL-01…10, serwer EN-06, EN-07, EN-17, API-07; kontrakt OpenAPI: `/ai/usage`)
3. Ewaluacja: testy oceny i zestawu (czerwone) → `eval.ts`, przypadki, `run.ts` → zielone. ✓
   (core `test/ai-eval.test.ts` EVAL-01…16; 14 przypadków; przebieg bez `--paid` i `--replay` sprawdzone ręcznie)
4. PR ✓ (#91). Pierwszy płatny przebieg: zgoda właściciela jest (2026-10-28), wstrzymany do czasu klucza
   `ANTHROPIC_API_KEY` w środowisku (pozycja w `TODO.md`).

## Jak używać
- Zestawienie kosztu i czasu wywołań AI w działającym serwerze: `GET /api/ai/usage` (albo `/api/w/<ws>/ai/usage`).
  Każdy wpis `ai_call` w dzienniku audytu ma `latencyMs`, `usage` i (gdy cena jest znana) `costUsd`. Zestawienie
  liczy wywołania z ostatnich 5000 wpisów audytu i wymaga włączonego `security.auditAiDecisions` (domyślnie tak).
- Sprawdzenie zestawu i szacunek kosztu: `npm run eval:ai -- --config anthropic:claude-haiku-5-5:low`.
- Przebieg płatny (za zgodą): `npm run eval:ai -- --paid --config … --config …`.
- Nowy przypadek: dopisz do `packages/core/evals/spec-review.cases.json`; `npm test` sprawdzi, że referencje
  i pytania się zgadzają. Pomyłka recenzenta z produkcji → nowy przypadek z poprawnym oczekiwaniem.

## Cennik
Stawki domyślne: API Anthropic (pierwsza strona), USD za milion tokenów, stan cennika z 2026-10-06 (skill
claude-api, tabela „Current Models”): Fable 5.1 10/50, Opus 5.5 4/20, Opus 5 5/25, Sonnet 5.5 i Sonnet 5 2/10,
Haiku 5.5 0,10/0,50 (do 100 tys. tokenów wejścia; powyżej wyższa stawka, której kod nie uwzględnia). Odczyt cache:
Fable 5.1 0,25, Opus 5.5 i Sonnet 5.5 0,20 (podane w źródle); Opus 5, Sonnet 5 i Haiku 5.5 — 0,1 × stawka wejścia
[założenie]. Zapis do cache: 1,25 × stawka wejścia [założenie: zapis z TTL 5 min].
Ceny Bedrock, Vertex i OpenAI są inne lub nieznane — bez stawki organizacji koszt jest „nieznany”.
