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

### Krok 1. Konto AWS i dostęp do Bedrocka
1. Konto AWS z **2FA na koncie root**; do codziennej pracy osobny użytkownik, nie root.
2. Konsola → **Amazon Bedrock**, region **eu-central-1 (Frankfurt)** → *Model access* → włącz dostęp do wybranego
   modelu Claude (Anthropic może poprosić o krótki opis zastosowania).
3. Zapisz **id modelu albo profilu wnioskowania UE** (*Inference profiles*, zwykle z przedrostkiem `eu.`) — to
   `CI_AI_MODEL`. Profil `eu.` kieruje ruch tylko do regionów UE. Na betę wystarczy Claude Sonnet; Opus jest
   ok. 2× droższy na token (stawki w `usage.ts`).
4. **IAM → Users → Create user** `quorum-bedrock`, bez dostępu do konsoli, z polityką tylko do wywoływania modelu
   (podmień region, konto i id):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
       "Resource": [
         "arn:aws:bedrock:eu-central-1:<konto>:inference-profile/<id profilu>",
         "arn:aws:bedrock:*::foundation-model/<id modelu>"
       ]
     }]
   }
   ```

   Profil `eu.` wywołuje model w kilku regionach UE, dlatego `foundation-model` ma `*` w miejscu regionu. Nie
   sprawdzałem tej polityki na koncie — jeśli Bedrock odpowie `AccessDenied`, komunikat poda brakującą akcję albo
   zasób.
5. *Security credentials → Create access key* (typ „Application running outside AWS”). `Access key ID` i `Secret
   access key` zapisz od razu w menedżerze haseł.
6. **Budżet AWS** (*Billing → Budgets*): miesięczny, np. $60 przy jednym zespole, z alertem e-mail przy 80%. To druga
   linia obrony obok limitu w aplikacji.

### Krok 2. Render
W usłudze `quorum` → *Environment*: `CI_AI_MODEL` = id z kroku 1.3, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` =
z kroku 1.5. `CI_AI_PROVIDER=bedrock`, `CI_AI_REGION=eu-central-1` i `CI_AI_MONTHLY_LIMIT_USD=50` są już w
`render.yaml`. Bez `CI_AI_MODEL` serwer nie wystartuje (komunikat to powie); do czasu założenia AWS wpisz `todo` —
analizy działają, a przegląd AI zgłosi błąd.

### Krok 3. Sprawdzenie
1. Ustawienia przestrzeni → *AI provider*: „Provided by the platform: bedrock · <model>” i linia z wydatkiem.
2. Na historyjce *AI review* → wynik bez błędu; w audycie wpis `ai_call` z kosztem.
3. `#/operator` → *AI limits*: przestrzeń ma wydatek > $0 i `calls` > 0, bez „without a known price”.
4. Dopisz **AWS (Bedrock, UE)** do listy podprzetwarzających w DPA (`BETA-PLAN.md` §5): do modelu trafia treść
   historyjek i stron (przycięta, z `redactPersonalData`). Sprawdź w aktualnych warunkach AWS, że dane wejściowe nie są
   używane do trenowania modeli, i zapisz to w informacji dla zespołów.

## 3. Ile to kosztuje

Przegląd jednej historyjki to rząd kilku–kilkunastu tysięcy tokenów wejścia i 1–2 tysięcy wyjścia: przy stawkach
Claude Sonnet z `usage.ts` ($2 / $10 za milion) to ok. $0,02–0,05. Limit $50 to więc ok. tysiąca przeglądów
miesięcznie; tryb „na żądanie” (domyślny) wysyła do modelu tylko historyjki, o które ktoś poprosił, a niezmienione
historyjki biorą wynik z pamięci podręcznej. Rzeczywisty koszt na przestrzeń widać w panelu operatora (*AI limits*,
*Usage*).
