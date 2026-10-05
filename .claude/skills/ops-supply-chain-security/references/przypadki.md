# Przypadki z analiz Huntress i devops.com (streszczenia własnymi słowami)

Każdy przypadek: co się stało → co by go zatrzymało. Szczegóły techniczne i wskaźniki są w źródłach.

## axios w npm (marzec 2026)
- **Przebieg:** napastnicy przejęli komputer głównego opiekuna podczas fałszywego spotkania (podrobiony Slack firmy,
  rozmowa w Teams z kilkoma „uczestnikami”, prośba o instalację „aktualizacji”). Z przejętego konta opublikowali
  axios 1.14.1 i 0.30.4 z nową zależnością `plain-crypto-js` 4.2.1, której `postinstall` instalował zdalny dostęp (RAT)
  na Windows, macOS i Linux. Okno ataku około 3 godzin; Huntress odnotował co najmniej 135 zainfekowanych maszyn.
- **Co by zatrzymało:** karencja nowych wersji (1–3 dni), blokada skryptów instalacyjnych w CI, alarm o nowej zależności
  przechodniej, publikacja wyłącznie przez OIDC z unieważnionymi klasycznymi tokenami.
- Źródła: [Supply Chain Compromise of axios npm Package](https://www.huntress.com/blog/supply-chain-compromise-axios-npm-package),
  [axios npm Compromise: The Ultimate Supply Chain Scaries](https://www.huntress.com/blog/axios-npm-compromise)

## Kampania wieloekosystemowa (TeamPCP, marzec 2026)
- **Przebieg:** jednoczesne ataki na GitHub Actions, npm, PyPI i Docker Hub; podmieniony skaner Trivy w akcjach,
  złośliwe wersje paczki PyPI, ładunek kradnący dane ukryty w pliku dźwiękowym. Cel: sekrety z CI i laptopów programistów.
- **Co by zatrzymało:** akcje i obrazy narzędzi przypięte do SHA/digestu, krótkotrwałe poświadczenia OIDC w CI zamiast
  stałych sekretów, ograniczony ruch wychodzący z runnerów.
- Źródło: [Threat View from the Lens of Huntress Adversary Tactics: March 2026](https://www.huntress.com/threat-library/adversary-tactics/march-2026)

## Trivy → Checkmarx KICS → LiteLLM (marzec 2026, devops.com)
- **Przebieg:** grupa TeamPCP wróciła do projektu Trivy przez poświadczenie, którego nie unieważniono po wcześniejszym
  włamaniu. Złośliwa akcja czytała tokeny i klucze chmurowe z pamięci procesu runnera, po czym wykonywała normalny skan.
  Skradzione tokeny zapisu posłużyły do kolejnych kompromitacji (Checkmarx KICS, paczki npm). CI projektu LiteLLM
  zainstalował podmieniony Trivy, a złośliwe wydania LiteLLM były w PyPI około 40 minut.
- **Co by zatrzymało:** skanery w jobach bez sekretów, przypięte wersje narzędzi buildu, rotacja wszystkich
  poświadczeń po incydencie, alarm na repozytoria i wydania tworzone przez nieoczekiwane konta.
- Źródła: [Sophisticated Supply Chain Attack Targeting Trivy Expands to Checkmarx, LiteLLM](https://devops.com/sophisticated-supply-chain-attack-targeting-trivy-expands-to-checkmarx-litellm/),
  [LiteLLM Attack Affected 2,500 Companies, 434,000 CI/CD Pipelines](https://devops.com/litellm-attack-affected-2500-companies-434000-ci-cd-pipelines-cloudsek/) (liczby od dostawcy CloudSEK)

## Mini Shai-Hulud (maj 2026, devops.com)
- **Przebieg:** napastnicy opublikowali złośliwe wersje z użyciem zaufanej ścieżki publikacji ofiar (ich workflow
  GitHub Actions i tokenów OIDC), więc paczki miały poprawne provenance. Ładunek był w opcjonalnej zależności
  pobieranej z GitHuba i uruchamianej przez Bun, co omijało skanery statyczne.
- **Co by zatrzymało:** trusted publisher przypięty do workflow i chronionego środowiska z akceptacją człowieka,
  zakaz publikacji z commitów spoza chronionych gałęzi, alarm na zależności `github:`.
- Źródło: [Widespread Mini Shai-Hulud Campaign Is a Matter of Trust](https://devops.com/widespread-mini-shai-hulud-campaign-is-a-matter-of-trust/)

## React2Shell, CVE-2025-55182 (grudzień 2025)
- **Przebieg:** niebezpieczna deserializacja w protokole React Server Components pozwalała bez logowania wykonać kod
  na serwerze jednym żądaniem HTTP. Dotyczyła `react-server-dom-webpack`, `-parcel` i `-turbopack` w wersjach 19.0,
  19.1.0, 19.1.1, 19.2.0 (poprawki: 19.0.1, 19.1.2, 19.2.1), a więc także aplikacji Next.js. Ataki zaczęły się dzień po
  ujawnieniu; po włamaniu instalowano koparki kryptowalut, backdoory i tunele.
- **Co by zatrzymało:** wdrożenie łatki w ciągu doby (ścieżka wyjątków od karencji), serwer Node bez uprawnień root,
  bez powłoki w obrazie i z ograniczonym ruchem wychodzącym (ops-docker), alarm na proces serwera uruchamiający powłokę.
- Źródła: [PeerBlight Linux Backdoor Exploits React2Shell](https://www.huntress.com/blog/peerblight-linux-backdoor-exploits-react2shell),
  [Codex Red: Untangling a Linux Incident With an OpenAI Twist (Part 2)](https://www.huntress.com/blog/codex-part-two)

## Legalne narzędzia jako backdoor (Komari, 2026)
- **Przebieg:** po wejściu przez skradzione dane VPN napastnik zainstalował otwartoźródłowego agenta monitoringu
  jako usługę o mylącej nazwie, pobierając skrypt instalacyjny prosto z GitHuba. Agent dawał mu zdalną powłokę.
- **Co by zatrzymało:** brak instalatorów „pobierz i uruchom” z internetu, alarm na nowe usługi i demony, kontrola
  ruchu do `raw.githubusercontent.com` z serwerów.
- Źródło: [Komari: The 'Monitoring' Tool That Didn't Need Weaponising](https://www.huntress.com/blog/komari-c2-agent-abuse)

## Wnioski ogólne
Ataki na łańcuch dostaw wykrywa się dużo później niż włamania bezpośrednie, bo przychodzą kanałem, któremu ufasz
(podpisana aktualizacja, znana paczka). Dlatego liczą się: inwentarz (SBOM), weryfikacja (podpisy, provenance),
minimalne uprawnienia dostawców i segmentacja.
Źródło: [What Rising Supply Chain Attacks Mean for Cybersecurity Ecosystems](https://www.huntress.com/blog/rising-supply-chain-attacks-cybersecurity-ecosystems)
