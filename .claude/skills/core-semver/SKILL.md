---
name: core-semver
description: Użyj przy numerze wersji (SemVer 2.0.0) — publiczne API, podbicie major/minor/patch, 0.y.z, wersje przedpremierowe, tag.
metadata:
  katalog: "Użyj, gdy nadajesz lub sprawdzasz numer wersji czegokolwiek, co wydajesz (biblioteka, pakiet, API, CLI, aplikacja, obraz, moduł IaC, sama fabryka) — deklaracja publicznego API, które zmiany wymagają major/minor/patch, faza 0.y.z i wydanie 1.0.0, wersje przedpremierowe i metadane, kolejność wersji, wycofywanie, wydanie bez zmiany opublikowanej wersji; skrypt semver.py liczy wersję bez zgadywania. Nie do formatu commit message (core-conventional-commits) ani strategii wdrożenia (ops-release-engineering)."
  slowa: "semver, wersjonowanie, numer wersji, jaka wersja, podbić wersję, major, minor, patch, wersja 1.0.0, 0.x, beta, rc, alpha, wydanie, release, tag v1.2.3, zmiana niezgodna wstecz, breaking change, przestarzałe, deprecated"
---

# Wersjonowanie semantyczne (SemVer 2.0.0)

Numer wersji to obietnica dla użytkownika. MAJOR.MINOR.PATCH mówi, czy aktualizacja może coś zepsuć:
- **MAJOR** — zmiana niezgodna wstecz;
- **MINOR** — nowa funkcja zgodna wstecz;
- **PATCH** — poprawka zgodna wstecz.

Numer **liczy skrypt**, nie pamięć modelu:
`python3 .claude/skills/core-semver/scripts/semver.py bump|next|compare|valid|check-changelog`.

## 1. Najpierw publiczne API
Bez zadeklarowanego publicznego API nie da się ocenić zgodności (reguła 1). Zapisz je w README albo w pliku
`PUBLIC_API.md`, zanim nadasz 1.0.0. Co zwykle do niego należy, zależy od typu produktu (szczegóły:
`references/publiczne-api.md`):

| Produkt | Publiczne API |
|---|---|
| biblioteka | eksportowane funkcje, klasy, typy, wyjątki, minimalna wersja środowiska (Node, Java) |
| HTTP API | ścieżki, metody, pola żądań i odpowiedzi, kody statusu, format błędów, uwierzytelnianie |
| CLI | polecenia, flagi, kody wyjścia, format wyjścia czytany przez skrypty |
| aplikacja lub serwis | konfiguracja (zmienne, klucze), kontrakty integracji, zdarzenia, schemat danych, który ktoś czyta |
| moduł IaC, obraz kontenera | zmienne wejściowe i wyjściowe, porty, punkty montowania, zmienne środowiskowe |

Szczegóły wewnętrzne (prywatne funkcje, układ kodu, treść logów) nie należą do publicznego API.

## 2. Które podbicie
| Zmiana w publicznym API | Podbicie |
|---|---|
| usunięcie, zmiana nazwy, zmiana typu lub znaczenia, nowe pole **wymagane** na wejściu, zawężenie akceptowanych wartości, zmiana domyślnego zachowania, podniesienie minimalnej wersji środowiska | **MAJOR** (minor i patch → 0) |
| nowa funkcja, opcjonalny parametr, nowe pole w odpowiedzi, oznaczenie elementu jako przestarzałego (deprecated), istotne ulepszenie wewnętrzne | **MINOR** (patch → 0) |
| poprawka błędu bez zmiany kontraktu, łatka bezpieczeństwa zgodna wstecz, aktualizacja zależności bez zmiany API | **PATCH** |
| tylko dokumentacja, testy, CI, refaktoryzacja bez zmiany zachowania | bez wydania albo PATCH, jeśli wydajesz |

- Wiele zmian w jednym wydaniu: decyduje **najpoważniejsza**.
- Poprawka błędu, na którym ktoś polega (zmienia obserwowalne zachowanie kontraktu), to MAJOR, chyba że zachowanie
  było jawnie opisane jako błąd.
- Z Conventional Commits: `python3 …/semver.py next` liczy podbicie od ostatniego tagu `vX.Y.Z` (`!` i `BREAKING
  CHANGE` → major, `feat` → minor, `fix`/`perf` → patch). Wynik sprawdź z tabelą wyżej, bo commit może być źle
  oznaczony.

## 3. Faza 0.y.z i wydanie 1.0.0
- Nowy projekt zaczyna od **0.1.0**. W fazie 0.y.z wszystko może się zmienić (reguła 4).
  - Konwencja fabryki: zmiana niezgodna → minor, reszta → patch. Tak liczy `semver.py next`.
- **1.0.0** wydajesz, gdy produkt działa na produkcji, ktoś na nim polega albo dbasz o zgodność wstecz (FAQ).
  Od 1.0.0 publiczne API jest zobowiązaniem. Wydanie 1.0.0 to decyzja człowieka; agent ją proponuje.

## 4. Wersje przedpremierowe i metadane
- Przedpremierowe: `1.4.0-alpha.1`, `1.4.0-beta.2`, `1.4.0-rc.1`. Mają niższą precedencję niż `1.4.0`.
  - Numeruj liczbą po kropce (`rc.2`, nie `rc2`), bo `rc.10 > rc.9`, a `rc10 < rc9` (porównanie leksykalne).
  - Kolejne: `semver.py bump 1.4.0-rc.1 pre` → `1.4.0-rc.2`; wydanie: `bump … release` → `1.4.0`.
- Metadane budowania: `1.4.0+sha.5114f85`. **Nie wpływają** na kolejność; nie używaj ich do odróżniania wydań.
- Kolejność sprawdzaj skryptem (`semver.py sort …`). Przykład ze specyfikacji:
  1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0.

## 5. Wydanie
1. Ustal ostatnią wydaną wersję: tag `vX.Y.Z`, plik wersji (`package.json`, `pom.xml`, `VERSION`), CHANGELOG.
2. Sklasyfikuj zmiany (sekcja 2), policz numer skryptem.
3. Zaktualizuj **wszystkie** miejsca z numerem naraz: plik wersji, CHANGELOG (najnowszy wpis na górze, sekcje: Nowe,
   Zmienione, Wycofywane, Usunięte, Poprawione, Niezgodne), dokumentację instalacji.
4. `semver.py check-changelog CHANGELOG.md --version-file <plik>` — format, kolejność i zgodność z plikiem wersji.
5. Tag `v1.2.3` (prefiks `v` to konwencja tagu; sama wersja to `1.2.3`). Utworzenie tagu, `git push`, publikacja
   pakietu lub obrazu tylko **po zgodzie człowieka**.

Zasady:
- **Wydanej wersji nigdy nie zmieniasz** (reguła 3): nie przenosisz tagu i nie publikujesz ponownie pod tym samym
  numerem. Błąd w wydaniu naprawia nowa wersja.
- **Przypadkowa zmiana niezgodna w minor:** wydaj nowy minor, który przywraca zgodność. Opisz wadliwą wersję
  w CHANGELOG i poinformuj użytkowników (FAQ).
- **Wycofywanie:** najpierw minor z oznaczeniem „przestarzałe”, opisem zastępstwa i dokumentacją. Usunięcie dopiero
  w następnym major, po co najmniej jednym minor z ostrzeżeniem.
- Monorepo: każdy pakiet ma własną wersję (`nx release` — tool-nx).
- Numer wersji API w URL (`/v1/`) to osobna decyzja (be-api-design). Zmiana `/v1` → `/v2` zwykle idzie z major
  pakietu lub serwisu.
- Wersji **zależności** projektu nie podnosisz bez prośby człowieka (core-stack-sync). Ten skill dotyczy numeru
  wersji tego, co wydajesz.

## Checklista
- [ ] publiczne API zapisane (README lub PUBLIC_API.md)
- [ ] najpoważniejsza zmiana sklasyfikowana; numer policzony `semver.py`, nie z pamięci
- [ ] 0.y.z do pierwszej stabilnej wersji; 1.0.0 za zgodą człowieka
- [ ] wszystkie pliki wersji i CHANGELOG zgodne (`semver.py check-changelog`)
- [ ] żadna wydana wersja nie została zmieniona; tag i publikacja za zgodą człowieka

## Źródła
- Semantic Versioning 2.0.0, semver.org (licencja CC BY 3.0; dostęp 2026-10-03): reguły 1–11, FAQ, oficjalne
  wyrażenie regularne (w `scripts/semver.py`).
- Conventional Commits 1.0.0 (powiązanie typów z podbiciem — core-conventional-commits).

Opisane własnymi słowami.
