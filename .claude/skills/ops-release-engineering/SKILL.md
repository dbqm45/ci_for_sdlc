---
name: ops-release-engineering
description: Użyj przy sposobie wydania — rolling, blue/green, canary z wycofaniem, feature flagi, GitOps, migracje bazy w CD.
metadata:
  katalog: "Użyj przy wyborze i konfiguracji sposobu wydania — rolling, blue/green, canary z bramkami metryk i automatycznym wycofaniem, feature flagi z datą usunięcia, GitOps (Argo CD, Flux), migracje bazy w CD (expand–contract), środowiska podglądu dla PR. Nie do samej budowy pipeline'u (ops-ci-cd) ani zasad trunk-based i DORA (eng-continuous-delivery)."
---

# Inżynieria wydań

Cel: wydanie jest nudne. Każda zmiana ma ograniczony zasięg (blast radius), mierzalne kryterium sukcesu i drogę
powrotu szybszą niż naprawa.

## 1. Wybór strategii
| Strategia | Kiedy | Uwagi |
|---|---|---|
| rolling | zmiany rutynowe, usługi bezstanowe, zgodne wstecz | tanio; wycofanie jest wolne (kolejny rolling) |
| blue/green | ścieżki krytyczne (płatności, logowanie), gdy potrzebny natychmiastowy powrót | sprawdź nieaktywne środowisko **przed** przełączeniem ruchu; koszt podwójnej infrastruktury |
| canary | gdy staging nie odtwarza produkcji (ruch, dane, integracje) | wymaga metryk per wersja i automatycznej decyzji |
| feature flag / dark launch | oddzielenie wdrożenia od włączenia funkcji | każda flaga ma właściciela i datę usunięcia |
Wybierasz według trzech pytań: jakie ryzyko akceptujemy, jak szybko musimy wrócić, jak dobrze umiemy zweryfikować wersję.

## 2. Canary z bramkami
- Drabina ruchu, np. 1–5% → 10% → 25% → 50% → 100%, z czasem obserwacji na każdym kroku (np. 10–15 minut na pierwszym).
- Bramki z metryk wersji kanarkowej względem stabilnej, np. odsetek błędów < 0,1% i p99 < 200 ms (progi dobierasz do
  SLO usługi — ops-sre-incidents). Przekroczenie = **automatyczne** wycofanie, bez czekania na człowieka.
- Narzędzia: Argo Rollouts, Flagger (Kubernetes), wagi ruchu w load balancerze lub service mesh. Lustrzany ruch
  (shadowing) pozwala sprawdzić wersję bez wpływu na użytkowników.
- Mierz, oprócz DORA: częstość wycofań i czas od wykrycia do wycofania.

## 3. GitOps
- Stan docelowy (manifesty, wersje obrazów, konfiguracja) w Git; kontroler (Argo CD, Flux) uzgadnia z nim klaster
  i cofa ręczne zmiany (drift). Wycofanie = `git revert`.
- Polityki (bezpieczeństwo, zasoby, zgodność) sprawdzane w PR, zanim zmiana trafi do klastra. Zmiany niskiego ryzyka
  mogą się scalać automatycznie, wysokiego — z akceptacją człowieka.
- Promocja między środowiskami przez Git (PR ze zmianą wersji), nie przez ręczne `kubectl apply`.
- Sekrety nie w postaci jawnej: SOPS, Sealed Secrets albo zewnętrzny menedżer (Vault, External Secrets).
- Wcześnie zdecyduj: jedno repozytorium konfiguracji czy osobne per zespół; jak wygląda ścieżka dev → staging → prod.

## 4. Migracje bazy w ciągłym dostarczaniu
- **Expand–contract w osobnych wydaniach:** (1) dodaj nową kolumnę/tabelę i zapisuj do obu, (2) przełącz odczyty,
  (3) usuń stare. Nigdy zmiana schematu i zmiana aplikacji, która jej wymaga, w jednym wdrożeniu.
- Każda migracja działa z **dwiema** wersjami aplikacji naraz (stara i nowa chodzą równolegle podczas wdrożenia)
  i jest idempotentna.
- W CI linter DDL blokuje operacje blokujące tabelę (np. `CREATE INDEX` bez `CONCURRENTLY` w PostgreSQL).
- Migracje dużych tabel testuj na danych o rozmiarze produkcyjnym (be-database).

## 5. Środowiska podglądu (preview)
- Środowisko per PR: izolowane, tworzone automatycznie, z obowiązkowym czasem życia i usuwaniem po zamknięciu PR.
- Dane syntetyczne lub zamaskowane, osobne sekrety, brak portów zarządzania z internetu (ops-iac-terraform).
- Środowisko testów wydajności może być mniejsze niż produkcja, ale tworzone na żądanie, nie stałe.

## 6. Konfiguracja jako część wydania
Wydanie to kod **i** konfiguracja: flagi, ConfigMapy, sekrety, zmienne środowiskowe, wersja modelu AI. Zmieniasz je
w tym samym PR, promujesz tą samą ścieżką i wycofujesz razem. Aplikacja bez wymaganej konfiguracji nie zgłasza
gotowości, więc wydanie zatrzymuje się samo (ops-kubernetes, sekcja 4).

## 6a. Wycofanie przećwiczone, nie założone
Plan wycofania, którego nikt nie wykonał, zwykle zawodzi wtedy, gdy jest potrzebny.
- **Ćwicz regularnie** (np. raz na kwartał i po zmianie pipeline'u): wycofanie na stagingu lub w canary, z pomiarem
  czasu od decyzji do przywrócenia.
- Warunki, które sprawdzasz: poprzedni obraz **wciąż jest w rejestrze** (polityka retencji nie kasuje ostatnich N wydań
  produkcyjnych — przypięte digestem); migracje bazy zgodne z poprzednią wersją (sekcja 4); pipeline nadal umie wdrożyć
  starą wersję; konfiguracja i flagi wracają razem z kodem (sekcja 6).
- Zmiany nieodwracalne (usunięcie kolumny, migracja danych, zmiana formatu wiadomości) oznacz w PR — dla nich ścieżką
  powrotu jest naprawa w przód lub odtworzenie z kopii (ops-sre-incidents), co trzeba wiedzieć **przed** wydaniem.

## 6b. Zmiana awaryjna na produkcji
Ręczna zmiana bywa konieczna w incydencie, ale bez zapisu tworzy dryf: następne wdrożenie ją cofnie albo nowa maszyna
jej nie dostanie.
- Robisz ją świadomie: zapis w dzienniku incydentu (kto, co, dlaczego), w GitOps — jawne wstrzymanie samonaprawy dla
  tego zasobu, inaczej narzędzie od razu cofnie zmianę.
- Ta sama zmiana trafia do repozytorium (kod, IaC, manifest) **w ciągu jednego dnia roboczego**; potem wznawiasz
  synchronizację. Zasada: co istnieje na produkcji, istnieje w kontroli wersji.
- Wykrywanie dryfu (ops-iac-terraform, GitOps) i tak złapie zmiany zapomniane.

## 7. Agent a wydania
Agent przygotowuje zmianę (manifest, konfigurację rolloutu, PR w repozytorium GitOps) i opis bramek. Nie promuje
wersji na produkcję i nie wyłącza automatycznego wycofania bez zgody człowieka.
Numer wydania i tag `vX.Y.Z` liczy wg SemVer skryptem z core-semver. Opublikowanego tagu ani obrazu z pełną wersją
nie nadpisuje; poprawka to nowa wersja.

## Przykład
**Sytuacja:** nowy ranking w `search-api`; staging nie ma prawdziwego ruchu, SLO: błędy < 0,1%, p99 < 200 ms.
**Wynik:** canary w Argo Rollouts, PR w repozytorium GitOps, promocję zatwierdza człowiek.
- Drabina: 5% (15 min) → 25% (10 min) → 50% (10 min) → 100%; analiza w tle od pierwszego kroku.
- Bramki z Prometheusa dla `track="canary"`: `result[0] < 0.001` (5xx) i `< 0.2` s (p99), `failureLimit: 2`.
- Trzeci nieudany pomiar = automatyczne wycofanie do stabilnej wersji, bez czekania na dyżurnego.
- Obraz przypięty digestem, `revisionHistoryLimit: 5`; mierzysz czas od wykrycia do wycofania.

Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] strategia dobrana do ryzyka i wymaganej szybkości powrotu
- [ ] bramki canary z progów SLO i automatyczne wycofanie
- [ ] flagi z właścicielem i datą usunięcia
- [ ] migracje expand–contract, zgodne z dwiema wersjami aplikacji, linter DDL w CI
- [ ] środowiska podglądu z czasem życia- [ ] wycofanie przećwiczone (czas zmierzony), poprzednie obrazy zachowane w rejestrze
- [ ] zmiany awaryjne odtworzone w repozytorium, samonaprawa GitOps wznowiona


## Źródła
- [Mastering the Blast Radius: Progressive Delivery in Modern DevOps](https://devops.com/mastering-the-blast-radius-deployment-without-fear-progressive-delivery-in-modern-devops/)
- [Software Deployment Strategies for Enterprise Teams](https://devops.com/software-deployment-strategies-for-enterprise-teams-a-scenario-based-guide-to-choosing-the-right-approach/)
- [GitOps in 2026: Why Pull Requests Are Taking Over Cloud Operations](https://devops.com/gitops-in-2026-why-pull-requests-are-taking-over-cloud-operations/)
- [From Legacy to GitOps: A Roadmap for Enterprise Modernization](https://devops.com/from-legacy-to-gitops-a-roadmap-for-enterprise-modernization/)
- [Avoiding Database Migration Pitfalls with Continuous Software Delivery](https://devops.com/avoiding-database-migration-pitfalls-with-continuous-software-delivery/)
- [Ephemeral Environments are Better for Scaling Your Tests](https://devops.com/ephemeral-environments-are-better-for-scaling-your-tests/)
- [10 Minor DevOps Mistakes That Can Cause Major Production Issues](https://medium.com/coinmonks/10-minor-devops-mistakes-that-can-cause-major-production-issues-191d141e7686) — Pawan Natekar, 2026 (nieprzećwiczone wycofanie, ręczne zmiany na produkcji)
