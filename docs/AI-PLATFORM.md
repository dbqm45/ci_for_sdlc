# AI platformy z limitem na przestrzeń (T4)

Stan: 2026-11-09. Decyzja właściciela: w becie **AI zapewnia i opłaca platforma** — Claude przez **Amazon Bedrock w
UE** — z limitem **$50 na przestrzeń i miesiąc**, zmienianym w trakcie bety. Własny klucz zespołu (BYOK) jest poza
betą (`BETA-PLAN.md` §3). Kod obsługuje dalej każdego dostawcę z `ai/providers.ts` (Anthropic, Bedrock, OpenAI, Azure
OpenAI, własny endpoint), więc zmiana dostawcy to zmiana zmiennych, nie kodu.

## 1. Jak to działa

- **Dostawca i model ustawia platforma** (`CI_AI_PROVIDER`, `CI_AI_MODEL`, `CI_AI_REGION`, opcjonalnie
  `CI_AI_EFFORT`, `CI_AI_BASE_URL`, `CI_AI_API_VERSION`). Każda przestrzeń używa tego samego; jej własny wybór
  dostawcy, modelu, regionu i adresu jest pomijany. Zespół wybiera tylko, **kiedy** AI pracuje (na żądanie albo przy
  każdej analizie). Powód: przy kluczu platformy przestrzeń mogłaby inaczej wskazać własny adres (dostawca *custom*)
  i wysłać tam klucz platformy, albo wybrać najdroższy model.
- **Limit** (`CI_AI_MONTHLY_LIMIT_USD`, domyślnie 50): wydatek liczony na przestrzeń i miesiąc kalendarzowy (UTC),
  zapisany w `_platform` (`ai-budget.json`), więc zespół go nie wyzeruje. Po osiągnięciu limitu kolejne wywołania
  modelu są wstrzymane do końca miesiąca: analiza działa dalej bez AI, a wyniki AI zapisane w pamięci podręcznej
  (niezmienione historyjki) zostają. W wyniku analizy pojawia się jedna informacja „AI paused…”, a w Ustawieniach
  zespołu linia z wydatkiem i limitem.
- **Zmiana w trakcie bety:** operator na `#/operator` → *AI limits*: nowa kwota, *No limit* albo *Default*. Działa od
  następnego wywołania, bez wdrożenia; zmiana trafia do audytu przestrzeni. Przez API:
  `PUT /api/ai-budget/<przestrzeń>` z `{"limitUsd": 80}` (albo `null`, albo `"default"`), z tokenem administratora.
- **Koszt wywołania:** tokeny z odpowiedzi modelu × stawka. Dla Claude na API Anthropic i na Bedrocku domyślne stawki
  są w `packages/core/src/ai/usage.ts` (Bedrock liczony po cenniku Anthropic — **szacunek**; sprawdź cennik Bedrocka dla
  regionu i profilu, a jeśli jest inny, ustaw `CI_AI_PRICES`). Wywołanie bez znanej stawki jest liczone osobno
  („unpriced”) i **nie** zmniejsza limitu — panel operatora to pokazuje.
- **Przekroczenie:** do 3 wywołań, które już trwają (analiza wysyła 3 naraz), może skończyć się po przekroczeniu
  limitu, więc wydatek może przekroczyć limit o koszt kilku przeglądów.
- **Bez `CI_AI_PROVIDER`** (instalacja jednej organizacji, lokalnie) wszystko działa jak dotąd: przestrzeń wybiera
  AI w Ustawieniach, bez limitu.

`CI_AI_PRICES` (opcjonalnie), USD za milion tokenów:

```json
{"bedrock/eu.anthropic.claude-sonnet-5-5-v1:0": {"input": 2.2, "output": 11, "cacheRead": 0.22, "cacheWrite": 2.75}}
```

## 2. Konfiguracja (raz, właściciel)

Krok po kroku w [`DEPLOYMENT.md`](DEPLOYMENT.md): konto AWS, dostęp do modelu w Bedrocku (eu-central-1), profil UE,
użytkownik IAM tylko z `bedrock:InvokeModel`, klucze i budżet AWS (krok 3); zmienne w Render (krok 6); sprawdzenie
(krok 9); AWS Bedrock w DPA (krok 12).

## 3. Ile to kosztuje

Przegląd jednej historyjki to rząd kilku–kilkunastu tysięcy tokenów wejścia i 1–2 tysięcy wyjścia: przy stawkach
Claude Sonnet z `usage.ts` ($2 / $10 za milion) to ok. $0,02–0,05. Limit $50 to więc ok. tysiąca przeglądów
miesięcznie; tryb „na żądanie” (domyślny) wysyła do modelu tylko historyjki, o które ktoś poprosił, a niezmienione
historyjki biorą wynik z pamięci podręcznej. Rzeczywisty koszt na przestrzeń widać w panelu operatora (*AI limits*,
*Usage*).
