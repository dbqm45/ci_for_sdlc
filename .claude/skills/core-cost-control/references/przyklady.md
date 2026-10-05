# Przykłady: dobór modelu i koszt

## 1. Zmiana nazwy pola w całym module
**Sytuacja:** „Zmień nazwę pola `custId` na `customerId` w module zamówień — DTO, mapery i testy”. Moduł ma
12 plików, testy jednostkowe przechodzą.

**Jak:**
1. Rubryka: wynik sprawdzą testy i typy (tak → tier niżej), zmianę cofnie git (tak → tier niżej), brak decyzji
   (nie → tier niżej), brak ryzyka (dane osobowe, pieniądze, migracja — nie).
2. 12 plików, ale według jednego wzorca — nie trzeba rozbijać.
3. Start od najtańszego modelu z realną szansą.

**Wynik:**
```
Delegacja: wykonawca backendu, model: haiku
Powód: zmiana mechaniczna, sprawdzalna testami i kompilacją, łatwa do cofnięcia, bez decyzji.
Weryfikacja: testy modułu + sprawdzenie typów. Eskalacja na sonnet dopiero po 2 nieudanych próbach.
```

## 2. Eskalacja po dwóch nieudanych próbach
**Sytuacja:** Wykonawca na `sonnet` ma naprawić test, który raz przechodzi, a raz nie (obsługa stref czasowych
przy wyliczaniu terminu płatności). Dwie poprawki — test dalej pada co kilka uruchomień.

**Jak:**
1. Weryfikacja nie przeszła po 2 próbach → eskalacja **o jeden poziom**, nie od razu „wszystko na max”.
2. Rubryka potwierdza: błąd bez oczywistej przyczyny po próbie, dotyczy pieniędzy → `opus`.
3. Do nowego wywołania dołączasz, co nie zadziałało.
4. Po znalezieniu przyczyny wdrożenie poprawki wraca na `sonnet` (deeskalacja).

**Wynik:**
```
Agent(model: "opus")
Zadanie: znajdź przyczynę niestabilnego testu terminu płatności.
Co nie zadziałało: (1) ustawienie strefy UTC w teście — dalej pada; (2) zamrożenie zegara w teście —
pada przy przejściu na czas letni. Oczekiwane: przyczyna + plan poprawki, bez wdrażania.
Potem: implementacja planu → Agent(model: "sonnet").
```
Wykonawca na `sonnet` zakończył raport linią `Tier: za niski — błąd czasu wymagał analizy, nie wykonania`; `log_usage` ją
zapisuje, a przy podobnym zadaniu od razu wybierasz `opus` do diagnozy.

## 3. Tydzień pracy wychodzi drożej, niż zakładano
**Sytuacja:** „Ten tydzień kosztował więcej niż zwykle. Sprawdź, gdzie uciekają tokeny, i zaproponuj zmianę”.

**Jak:**
1. `python3 factory/cost_report.py --days 7` — koszt per agent i model, trafienia cache, sygnały `Tier:`.
2. Szukasz wzorca: kto często eskaluje albo zgłasza „za wysoki”, gdzie trafienia cache są niskie.
3. Sprawdzasz nawyki sesji: przełączanie `/model` w środku zadania, długie przerwy, `/compact` zamiast `/rewind`.
4. Proponujesz zmianę konfiguracji, a nie jednorazowe „uważaj”.

**Wynik (raport dla człowieka):**

| Ustalenie | Dowód | Zmiana |
|---|---|---|
| wykonawca dokumentacji zgłasza „Tier: za wysoki” | raport: 4 z 9 zadań | obniż tier roli w `factory/config.yaml` |
| niskie trafienia cache w głównej sesji | pasek stanu „zimny” po przerwach | po długiej przerwie nowa sesja od punktu kontrolnego |
| `/model` przełączany w trakcie zadania | historia sesji | model ustalany na początku; trudne kroki do wykonawcy z `model: opus` |
| krótkie zadania przy profilu `jakosc` | doradca wzywany w krótkich zadaniach | `python3 factory/profile.py zrownowazony --dry-run`, potem zmiana za zgodą |
