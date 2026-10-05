---
name: core-plan-interview
description: Użyj przed działaniem, by przepytać plan, decyzję lub pomysł — drzewo decyzji, rundy pytań z rekomendacją.
metadata:
  katalog: "Użyj, gdy plan, decyzję lub pomysł trzeba przepytać przed działaniem — drzewo decyzji, rundy pytań z rekomendacją (tylko pytania niezależne od siebie), fakty sprawdzane samodzielnie, decyzje zostawione człowiekowi, koniec dopiero po potwierdzeniu wspólnego zrozumienia. Nie do warsztatu z ekspertami domeny (ddd-facilitation) ani doboru zespołu (core-problem-routing)."
argument-hint: "[plan, decyzja albo pomysł]"
---

# Przesłuchanie planu

Rozmowa, która ma doprowadzić do **wspólnego zrozumienia**, zanim ktokolwiek zacznie pracę. Przedmiot przesłuchania
traktujesz jak **drzewo decyzji**: każda decyzja ma decyzje od niej zależne.

## Pojęcia
- **Front** — decyzje, których wszystkie warunki wstępne są już rozstrzygnięte. Tylko o nie można teraz uczciwie zapytać.
- **Runda** — cały front zadany naraz i w całości odpowiedziany. Dobrze idzie, gdy pytań jest dużo, a rund mało
  (np. kilkanaście pytań w ok. 3 rundach).

## Procedura
1. Zbuduj w głowie drzewo; nie licz go z góry do końca — odpowiedzi zmieniają kształt drzewa.
2. **Fakty to twoja praca.** Co da się sprawdzić w repo, dokumentacji czy narzędziach, sprawdzasz sam (tani `scout`,
   `researcher`) — nie pytasz człowieka. Sprawdzanie w toku to nierozstrzygnięty warunek: czekają tylko pytania od niego
   zależne, resztę frontu zadajesz od razu.
3. **Decyzje należą do człowieka.** Każdą zadajesz i czekasz. Agent, który sam odpowiada na własne pytania decyzyjne,
   psuje cały mechanizm.
4. Zadaj rundę w formacie:
   ```
   **P1 — <tytuł>**: <treść, możliwe opcje>
   → Rekomendacja: <twoja odpowiedź i krótko dlaczego>

   **P2 — …**
   ```
   Dwa pytania nie trafiają do jednej rundy, jeśli jedno zależy od drugiego. Człowiek odpowiada numerami (`P1: b`).
5. Po odpowiedziach przelicz front: rozstrzygnięte decyzje odblokowują kolejne. Odpowiedź może też wymusić powrót do
   wcześniejszej decyzji — wtedy wracasz jawnie.
6. Front pusty → podsumowanie ustaleń (decyzje, założenia, co zostało poza zakresem) i pytanie: „Czy tak to rozumiemy?”.
   Koniec dopiero po potwierdzeniu. **Bez potwierdzenia nie zaczynasz wdrażać.**
7. Zapis: decyzje do artefaktu i `decisions.md` (core-project-record), pojęcia do słownika (ddd-facilitation), decyzja
   spełniająca próg ADR → propozycja ADR (core-tech-docs).

## Ustawienia
- Człowiek woli pojedyncze pytania (dostępność, preferencja) → jedno pytanie na raz; zapisz to w `CLAUDE.md` projektu.
- Bez sztywnego limitu pytań — zakres decyduje. Gdy człowiek jest niedostępny: przyjmij rekomendacje jako założenia
  i wypisz je (bramki decyzyjne w ddd-facilitation).
- Pytanie, na które odpowie tylko prototyp lub makieta — zaproponuj prototyp zamiast zgadywania.

## Gdy przesłuchanie się psuje
- **Agent sam odpowiada na pytania decyzyjne albo zaczyna wdrażać** — najczęściej, gdy przesłuchanie jest częścią zadania
  „rozwiąż zgłoszenie”: ramka zadania wygląda jak zgoda. Zapobieganie: w `CLAUDE.md` projektu linia „Nie wdrażaj bez
  wyraźnej zgody po przesłuchaniu”.
- **Słabszy model** zwija rundy do 2–3 ogólnych pytań i konspektu → przełącz na mocniejszy model albo tryb pytań
  pojedynczych; nie skracaj procedury.
- **Pytania zależne w jednej rundzie** (front to ocena agenta, nie policzony graf) → człowiek wskazuje zależność, agent
  jawnie otwiera gałąź ponownie w kolejnej rundzie.
- **Zakres za duży na jedną sesję** (dziesiątki decyzji, kilka obszarów) → najpierw mapa: lista obszarów i ich zależności
  jako osobne zadania w `docs/project/`, potem przesłuchanie każdego zadania osobno.

## Anty-wzorce
Zaczynanie pracy bez zgody; skracanie przesłuchania do kilku ogólników; wszystkie pytania wyliczone z góry zamiast
przeliczania frontu; pytanie człowieka o fakty z repo; mieszanie w jednej rundzie pytań zależnych.

## Przykład
**Sytuacja:** „Dodaję eksport zamówień do CSV w panelu admina — przepytaj mnie”. Role w panelu i liczbę zamówień
(ok. 2 mln) ustala `scout`, nie człowiek. **Wynik (runda 1, tylko pytania niezależne):**
```
**P1 — Kto eksportuje**: a) admin, b) admin i support → Rekomendacja: a — plik zawiera dane klientów.
**P2 — Dane osobowe**: a) pełne, b) bez, c) do wyboru → Rekomendacja: b — bez kopii danych poza systemem.
**P3 — Filtry**: a) daty, b) daty i status → Rekomendacja: b — pokrywa opisany przypadek.
```
Forma wydania dużego pliku czeka do rundy 2 — zależy od filtrów z P3.

Więcej przykładów: `references/przyklady.md`.

## Źródło
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), skill `grilling`; opis:
[aihero.dev](https://www.aihero.dev/skills-grilling). Opisane własnymi słowami.
