---
name: ops-secrets-identities
description: Użyj przy sekretach i tożsamościach maszynowych — inwentarz, skanowanie, rotacja, OIDC zamiast kluczy, PKI.
metadata:
  katalog: "Użyj przy sekretach i tożsamościach maszynowych — inwentarz kont usług, tokenów, kluczy i certyfikatów (właściciel, zakres, wygaśnięcie), rozdział tożsamości buildu i wdrożenia, skanowanie sekretów przed commitem i w CI, push protection, rotacja i sprzątanie, inwentarz kryptografii (CBOM). Nie do auth użytkowników aplikacji (be-auth-security) ani zależności (ops-supply-chain-security)."
---

# Sekrety i tożsamości maszynowe

Tożsamości nieludzkie (konta usług, tokeny CI, klucze wdrożeniowe, role chmurowe, aplikacje GitHub, tokeny agentów AI)
mnożą się szybciej niż konta ludzi i nie przechodzą przez procesy HR: nikt ich nie „zwalnia”. Dostęp nadany awaryjnie
zostaje na lata. Wyciek sekretu wypchniętego do publicznego repozytorium bywa wykorzystany w ciągu minut.

## 1. Inwentarz
Dla każdej tożsamości, która sięga do produkcji lub do repozytoriów: **właściciel, cel, zakres uprawnień, data
utworzenia, data wygaśnięcia, ostatnie użycie, co od niej zależy.**
- GitHub Enterprise Cloud udostępnia inwentarz poświadczeń (klucze SSH, PAT klasyczne i fine-grained, tokeny aplikacji
  OAuth i GitHub App) jako CSV i przez REST API, z osobnym uprawnieniem do samego podglądu. Pobieraj go codziennie
  i alarmuj o tokenach bez daty wygaśnięcia, ze zbyt szerokim zakresem i nieużywanych od 90 dni.
- Inwentarz tylko raportuje — sprzątanie i zakazy (np. maksymalny czas życia PAT) konfigurujesz osobno.
- Tokeny agentów AI traktuj priorytetowo: mają szerokie uprawnienia i działają bez nadzoru (core-agent-security).

## 2. Najmniejsze uprawnienia i krótki czas życia
- **Build i wdrożenie to osobne tożsamości.** Job budujący nie ma ról wdrożeniowych ani dostępu do produkcji.
- Poświadczenia wydawane na żądanie (OIDC → rola chmurowa, Vault z dynamicznymi sekretami), ważne minuty lub godziny,
  zamiast stałych kluczy w sekretach CI.
- Przegląd okresowy: kto przyjmuje które role chmurowe, jakie integracje ma repozytorium; nieużywane uprawnienia usuń
  (np. AWS IAM Access Analyzer pokazuje nieużywane akcje).

## 3. Skanowanie sekretów w trzech miejscach
1. **Przed commitem** (na maszynie programisty): Gitleaks lub TruffleHog na plikach dodanych do indeksu (`--staged`),
   w czasie poniżej ok. 5 s — wolny hook ludzie omijają. Przed pushem cięższe skany (OSV-Scanner, Semgrep, Trivy).
2. **Przy pushu:** GitHub push protection (domyślnie włączona w publicznych repozytoriach dla wybranych typów tokenów;
   w prywatnych trzeba ją włączyć — GitHub Secret Protection) z kontrolą ważności —
   najpierw zajmujesz się sekretami, które nadal działają.
3. **W CI** jako zabezpieczenie ostateczne, bo hooki lokalne da się pominąć (`--no-verify`).
Każdy wyjątek od skanera ma właściciela, uzasadnienie i datę wygaśnięcia. Kod napisany przez AI przechodzi te same skany
co kod ludzi — raporty dostawców wskazują, że w repozytoriach pisanych z asystentami AI wycieków sekretów jest więcej.

## 4. Gdy sekret wycieknie
- Rotujesz od razu (unieważnij, wydaj nowy), a dopiero potem czyścisz historię. Usunięcie z pliku niczego nie zamyka.
- Po incydencie unieważniasz **wszystkie** poświadczenia osiągalne z przejętego miejsca: w kampanii wokół Trivy
  napastnicy wrócili, bo pierwszego włamania nie domknięto (według analizy CloudSEK — przez jeden nieunieważniony
  token). Zakładasz, że skradzione poświadczenia mogą być użyte długo po incydencie.

## 5. Klucze, certyfikaty i kryptografia
- Certyfikaty z automatycznym odnawianiem i alarmem na zbliżające się wygaśnięcie.
- Wybór algorytmów, KMS i szyfrowanie kopertowe, cykl życia certyfikatów, własna PKI z odpornością na awarię,
  kryptografia postkwantowa: `references/kryptografia-i-pki.md`.
- Inwentarz kryptografii (CBOM, format CycloneDX): jakie algorytmy, biblioteki, protokoły, certyfikaty i klucze
  używa każda aplikacja i jak wrażliwe dane chronią. To pierwszy krok przed migracją na algorytmy odporne na komputery
  kwantowe; priorytet mają dane wrażliwe i przechowywane długo.

## Przykład
**Sytuacja:** klucz AWS z `deploy.env` trafił do publicznego repozytorium; plik usunięto kolejnym commitem.
**Wynik:** runbook — rotacja przed porządkami:
1. 15 min: dezaktywacja klucza konta `svc-shop-deploy` (właściciel i zależności z inwentarza).
2. 1 h: nowe poświadczenie albo od razu rola przez OIDC przypięta do `repo:acme/shop:environment:production`.
3. 4 h: logi audytu chmury z okna od pusha do dezaktywacji.
4. 24 h: rotacja wszystkiego, co osiągalne z tej roli (hasło bazy, token płatności).
5. 2 dni: czyszczenie historii, push protection, skan `--staged` w hooku; stary klucz usunięty.

Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] każda tożsamość maszynowa ma właściciela, zakres i datę wygaśnięcia; brak tokenów bez końca ważności
- [ ] build i wdrożenie na osobnych tożsamościach; poświadczenia krótkotrwałe przez OIDC
- [ ] skan sekretów przed commitem, push protection i skan w CI; wyjątki z datą wygaśnięcia
- [ ] procedura rotacji znana i przećwiczona; po incydencie rotacja wszystkiego, co osiągalne

## Źródła (devops.com)
- [Your CI/CD Pipeline Has Non-Human Identities You Forgot About](https://devops.com/your-ci-cd-pipeline-has-non-human-identities-you-forgot-about/)
- [GitHub Gives Enterprises a Full Count of Who Holds the Keys](https://devops.com/github-gives-enterprises-a-full-count-of-who-holds-the-keys/)
- [Shift Left to the Developer's Machine: Local Git Security Gates](https://devops.com/shift-left-to-the-developers-machine-building-local-git-security-gates/)
- [GitHub Adds 37 New Secret Detectors, Extends Scanning to AI Coding Agents](https://devops.com/github-adds-37-new-secret-detectors-in-march-extends-scanning-to-ai-coding-agents/)
- [Secrets Management Failures in CI/CD Pipelines](https://devops.com/secrets-management-failures-in-ci-cd-pipelines/)
- [Sophisticated Supply Chain Attack Targeting Trivy Expands to Checkmarx, LiteLLM](https://devops.com/sophisticated-supply-chain-attack-targeting-trivy-expands-to-checkmarx-litellm/)
- [LiteLLM Attack Affected 2,500 Companies, 434,000 CI/CD Pipelines](https://devops.com/litellm-attack-affected-2500-companies-434000-ci-cd-pipelines-cloudsek/)
- [Why Cryptographic Inventory Is the First Step Toward Quantum Readiness](https://devops.com/why-cryptographic-inventory-is-the-first-step-toward-quantum-readiness/)
