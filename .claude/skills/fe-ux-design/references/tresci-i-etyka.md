# Teksty interfejsu, projekt włączający i etyczny

## Teksty interfejsu (UX writing)
- Słowa użytkownika i słownika domeny (ddd-facilitation), nie systemu: „Zamówienie wysłane”, nie „Status: SHIPPED”.
  Ta sama rzecz zawsze tą samą nazwą.
- **Przyciski** mówią, co się stanie, czasownikiem: „Wyślij fakturę”, „Usuń 3 pliki” — nie „OK”, „Zatwierdź”, „Tak”.
- **Komunikat błędu**: co się stało + dlaczego (jeśli pomaga) + co zrobić, przy polu, bez obwiniania i kodów:
  „Ten NIP ma 9 cyfr — wpisz 10 cyfr bez kresek”, a nie „Nieprawidłowe dane (E1043)”. Kod błędu tylko jako
  identyfikator dla wsparcia.
- **Pusty stan**: dlaczego jest pusto i pierwszy krok („Nie masz jeszcze klientów. Dodaj pierwszego albo zaimportuj
  z pliku CSV”).
- **Potwierdzenia** nieodwracalnych działań nazywają skutek („Usunąć projekt „Dom”? Usuniesz też 12 zadań”), a przycisk
  powtarza czasownik. Gdy się da — cofnięcie zamiast potwierdzenia.
- Krótko i na początku najważniejsze; teksty mieszczą się także po polsku (dłuższe niż angielskie o kilkadziesiąt
  procent) i z odmianą liczebników (fe-web-platform, `i18n.md`).
- Polszczyzna: korekta i styl według txt-polish-correctness i txt-polish-style.

## Głos i ton
- **Głos** (stały): charakter produktu, np. „rzeczowy, życzliwy, bez żargonu”. **Ton** (zmienny): zależy od sytuacji
  użytkownika — przy błędzie płatności spokojnie i konkretnie, przy sukcesie krótko, bez euforii.
- Forma zwracania się: jedna w całym produkcie (np. „ty” w aplikacji konsumenckiej, bezosobowo lub „Państwo” w B2B
  i urzędowych) — decyzja zapisana w dokumencie głównym systemu projektowego.
- Lista słów preferowanych i zakazanych w repo (np. `docs/content-guide.md`), przegląd tekstów w PR jak kodu.

## Projekt włączający
- Niepełnosprawność jako spektrum: trwała (osoba niewidoma), czasowa (złamana ręka), sytuacyjna (rodzic z dzieckiem
  na ręku, słońce na ekranie). Rozwiązanie dla jednej grupy często pomaga wszystkim (napisy, duże cele dotyku).
- Rekrutuj do badań osoby z niepełnosprawnościami, starsze, z mniejszą biegłością cyfrową; testuj z czytnikiem ekranu,
  klawiaturą, powiększeniem 200%, słabym łączem.
- Formularze bez założeń kulturowych: imię i nazwisko jednym polem lub elastycznie, płeć opcjonalna z sensownymi
  opcjami, adresy różnych krajów, znaki diakrytyczne wszędzie.
- Wymogi prawne: WCAG 2.2 AA, European Accessibility Act (fe-web-platform).

## Projekt etyczny — wzorce zwodnicze, których nie stosujesz
| Wzorzec | Przykład | Zamiast tego |
|---|---|---|
| utrudnione wyjście | rezygnacja z subskrypcji tylko telefonicznie | rezygnacja tak łatwa jak zakup |
| zawstydzanie | „Nie, wolę przepłacać” | neutralne „Nie, dziękuję” |
| ukryte koszty | opłata dodana na ostatnim kroku | pełna cena od początku |
| wstępnie zaznaczone zgody i dodatki | zaznaczony newsletter, ubezpieczenie w koszyku | wybór domyślnie wyłączony |
| fałszywa pilność lub niedobór | licznik, który się resetuje; „zostały 2 sztuki” bez pokrycia | tylko prawdziwe informacje |
| nierówne opcje zgody | „Akceptuj wszystko” wyróżnione, „Odrzuć” ukryte w ustawieniach | równorzędne przyciski na pierwszym poziomie |
| ukryta reklama, wymuszona rejestracja | konto wymagane do przejrzenia oferty | dostęp bez konta, gdzie to możliwe |
- Prawo UE: rozporządzenie o usługach cyfrowych (DSA, art. 25) zakazuje platformom internetowym projektowania
  interfejsu, który wprowadza w błąd lub manipuluje; dyrektywa o nieuczciwych praktykach handlowych i RODO (zgoda
  dobrowolna, świadoma, łatwa do wycofania) obejmują szerzej. Unia przygotowuje kolejne przepisy (Digital Fairness Act) —
  przed projektowaniem przepływów zakupu, subskrypcji i zgód sprawdź aktualny stan z działem prawnym.
- Projektuj odpowiedzialnie: kto może ucierpieć przez tę funkcję (nadużycie, nękanie, uzależnienie, wykluczenie)?
  Pytanie dopisz do przeglądu projektu i modelu zagrożeń (arch-threat-modeling).

## Źródła
- NN/g, [UX Writing: Study Guide](https://www.nngroup.com/articles/ux-writing-study-guide/),
  [Inclusive Design](https://www.nngroup.com/articles/inclusive-design/); Microsoft Inclusive Design Toolkit
- [DSA art. 25](https://dsa-library.com/article/25/); H. Brignull, *Deceptive Patterns* (2023)
- [roadmap.sh — Product Design](https://roadmap.sh/product-design) (UX writing, microcopy, voice & tone, inclusive,
  ethical design, designing responsibly)
Opisane własnymi słowami.
