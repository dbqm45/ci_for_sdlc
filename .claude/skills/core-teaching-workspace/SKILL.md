---
name: core-teaching-workspace
description: Użyj na polecenie człowieka do nauki tematu przez wiele sesji w katalogu-warsztacie — lekcje, ściągi, postępy.
metadata:
  katalog: "Użyj tylko na polecenie człowieka (`/core-teaching-workspace`) — nauka jednego tematu przez wiele sesji w katalogu-warsztacie (misja, źródła, lekcje HTML, ściągi, zapisy postępów), np. wdrożenie w nowy stack lub kod projektu. Nie do jednorazowego wyjaśnienia ani badania źródeł bez nauki (core-source-research)."
argument-hint: "[temat] | następna lekcja"
disable-model-invocation: true
---

# Warsztat nauki

Nauka jednego tematu przez wiele sesji, które się na sobie budują. Ciągłość daje **katalog**, nie historia rozmowy:
nowa sesja w tym samym katalogu + „następna lekcja” = kontynuacja kursu.

## Gdzie
Domyślnie `docs/learning/<temat>/` w projekcie; jeśli człowiek nie chce tego commitować — ścieżka do `.git/info/exclude`
albo osobny katalog poza repo. Przed pisaniem sprawdź, że pliki trafiają tam, gdzie trzeba (nie do `~/.claude`).

| Plik | Zawartość |
|---|---|
| `MISSION.md` | **po co** człowiek się uczy — pierwszy plik, steruje wszystkimi lekcjami |
| `RESOURCES.md` | sprawdzone źródła: **Wiedza** (dokumentacja, książki) i **Mądrość** (społeczności), każde z jednym zdaniem „do czego”; sekcja `Luki` |
| `lessons/NNNN-nazwa.html` | jedna lekcja = jedna sesja = jedna nowa umiejętność |
| `reference/*.html` | ściągi do wracania: składnia, algorytmy, słownik pojęć |
| `learning-records/NNNN-nazwa.md` | zapisy postępów w stylu ADR |
| `assets/` | wspólne komponenty: arkusz stylów, quiz, symulator |
| `NOTES.md` | preferencje ucznia |

## Procedura
**Pierwsza sesja (pusty katalog):** nie zaczynaj od lekcji. Najpierw rozmowa o misji, aż `MISSION.md` ma: konkretny cel
(„wdrożyć się w moduł rozliczeń i robić review w 3 tygodnie”, nie „poznać X”), co będzie umiał (obserwowalne), ograniczenia,
co poza zakresem. Zapytaj też wprost, co już umie — inaczej poziom pierwszej lekcji to zgadywanie. Potem źródła, potem lekcja 1.
**Kolejne sesje:** przeczytaj misję, zapisy postępów i `assets/`; wybierz następny krok w **strefie najbliższego rozwoju**
(trudne, ale osiągalne); napisz lekcję.

## Lekcja
- Krótka (jedno posiedzenie), powiązana z misją, daje jedną konkretną umiejętność.
- **Nie ufaj własnej pamięci**: każde twierdzenie ma link do źródła z `RESOURCES.md`; lekcja poleca jedno główne źródło do
  samodzielnego przeczytania. Lekcja bez przypisów = sygnał zmyślenia. Przy kodzie projektu źródłem jest sam kod (plik:linia).
- Najpierw wiedza (tu trudność przeszkadza), potem ćwiczenie z natychmiastową informacją zwrotną (tu trudność pomaga):
  **przypominanie z pamięci**, **rozłożenie w czasie**, **przeplatanie** pokrewnych tematów. Cel to trwałe zapamiętanie,
  nie chwilowa płynność, która daje złudzenie opanowania.
- Quiz: odpowiedzi tej samej długości, kolejność losowana **przy wyświetlaniu** (modele mają skłonność do stawiania
  poprawnej odpowiedzi na pierwszym miejscu).
- Buduj z `assets/` (wspólny arkusz stylów od pierwszej lekcji); nowy element wielokrotnego użytku trafia do `assets/`.
  Bez bibliotek z CDN bez przypiętej wersji (core-tech-docs, diagramy-i-prezentacje.md).
- Linki do poprzednich lekcji i ściąg; przypomnienie, że można dopytać agenta.

## Zapis postępu (`learning-records/`)
Jedno–trzy zdania: co jest już umiane i dlaczego to zmienia następne lekcje. Piszesz, gdy: uczeń **pokazał** zrozumienie
(zadanie, odpowiedź — samo „było omówione” nie wystarcza), zadeklarował wcześniejszą wiedzę (z głębokością), poprawiono
błędne przekonanie, zmieniła się misja (po zgodzie, z aktualizacją `MISSION.md`). Stary zapis oznaczasz „zastąpiony przez
NNNN”, nie usuwasz.

## Diagnoza, powtórki i koniec kursu
- **Przed lekcją 1:** krótka diagnoza (5–8 pytań od łatwych do trudnych, w stylu core-plan-interview), wynik jako pierwszy
  zapis w `learning-records/`. Bez niej poziom lekcji to zgadywanie, a lekcje zakładają nieobjaśniony żargon.
- **Quiz to bramka:** następna lekcja dopiero po zaliczeniu ćwiczeń poprzedniej; po porażce — krótkie powtórzenie
  innym przykładem, nie ta sama lekcja.
- **Powtórki:** skill nie ma kalendarza. Prowadź w `NOTES.md` listę „do powtórki” z datami (np. po 1, 3, 7 i 14 dniach);
  na starcie sesji najpierw zaległe powtórki (przypominanie z pamięci), potem nowa lekcja.
- **Kiedy przestać dokładać lekcje:** misja osiągnięta albo kolejne lekcje nie dają nowej umiejętności z misji → zaproponuj
  przejście do praktyki (zadanie w projekcie, review z mentorem) i zapisz to w `learning-records/`.
- Lekcje płytkie lub zbyt krótkie → najpierw mocniejszy model lub wyższy wysiłek rozumowania, dopiero potem zmiana
  instrukcji. Domeny o precyzyjnej notacji (sekwencje, polecenia, wzory) sprawdzaj w źródle szczególnie dokładnie.

## Pytania wymagające doświadczenia
Spróbuj odpowiedzieć, ale wskaż społeczność (forum, grupa, kanał zespołu, osoba z zespołu), gdzie da się to sprawdzić
w praktyce — chyba że uczeń zapisał w `NOTES.md`, że nie chce.

## Źródło
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), skill `teach` (formaty MISSION, RESOURCES, LEARNING-RECORD);
opis: [aihero.dev](https://www.aihero.dev/skills-teach). Opisane własnymi słowami.
