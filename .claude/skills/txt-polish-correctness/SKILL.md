---
name: txt-polish-correctness
description: Użyj przy poprawności tekstu po polsku (dokumentacja, UI, PR) — pisownia, interpunkcja wg RJP PAN, gramatyka, kalki.
metadata:
  katalog: "Użyj zawsze, gdy piszesz lub sprawdzasz prozę po polsku (dokumentacja, opisy, README, komunikaty UI, PR) — pisownia i interpunkcja wg zbioru RJP PAN (w mocy od 2026), gramatyka, składnia, kolokacje, pleonazmy, kalki; szybki linter i format raportu błędów. Nie do redakcji stylu i skracania (txt-polish-style) ani struktury dokumentu (core-tech-docs)."
---

# Poprawność polszczyzny

Punkt odniesienia: **„Zasady pisowni i interpunkcji polskiej”** Rady Języka Polskiego przy Prezydium PAN (2024, obowiązują od
1 stycznia 2026) — pierwszy jednolity zbiór; zastępuje rozproszone uchwały. Jeśli pamiętana reguła różni się od zbioru,
**wygrywa zbiór** (np. nowe zasady dla cząstek `super-`, `ekstra-`, `mega-`). Semantyka i składnia nie mają jednego kodeksu —
tam decyduje kontekst i jednoznaczność.

## Dwa tryby
| Tryb | Kiedy | Wynik |
|---|---|---|
| **Autokontrola** | każdy agent piszący po polsku | tekst poprawny od razu; przed oddaniem: linter + ściągawka niżej |
| **Analiza (korekta)** | prośba o sprawdzenie tekstu, przegląd przez redaktora | raport uwag wg `references/raport-analizy.md` (+ poprawione fragmenty na życzenie) |
Gotowy, przeredagowany tekst (styl, skracanie, ton) → **txt-polish-style**.

## Krok 0 — linter (zero tokenów)
`python3 .claude/skills/txt-polish-correctness/scripts/polish_lint.py <plik|katalog>` — typografia (cudzysłów, myślnik, spacje,
wielokropek), częste błędy pisowni, pleonazmy, kalki, brak przecinka przed „że”. Uwagi NISKIE przy „który” to tylko sygnał
(bywa pytanie zależne). Linter nie zastępuje czytania — łapie mechanikę, żeby model skupił się na sensie.
Plik z celowymi przykładami błędów: `<!-- polish-lint: ignore-file -->`; fragment: `<!-- polish-lint: off -->` … `on`.

## Ściągawka — sprawdzaj odruchowo
<!-- polish-lint: off (ściągawka zawiera celowe przykłady błędów) -->
**Przecinki**
- Zawsze przed zdaniem podrzędnym: `że`, `który`, `aby/żeby`, `ponieważ`, `jeśli`, `gdy`, `chociaż`, `czy` (pytanie zależne),
  także na początku zdania złożonego: „Zanim wdrożysz, uruchom testy.” Przy `mimo że`, `chyba że`, `zwłaszcza że` — przed całością.
- Wtrącenie wydzielone z **obu** stron. Imiesłów na `-ąc`, `-wszy` z określeniami — w przecinkach.
- Bez przecinka przed pojedynczym `i`, `oraz`, `lub`, `albo`, `ani` w jednym zdaniu; z przecinkiem przed `ale`, `lecz`, `więc`, `zatem`.

**`nie`** — łącznie z rzeczownikami, przymiotnikami, imiesłowami przymiotnikowymi (*niedziałający, nieobsługiwany*), przysłówkami
odprzymiotnikowymi; rozdzielnie z czasownikami, imiesłowami przysłówkowymi, liczebnikami, zaimkami (*nie działa, nie wiedząc,
nie każdy*) oraz przy przeciwstawieniu („nie zapisany, lecz odrzucony”).

**Wielka i mała litera** — nazwy własne wielką; przymiotniki od nazw małą (*angularowy komponent*); stanowiska małą w zwykłym
tekście; nazwy dni, miesięcy małą. Tytuły dokumentów: wielka tylko pierwsza litera i nazwy własne (nie „Title Case”).

**Typografia** — cudzysłów `„…”` (zagnieżdżony `»…«`); łącznik `-` w wyrazach złożonych; półpauza `–` w zakresach bez spacji
(2020–2026); myślnik ` – ` lub ` — ` ze spacjami, jedna forma w dokumencie; wielokropek `…`; brak spacji przed `, . : ; ! ?`;
spacja przed jednostką (`10 GB`); tysiące ze spacją (`10 000`), ułamki z przecinkiem (`2,5`).

**Składnia i znaczenie**
- Imiesłów przysłówkowy tylko przy tym samym podmiocie („Uruchamiając skrypt, zobaczyłem błąd.”, nie „…, pojawił się błąd.”).
- Zaprzeczenie → dopełniacz („nie ma konfiguracji”); biernik żeński zaimka: „tę funkcję” (nie „tą”).
- **liczba** dla policzalnych (liczba plików), **ilość** dla niepoliczalnych (ilość pamięci).
- Kontaminacje: *pełnić funkcję* / *odgrywać rolę*; pleonazmy: *cofać się do tyłu*, *kontynuować dalej*, *okres czasu*.
- Kalki z angielskiego: *adresować problem* → zająć się; *wspierać format* → obsługiwać; *dedykowany* → przeznaczony;
  najpierw sprawdź, czy polski czasownik w ogóle łączy się z takim dopełnieniem.
- Jeden termin na jedno pojęcie w całym dokumencie (słownik projektu: `docs/project/02-domain/glossary.md`); skrót rozwinięty przy
  pierwszym użyciu. Nie zmieniaj terminów dla „urozmaicenia”.
- Liczebnik + rzeczownik: 2–4 pliki, 5–21 plików, 22–24 pliki.
Niepewność (ó/u, rz/ż, h/ch bez wymiany, rzadka nazwa) → nie zgaduj: sprawdź w `references/pisownia.md` albo oznacz do weryfikacji.
<!-- polish-lint: on -->

## Czego nie poprawiasz
Kod, nazwy identyfikatorów, polecenia, ścieżki, cytaty dosłowne ze źródeł (bank dowodów!), nazwy własne produktów, terminologię
ustaloną w słowniku projektu. Commity i komentarze w kodzie są po angielsku (core-conventional-commits).

## Materiały (czytaj tylko potrzebny plik)
| Plik | Kiedy |
|---|---|
| `references/pisownia.md` | RJP cz. I: ó/u, rz/ż, h/ch, łączna/rozdzielna, `nie`, łącznik, skróty i skrótowce, wielkie litery, nazwy obce |
| `references/interpunkcja.md` | RJP cz. II: kropka, przecinek (kiedy stawiać i kiedy nie), średnik, dwukropek, myślnik, nawias, cudzysłów |
| `references/semantyka-i-skladnia.md` | norma i rejestr, typologia błędów, pleonazmy, kontaminacje, paronimy, kalki, związki składniowe, spójność terminów |
| `references/wzorce-praktyczne.md` | szybki katalog błędów w tekstach użytkowych + progi czytelności |
| `references/raport-analizy.md` | format uwag, kategorie i priorytety, podsumowanie, raport do pliku |

## Checklista
- [ ] linter uruchomiony, uwagi WYSOKIE i ŚREDNIE rozstrzygnięte
- [ ] przecinki przed spójnikami podrzędnymi i wokół wtrąceń
- [ ] `nie` łącznie/rozdzielnie; wielkie litery; cudzysłów i myślniki polskie
- [ ] brak kalk, pleonazmów, „ilość” przy policzalnych; spójna terminologia i forma zwracania się
- [ ] kod, cytaty źródłowe i terminy słownika nietknięte
