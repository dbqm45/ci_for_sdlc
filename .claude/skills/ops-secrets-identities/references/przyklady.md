# Przykłady: sekrety i tożsamości maszynowe

> **Spis treści:** 1. Klucz chmurowy wypchnięty do publicznego repozytorium · 2. OIDC zamiast stałych kluczy w CI · 3. Przegląd inwentarza tokenów

Nazwy, konta i liczby są ilustracyjne.

## 1. Klucz chmurowy wypchnięty do publicznego repozytorium
**Sytuacja:** „Ktoś wrzucił `deploy.env` z kluczem dostępowym AWS do publicznego repozytorium `acme/shop-sdk`.
Usunąłem plik kolejnym commitem, to wystarczy?”

**Jak:**
1. Nie wystarczy: klucz jest w historii i mógł zostać użyty w ciągu minut (wstęp skilla). Najpierw rotacja (sekcja 4).
2. Ustal z inwentarza właściciela, zakres i zależne usługi, żeby rotacja niczego nie wyłączyła po cichu (sekcja 1).
3. Sprawdź w logach chmury użycie klucza od chwili pusha.
4. Unieważnij wszystko, co było osiągalne z tym kluczem (np. sekrety odczytane z menedżera sekretów).
5. Dopiero potem czyszczenie historii i luka w zabezpieczeniach: dlaczego nie zatrzymał tego hook ani push protection.

**Wynik:** runbook rotacji.

| # | Krok | Kto | Cel czasowy | Dowód |
|---|---|---|---|---|
| 1 | dezaktywuj klucz `AKIA…7Q2X` konta `svc-shop-deploy` | dyżurny | 15 min od zgłoszenia | status „Inactive” w konsoli |
| 2 | wydaj nowe poświadczenie albo od razu przejdź na OIDC (przykład 2) | właściciel `svc-shop-deploy` | 1 h | udane wdrożenie testowe |
| 3 | przejrzyj logi audytu chmury z okna od pusha do dezaktywacji | bezpieczeństwo | 4 h | lista wywołań API z tym kluczem |
| 4 | zrotuj sekrety osiągalne z roli (hasło bazy `shop-prod`, token płatności) | właściciele usług | 24 h | nowe wersje w menedżerze sekretów |
| 5 | usuń klucz z historii, włącz push protection w repozytorium, dodaj skan `--staged` w hooku | właściciel repozytorium | 2 dni | zablokowany push z testowym sekretem |
| 6 | usuń stary klucz na stałe, wpis do dziennika incydentu | dyżurny | po kroku 4 | wpis z datą |

## 2. OIDC zamiast stałych kluczy w CI
**Sytuacja:** „Mamy w sekretach repozytorium `AWS_ACCESS_KEY_ID` z uprawnieniami administratora, używany przez build
i przez wdrożenie. Zróbmy to porządnie”.

**Jak:**
1. Rozdziel tożsamości: build nie dostaje żadnej roli chmurowej, wdrożenie — osobną rolę (sekcja 2).
2. Rola wdrożeniowa przyjmowana przez OIDC, ważna minuty, a nie stały klucz.
3. Polityka zaufania przypięta do repozytorium **i** chronionego środowiska `production` — nie do każdej gałęzi.
4. Uprawnienia roli zawężone do tego, czego wdrożenie używa; po miesiącu przegląd nieużywanych akcji.
5. Stary klucz dezaktywowany i usunięty, sekret usunięty z repozytorium; wpis w inwentarzu.

**Wynik:** polityka zaufania roli `shop-deploy-prod` i fragment workflow.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:acme/shop:environment:production"
        }
      }
    }
  ]
}
```

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read          # bez id-token: build nie przyjmie żadnej roli
    steps:
      - uses: actions/checkout@<SHA>
      - run: make build
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production   # wymagana akceptacja człowieka
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: aws-actions/configure-aws-credentials@<SHA>
        with:
          role-to-assume: arn:aws:iam::123456789012:role/shop-deploy-prod
          aws-region: eu-central-1
          role-duration-seconds: 900
      - run: make deploy
```

## 3. Przegląd inwentarza tokenów
**Sytuacja:** pierwszy codzienny eksport inwentarza poświadczeń organizacji (CSV) ma 412 wierszy. Zespół pyta,
od czego zacząć.

**Jak:**
1. Alarmy z sekcji 1: brak daty wygaśnięcia, zbyt szeroki zakres, brak użycia od 90 dni.
2. Tokeny agentów AI na początek kolejki — szerokie uprawnienia, praca bez nadzoru.
3. Każda pozycja dostaje właściciela; bez właściciela → unieważnienie po ogłoszeniu terminu.
4. Inwentarz tylko raportuje — limit czasu życia PAT konfigurujesz osobno jako politykę.

**Wynik:** raport z decyzjami.

| Poświadczenie | Właściciel | Problem | Decyzja | Termin |
|---|---|---|---|---|
| PAT klasyczny `ci-release` (zakres `repo`, `admin:org`) | brak | bez wygaśnięcia, za szeroki | zastąpić GitHub App z dostępem do 2 repozytoriów | 7 dni |
| token agenta `review-bot` | zespół platformy | zapis do wszystkich repozytoriów | fine-grained, tylko odczyt kodu i komentarze PR, wygaśnięcie 30 dni | 3 dni |
| klucz SSH `deploy@old-jenkins` | brak | nieużywany od 214 dni | unieważnić | od razu |
| 37 PAT fine-grained bez użycia od 90 dni | różni | nieużywane | e-mail do właścicieli, potem unieważnienie | 14 dni |
| — | — | brak polityki | maksymalny czas życia PAT w ustawieniach organizacji | 14 dni |
