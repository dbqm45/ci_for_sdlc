# Procedura: zgłoszono skompromitowaną paczkę

Cel: w ciągu godzin odpowiedzieć, czy zostaliśmy dotknięci, a jeśli tak — odciąć napastnika i unieważnić to, co mógł
zabrać. Kolejność ma znaczenie: najpierw ustalenie zasięgu, potem rotacja sekretów, potem porządki.

## 1. Ustal fakty z komunikatu
- Nazwa paczki, złośliwe wersje, okno czasowe (od publikacji do usunięcia), mechanizm (np. `postinstall`), wskaźniki:
  nazwy plików, domeny, adresy IP, dodatkowe paczki. Źródło: komunikat opiekunów, rejestru, dostawcy bezpieczeństwa.
- Zapisz je w dzienniku projektu (core-project-record) — to będzie podstawa decyzji i raportu.

## 2. Czy mamy tę wersję
- Lockfile'e wszystkich repozytoriów i gałęzi wydań: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`.
  Wyszukaj `grep`-em nazwę paczki i nazwy paczek dodanych przez atak — nie czytaj całych plików (koszt tokenów).
- SBOM wydanych artefaktów i obrazów (sekcja 5 skilla).
- Sama obecność katalogu dodanej złośliwej paczki w `node_modules` oznacza, że skrypt się wykonał — nawet jeśli pliki
  wyglądają czysto (złośliwe skrypty potrafią po sobie posprzątać).

## 3. Które maszyny instalowały w oknie ataku
- Runnery CI: logi jobów z instalacją w oknie czasowym; runnery samodzielnie hostowane traktuj jak laptopy.
- Laptopy programistów: kto robił `npm install` / `update` w tym czasie; ślady trwałości opisane w komunikacie
  (pliki, usługi, wpisy autostartu); ruch do wskazanych domen i IP w logach sieciowych.

## 4. Maszyna dotknięta = przejęta
- Nie „czyść” — przeinstaluj system lub zniszcz runner i obraz. Złośliwe oprogramowanie mogło zostawić więcej niż jeden
  mechanizm trwałości.
- Zanim ją wyłączysz, zabezpiecz to, czego potrzebuje zespół bezpieczeństwa (listę procesów, połączenia, logi).

## 5. Rotacja wszystkiego, co było osiągalne
Z każdej dotkniętej maszyny i runnera: tokeny npm/PyPI/rejestru, tokeny GitHub (osobiste i aplikacji; sam `GITHUB_TOKEN`
wygasa po zakończeniu joba), klucze SSH, dane dostępowe do chmury, zawartość `.env`, sesje przeglądarki i tokeny OAuth
narzędzi (CLI chmur, `gh`, Docker). Po rotacji przejrzyj logi dostępu do rejestru, repozytoriów i chmury z okna ataku.

## 6. Naprawa zależności
- Przypnij ostatnią bezpieczną wersję i wymuś ją w całym drzewie (`overrides` w npm, `pnpm.overrides`, `resolutions`).
- Wyczyść cache (`npm cache clean --force`), zainstaluj od nowa z `--ignore-scripts`, sprawdź lockfile.

## 7. Wnioski
Które z zabezpieczeń z checklisty skilla zatrzymałoby atak (karencja, blokada skryptów, alarm o nowej zależności)?
Wpisz decyzję do rejestru decyzji i zaplanuj wdrożenie.
