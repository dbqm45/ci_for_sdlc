# Archetypy w warstwach systemu (niezależnie od technologii)

Archetyp to model biznesowy. W każdej warstwie przyjmuje inną postać — ta sama wiedza, różne odpowiedzialności.
Idiomy konkretnego języka i frameworka biorą się ze skilli `lang-*` i `fw-*` (sekcja „Pojęcia domenowe w …”).

## Gdzie co żyje
| Warstwa | Rola archetypu | Pojęcia ze słownika |
|---|---|---|
| **Domena (serwer)** | źródło prawdy reguł i niezmienników | agregat, obiekt wartości, maszyna stanów, polityka, zdarzenie, repozytorium |
| **Krawędź modułu (API, fasada)** | mały, stabilny kontrakt archetypu (np. zablokuj/zwolnij/wyłącz), tłumaczenie DTO ↔ domena | wynik operacji, moduł, zdarzenie integracyjne |
| **Integracja** | Published Language archetypu między kontekstami | zdarzenia (notification / state transfer), read model po stronie odbiorcy |
| **Odczyt** | skonsolidowane widoki (kalendarz, historia zapisów, katalog) | read model |
| **UI** | odwzorowanie kształtu i stanów; podpowiedzi, nie decyzje | obiekt wartości (formatowanie, wejście), warianty, read model, maszyna stanów żądania |

## Twarde zasady dla UI (w każdym frameworku)
1. **Ceny, rabaty, odsetki, sumy do zapłaty liczy serwer.** UI pokazuje cenę i jej opis; wyliczenie lokalne tylko jako
   podgląd oznaczony „orientacyjnie” i nigdy nie wysyłany jako kwota do zapłaty.
2. **Zasobów, o które się konkuruje, nie rezerwujemy optymistycznie.** Stan `pending` → wynik z serwera; konflikt to
   normalny wynik. Optymistyczne UI tylko dla operacji bez konkurencji.
3. **Kwoty nigdy na typie zmiennoprzecinkowym** w obliczeniach; jeden formatter.
4. **Reguły przychodzą jako dane** (ograniczenia cech, reguły konfiguratora, dostępność) — UI ich nie wymyśla.
5. W UI **język biznesu** („Klient”, „Termin”), nie nazwy archetypów („Party”, „Blockade”).

## Sygnały w kodzie (dowolny język)
| Sygnał | Prawdopodobny archetyp |
|---|---|
| kwota jako `float/double/number` + osobne pole waluty, zaokrąglanie w wielu miejscach | Money / Quantity |
| wartość i jednostka jako osobne teksty, jednostka doklejana przy wyświetlaniu | Quantity |
| `isCompany`, `isCustomer`, pola osoby i firmy w jednej strukturze, osobne klasy User/Customer/Lead dla tej samej strony | Party |
| flagi `isReserved`, `inMaintenance`, ręczne sprawdzanie nakładania dat w wielu miejscach | Availability |
| kolumny/pola cech na sztywno, osobny formularz lub klasa per typ produktu | Product |
| łańcuchy `if` włączające/wyłączające opcje | Configurator |
| rabaty, odsetki, opłaty w `if`-ach serwisów lub widoków | Pricing |
| pole `balance` aktualizowane bezpośrednio, „korekta” nadpisująca kwotę | Accounting |
| kolejność oczekujących liczona ad hoc | Waitlist |
| ręczne dopasowywanie zasobów do zadań | General assignment |

## Czy zastosować archetyp w danej warstwie?
Tak, gdy: pojęcie występuje w wielu miejscach warstwy i ma być spójne; są reguły dające natychmiastową informację
zwrotną; błędy są kosztowne; druga strona (np. backend) już modeluje archetyp i kontrakt zwraca jego kształt.
Nie, gdy: to jeden prosty ekran/endpoint CRUD, druga strona nie zna pojęcia (najpierw analiza), albo powstałby
„framework archetypów” dla jednego przypadku.

## Jak moduły archetypów rozmawiają ze sobą
| Sposób | Kiedy | Ryzyko |
|---|---|---|
| **fasada synchroniczna** (np. przydział woła „zablokuj” w dostępności) | potrzebna natychmiastowa odpowiedź „udało się?” | pokusa jednej transakcji przez dwa moduły — świadomy kompromis, zapisz w ADR; docelowo saga/outbox |
| **zdarzenia prywatne vs publikowane** | prywatne w module; publikowane = Published Language na krawędzi | publikowanie zdarzeń wewnętrznych wiąże odbiorców z modelem nadawcy |
| **ACL jako czysta funkcja tłumacząca** | dane z systemu legacy / zewnętrznego | tłumaczenie nie może przeciekać dalej niż do typu wejściowego modułu |
| **saga / proces menedżer** | reakcja na zdarzenia z kilku modułów (np. monitorowanie ryzyka projektu) | stan procesu musi być zapisany; kroki jawne |
Granice importów między modułami pilnuj regułą lintera lub testem architektury (odpowiednik testów ArchUnit) — nie tylko konwencją.
Unikaj cykli zależności między modułami (A → B → A); wspólne typy przenieś do wspólnego jądra.

