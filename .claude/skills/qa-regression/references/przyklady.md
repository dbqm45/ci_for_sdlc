# Przykłady regresji

Nazwy projektów, testów i liczby są ilustracyjne.

## 1. Podział 70-minutowego zestawu na warstwy
**Sytuacja:** „Każdy PR w monorepo Nx uruchamia wszystkie 1 400 testów, w tym 380 e2e w Playwright na trzech
przeglądarkach — 70 minut. Ludzie scalają bez czekania na wynik”.

**Jak:**
1. Testy oznaczasz tagami (`@smoke`, `@critical`, `@visual`) zamiast kopiować je do osobnych zestawów.
2. Smoke: ścieżki krytyczne i zdrowie aplikacji, jedna przeglądarka, < 5 min.
3. PR: tylko projekty dotknięte zmianą (`nx affected`) + smoke e2e, < 15 min.
4. Nocny: pełny zestaw, trzy przeglądarki, regresja wizualna, testy mutacyjne modułu płatności.
5. Mierzysz czas zestawu PR i odsetek flaky, nie liczbę testów.

**Wynik:** układ zestawów i fragment CI.

| Zestaw | Wyzwalacz | Polecenie | Zawartość | Budżet | Teraz |
|---|---|---|---|---|---|
| smoke | push na `main`, każde wdrożenie | `npx playwright test --grep @smoke --project=chromium` | 24 testy: logowanie, koszyk, płatność, `/health` | < 5 min | 3 min 40 s |
| PR | każdy pull request | `npx nx affected -t test lint` + smoke | jednostkowe i integracyjne dotkniętych projektów | < 15 min | 9–13 min |
| nocny | 2:00 codziennie | `npx playwright test` + `npx nx run-many -t test` + Stryker dla `payments` | wszystko, `chromium`/`firefox`/`webkit`, `@visual` | godziny OK | 2 h 10 min |
| przed wydaniem | kandydat `v*-rc.*` | nocny + lista kontrolna + UAT | automat i testy ręczne (qa-exploratory-manual) | wg planu | 1 dzień |

```yaml
# .github/workflows/pr.yml (fragment)
on: pull_request
jobs:
  affected:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<SHA>
        with:
          fetch-depth: 0
      - run: npm ci
      - run: npx nx affected -t test lint --base=origin/main --head=HEAD
  smoke-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@<SHA>
      - run: npm ci
      - run: npx playwright test --grep @smoke --project=chromium
```

## 2. Niestabilny test w kwarantannie
**Sytuacja:** „Test `checkout.spec.ts › płatność BLIK kończy zamówienie` w raporcie flaky padł 4 razy na 50 przebiegów
w tym tygodniu. Dodajmy `retries: 3` i będzie spokój”.

**Jak:**
1. Retries zostają tylko do wykrywania niestabilności; to defekt testu albo aplikacji, nie pech.
2. Kwarantanna: test wyjęty z bramki PR, z właścicielem, zgłoszeniem i terminem naprawy.
3. Diagnoza wg typowych przyczyn — tu sztywne czekanie na odpowiedź bramki płatności.
4. Naprawa: asercja z oczekiwaniem zamiast `waitForTimeout`; test wraca do bramki po 20 zielonych przebiegach nocnych.
5. Po terminie bez naprawy test usuwasz albo naprawiasz — nie przedłużasz bez końca.

**Wynik:** wpis w rejestrze kwarantanny i poprawka.

```yaml
# tests/quarantine.yaml
- test: "checkout.spec.ts › płatność BLIK kończy zamówienie"
  tag: "@quarantine"
  owner: "@anowak"
  issue: "QA-1187"
  since: "2026-09-28"
  deadline: "2026-10-12"
  symptom: "4/50 czerwonych, timeout na „Zamówienie przyjęte”"
  cause: "waitForTimeout(2000) zamiast oczekiwania na stan; odpowiedź symulatora BLIK trwa 1,5–3 s"
```

```ts
// przed
await page.waitForTimeout(2000);
expect(await page.getByRole('heading').textContent()).toBe('Zamówienie przyjęte');
// po
await expect(page.getByRole('heading', { name: 'Zamówienie przyjęte' })).toBeVisible({ timeout: 10_000 });
```

## 3. Idempotencja konsumenta w zestawie PR
**Sytuacja:** po wydaniu klient dostał dwa e-maile z fakturą, bo zdarzenie `InvoiceIssued` doszło dwa razy.
„Dopiszcie test e2e, który to wyłapie”.

**Jak:**
1. Regresja kontraktu wiadomości jest tańsza niż e2e — test idempotencji konsumenta idzie do zestawu PR.
2. Dane testowe ze stałym id zdarzenia i stałym czasem; ten sam serializer co outbox.
3. To samo id dwa razy → jeden efekt (jeden e-mail, jeden wpis).
4. Migawka formatu zdarzenia pilnuje kompatybilności wstecz.

**Wynik:** zestaw testów konsumenta.

| Test | Wejście | Oczekiwany efekt | Zestaw |
|---|---|---|---|
| `invoice-issued: duplikat id` | `InvoiceIssued` z `eventId=7f3a…01` dwa razy | 1 e-mail w Mailpit, 1 wiersz w `processed_events` | PR |
| `invoice-issued: różne id` | dwa zdarzenia z różnym `eventId` | 2 e-maile | PR |
| `invoice-issued: migawka formatu` | zdarzenie z fabryki, stały czas `2026-01-15T10:00:00Z` | zgodność z zapisaną migawką | PR |
| `invoice-issued: stara wersja schematu` | zdarzenie bez pola dodanego w nowej wersji | przetworzone bez błędu | PR |
