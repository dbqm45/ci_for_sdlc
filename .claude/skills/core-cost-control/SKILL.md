---
name: core-cost-control
description: Użyj przy doborze modelu i koszcie — ocena trudności, kaskada haiku→sonnet→opus, effort, cache, kompaktowanie, pomiar.
metadata:
  katalog: "Użyj, gdy wybierasz model lub effort dla zadania albo wykonawcy, eskalujesz po nieudanej próbie, planujesz długą sesję, kompaktujesz kontekst albo analizujesz koszt i trafienia cache — rubryka trudności, kaskada modeli z parametrem model narzędzia Agent, profile kosztów, doradca (advisor), opusplan, reguły cache, kompaktowanie, raport kosztów. Nie do ograniczania halucynacji (core-grounding) ani wydajności samej aplikacji (be-database, qa-performance-testing)."
  slowa: "koszt, tokeny, tańszy model, drogi model, haiku, sonnet, opus, effort, eskalacja, cache, kompaktowanie, compact, limit, rachunek, oszczędność, profil kosztów, doradca, advisor, opusplan"
---

# Koszt i dobór modelu — najtańszy model, który przejdzie weryfikację

Cel: każde zadanie robi najtańszy model, który da wynik przechodzący **obiektywną weryfikację** (testy, lint, build,
`grounding_check`, przegląd). Model nie ocenia sam siebie „na oko”. O tym, czy wystarczył, decyduje wynik
sprawdzenia. Dopiero gdy sprawdzenie zawiedzie, idziesz poziom wyżej.

## 1. Ocena zadania przed delegowaniem
Odpowiedz na pięć pytań. Tabela routingu w prompcie persony daje tier wyjściowy, a odpowiedzi go przesuwają:

| Pytanie | Tak → | Nie → |
|---|---|---|
| Czy wynik sprawdzi polecenie (testy, lint, typy, build)? | tier niżej | tier wyżej albo przegląd |
| Czy zmianę łatwo cofnąć (git, brak danych produkcyjnych)? | tier niżej | tier wyżej |
| Czy zadanie wymaga **decyzji** (wybór podejścia, kompromis), a nie tylko wykonania? | tier wyżej | tier niżej |
| Czy dotyczy bezpieczeństwa, danych osobowych, pieniędzy, migracji danych, architektury? | deep albo przegląd deep | — |
| Czy obejmuje wiele domen lub >5 plików bez wzorca? | rozbij na kroki | — |

Typowo: mechaniczna zmiana z testem → `haiku`; funkcja w jednej domenie → `sonnet`; wybór architektury, przegląd
bezpieczeństwa, błąd bez oczywistej przyczyny po próbie → `opus`.

Opcjonalnie `python3 .claude/hooks/jev_client.py --tier "<opis zadania>"` (klucz TYPESAFE_API_KEY) zadaje te pytania
modelowi decyzyjnemu Jev w ~0,1 s za ułamek centa. Sugestię „NIEPEWNE” rozstrzygasz rubryką sam.

## 2. Kaskada modeli
- Narzędzie Agent przyjmuje parametr `model` (`haiku`, `sonnet`, `opus`). Nadpisuje on model z definicji agenta na to
  wywołanie (i na jego wznowienia). Dzięki temu ten sam wykonawca może zrobić proste zadanie taniej, a trudne drożej.
- **Start:** najtańszy model, który ma realną szansę. **Eskalacja o jeden poziom**, gdy wykonawca zgłosi blokadę albo
  weryfikacja nie przechodzi po 2 próbach. Do nowego wywołania dołącz, co nie zadziałało — inaczej mocniejszy model
  powtórzy ten sam błąd.
- **Deeskalacja:** po decyzji podjętej na `opus` (architektura, plan) implementację zlecaj znów na `sonnet`, a
  mechaniczne kroki na `haiku`.
- **Sygnał od wykonawcy:** raport może kończyć się linią `Tier: za niski — …` albo `Tier: za wysoki — …`. Hook
  `log_usage` ją zapisuje, a `cost_report.py` sumuje i podpowiada zmianę tieru roli. Przy kolejnym podobnym zadaniu
  od razu wybierz właściwy model.
- Nie przełączaj modelu **głównej sesji** w środku zadania (`/model`). Każdy model ma osobny cache, więc następna
  tura przeczyta całą historię bez rabatu. Delegowanie do wykonawcy na innym modelu nie psuje cache sesji.

## 3. Główna sesja: model, profil, doradca
- **Profil kosztów** (`python3 factory/profile.py`) przestawia cały zespół naraz:
  - `oszczedny` — bez Opusa;
  - `zrownowazony` — domyślny;
  - `jakosc` — std z effort high i doradca Opus.

  Profil zmienia też ustawienia sesji: effort, próg kompaktowania i doradcę.
- **Doradca (advisor)** — tańszy model główny wzywa mocniejszy w kluczowych momentach: przed wyborem podejścia, przy
  powracającym błędzie, przed ogłoszeniem końca. **Sam ocenia, kiedy go potrzebuje.**
  - Typowe pary: Sonnet + doradca Opus, Haiku + doradca Opus (Haiku może pytać, ale nie może doradzać).
  - Koszt: każda konsultacja czyta całą rozmowę po cenie doradcy i bez cache. Opłaca się w długich, wieloetapowych
    zadaniach, a nie w krótkich.
  - Ograniczenia: tylko API Anthropic (nie Bedrock, Vertex, Foundry); funkcja eksperymentalna. Subagenci dziedziczą
    doradcę, więc w profilu `jakosc` także tani wykonawcy mogą go wzywać.
  - Włączenie: `/advisor opus`, wyłączenie: `/advisor off`. Przełączenie doradcy nie psuje cache.
- **`opusplan`** — Opus w trybie planowania, Sonnet przy wykonaniu. Każde przełączenie trybu planowania zmienia
  model, więc oznacza pełny odczyt bez cache. Stosuj, gdy planujesz raz, a potem długo wykonujesz.
- Model i effort wybierasz **na początku sesji**.

## 4. Effort (głębokość rozumowania)
Tokeny myślenia liczą się jak tokeny wyjścia, czyli najdroższe.
- `low` — szybkie wymiany, zmiana nazwy, szkic;
- `medium` — codzienna praca o jasnym zakresie (domyślny dla Sonnet 5.5 i Opus 5.5);
- `high` — błędy w istniejącym kodzie, przypadki brzegowe, weryfikacja;
- `xhigh`/`max` — trudne problemy do samodzielnego rozwiązania (np. szukanie podatności).

Effort agentów wynika z tieru (`factory/config.yaml`), a skill może ustawić własny polem `effort`. Na większości
modeli zmiana effortu w trakcie sesji też kasuje cache. Wyjątek: Opus 5.5, Sonnet 5.5 i Fable 5.1 przez API
Anthropic lub subskrypcję.

## 5. Cache — co go psuje, a co nie
Cache działa automatycznie i dopasowuje **początek** zapytania. Odczyt z cache kosztuje ~10% ceny wejścia.

| Kasuje cache (następna tura drożej) | Nie kasuje |
|---|---|
| zmiana modelu (`/model`, `opusplan`, skill z polem `model`) | edycja plików, także CLAUDE.md (działa od `/clear`) |
| zmiana effortu (większość modeli) | wywołanie skilla, tryb uprawnień, styl odpowiedzi |
| dodanie lub usunięcie serwera MCP (gdy narzędzia ładują się od razu) | uruchomienie subagenta, `/rewind`, `/recap` |
| zablokowanie całego narzędzia regułą deny | włączenie lub wyłączenie doradcy |
| `/compact`, aktualizacja Claude Code, wiele obrazów | |

Praktyka:
- Przerwa dłuższa niż czas życia cache (5 min, w subskrypcji główna rozmowa 1 h) oznacza, że następna tura czyta
  wszystko od nowa. Po długiej przerwie wróć od punktu kontrolnego w nowej sesji, zamiast wznawiać długą historię.
- Subagenci mają cache 5-minutowy. Niezależne zlecenia uruchamiaj razem, a nie z długimi przerwami.
- Nieudaną ścieżkę porzucaj przez `/rewind`, a nie `/compact`: cofnięcie trafia w istniejący cache.
- Nie przełączaj serwerów MCP w środku zadania.

## 6. Kontekst i kompaktowanie
- Fabryka ustawia `autoCompactWindow: 200000`. Bez tego modele z oknem 1 mln kompaktują dopiero przy ~967 tys.
  tokenów. Wcześniej każda tura czyta coraz dłuższą historię, a jakość spada (core-grounding).
- `/compact <co zachować>` uruchamiaj na granicy zadań, a nie w środku. Wcześniej zapisz punkt kontrolny
  (core-project-record).
- Po kompaktowaniu treść każdego użytego skilla wraca, ale najwyżej ~5000 tokenów. Dlatego SKILL.md ma być krótki,
  a szczegóły trzymaj w `references/` (`build.py check` ostrzega).
- Zadanie niezwiązane z poprzednim zaczynasz od `/clear`.
- Eksploracja i długie wyjścia (testy, logi, dokumentacja) idą do subagenta. Do głównej sesji wraca tylko raport.

## 7. Pomiar
- **Pasek stanu** (`.claude/hooks/statusline.py`): model, effort, zapełnienie kontekstu, trafienia cache (z dopiskiem
  „zimny”, gdy cache wygasł), koszt sesji, limity. Nie zużywa tokenów modelu.
- `/usage` — trafienia cache sesji i prawdopodobna przyczyna ostatniego pudła.
- `python3 factory/cost_report.py --days 7` — koszt per agent i model, eskalacje, sygnały `Tier:` i rekomendacje
  zmiany tieru ról.

## Przykład
**Sytuacja:** wykonawca na `sonnet` dwa razy poprawiał niestabilny test terminu płatności (strefy czasowe) — dalej pada.

**Wynik:** eskalacja o jeden poziom: `Agent(model: "opus")` z opisem obu nieudanych prób i zadaniem „przyczyna +
plan, bez wdrażania”. Powód: błąd bez oczywistej przyczyny po próbie, dotyczy pieniędzy. Implementacja planu wraca
na `sonnet`; raport wykonawcy kończy linia `Tier: za niski — …`, więc przy podobnym zadaniu od razu wybierasz `opus` do diagnozy.

Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] tier wybrany rubryką (sprawdzalność, odwracalność, decyzja, ryzyko, zakres), a nie z przyzwyczajenia
- [ ] start od najtańszego sensownego modelu; eskalacja po blokadzie lub 2 nieudanych weryfikacjach, z opisem porażki
- [ ] po decyzji na opus implementacja wraca na sonnet/haiku
- [ ] model i effort sesji ustalone na początku; bez `/model` w środku zadania
- [ ] `/compact` na granicy zadań po punkcie kontrolnym; `/rewind` do porzucenia nieudanej ścieżki
- [ ] koszt sprawdzony w pasku stanu lub `cost_report.py`

## Źródła
- Anthropic, dokumentacja Claude Code (stan na 2026-10-03):
  - „How Claude Code uses prompt caching”;
  - „Model configuration” (opusplan, effort, autoCompactWindow);
  - „Subagents” (pole `model`, parametr `model` narzędzia Agent, kolejność wyboru modelu);
  - „Skills” (pola `model`, `effort`, `context: fork`);
  - „Escalate hard decisions with the advisor tool”;
  - „Manage costs effectively”;
  - „Customize your status line”.
- Anthropic, cennik API (platform.claude.com, 2026-10-03): wejście/wyjście Haiku 4.5 $1/$5, Sonnet 5.5 $2/$10,
  Opus 5.5 $4/$20 za 1 mln tokenów; odczyt cache $0,10–0,20.

Opisane własnymi słowami.
