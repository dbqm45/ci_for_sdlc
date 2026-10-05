# Przykłady zasad projektowych

## 1. Review pod kątem nadmiaru (YAGNI, drabina minimalizmu)
**Sytuacja:** „Zrób review PR dodającego eksport raportu do CSV”. PR ma 140 linii: interfejs `ReportExporter`,
fabrykę `ExporterFactory`, klasę `CsvReportExporter` i własną funkcję formatowania dat.

**Jak:**
1. **Drabina minimalizmu:** czy jest wymaganie *teraz*? Tak, ale tylko CSV — drugi format nie jest planowany.
2. **YAGNI:** interfejs z jedną implementacją i fabryka jednego produktu są zakazane bez drugiego przypadku.
3. Szczebel „biblioteka standardowa”: formatowanie dat robi `Intl.DateTimeFormat`.
4. Granica: walidacji danych wejściowych i obsługi błędu zapisu **nie** upraszczasz.
5. Uwagi w formacie jednej linii, bilans na końcu; poprawność oceniona osobno.

**Wynik:**
```text
L12: yagni interfejs ReportExporter (1 implementacja, brak planu drugiej) → funkcja exportCsv(rows)
L31: usuń ExporterFactory → bezpośrednie wywołanie exportCsv
L58: stdlib własne formatDate() → Intl.DateTimeFormat("pl-PL")
L77: skróć ręczne sklejanie przecinków → jedna funkcja escapeCsvField użyta w map/join
Bilans: −96 / +18 linii. Walidacja wierszy (L90–L104) zostaje — granica zaufania.
```
Po zmianie:
```ts
const dateFormat = new Intl.DateTimeFormat("pl-PL");

function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function exportCsv(rows: { client: string; total: number; issuedAt: Date }[]): string {
  const lines = rows.map((r) => [r.client, r.total.toFixed(2), dateFormat.format(r.issuedAt)].map(escapeCsvField).join(","));
  return ["client,total,issuedAt", ...lines].join("\n");
}
```

## 2. DRY czy KISS — dwa podobne fragmenty
**Sytuacja:** „W PR są dwie pary podobnego kodu. Wydzielić wspólne funkcje?” Para A: walidacja długości nazwy produktu
i nazwy kategorii (obie `1..80` znaków). Para B: rabat 10% od 500 zł liczony w koszyku (frontend) i w serwisie zamówień.

**Jak:**
1. Pytanie kontrolne DRY: *ta sama wiedza biznesowa* czy przypadkowo podobny kod?
2. Para A — przypadkowe podobieństwo (limity mogą się rozjechać niezależnie): **KISS/YAGNI > DRY**.
3. Para B — jedna reguła cenowa w dwóch miejscach: **DRY > KISS** dla wiedzy biznesowej.
4. **AHA / reguła trzech:** brak trzeciego przypadku dla A, więc bez abstrakcji z flagami.

**Wynik — decyzja:**

| Para | Decyzja | Uzasadnienie (zasada + koszt) |
|---|---|---|
| A: długość nazw | zostawić duplikat | KISS: wspólna funkcja z parametrem „typ pola” to zła abstrakcja; duplikacja jest tańsza |
| B: rabat 10% od 500 zł | jedno źródło: `pricing.discountFor(total)`, frontend pobiera wynik z API | DRY: reguła w dwóch miejscach rozjedzie się przy pierwszej zmianie progu |

## 3. Tell, don't ask i prawo Demeter
**Sytuacja:** „Review metody wypłaty z konta”.
```ts
// przed
type Balance = { getAmount(): number; setAmount(v: number): void };
type Account = { getBalance(): Balance };
declare const account: Account;
declare const amount: number;

if (account.getBalance().getAmount() >= amount) {
  account.getBalance().setAmount(account.getBalance().getAmount() - amount);
}
```

**Jak:**
1. **Prawo Demeter:** `account.getBalance().getAmount()` — rozmowa z obcym obiektem.
2. **Tell, don't ask:** decyzję o wystarczającym saldzie może podjąć samo konto.
3. **Fail fast:** brak środków sygnalizuj od razu, a nie cichym pominięciem wypłaty.
4. Gettery do odczytu (wyciąg, prezentacja) zostają — reguła nie każe usuwać wszystkich.

**Wynik:**
```ts
class InsufficientFunds extends Error {}

export class BankAccount {
  constructor(private balance: number) {}

  withdraw(amount: number): void {
    if (amount > this.balance) throw new InsufficientFunds(`Brak środków: ${amount} > ${this.balance}`);
    this.balance -= amount;
  }

  get currentBalance(): number {
    return this.balance; // zapytanie do prezentacji — w porządku
  }
}
```
Uwaga w review: „Demeter + tell, don't ask: reguła salda jest poza kontem, więc każdy wywołujący może ją pominąć →
`account.withdraw(amount)`”.
