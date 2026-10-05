# Rodzaje dokumentacji i dokumentacja dla programistów

## Diátaxis — cztery rodzaje, nie mieszaj ich
Dwie osie: czy czytelnik **działa** czy **rozumie**, i czy **uczy się** czy **pracuje** (stosuje to, co już umie).
| Rodzaj | Służy do | Forma | Czego unikać |
|---|---|---|---|
| **tutorial** (nauka przez działanie) | pierwszy sukces nowej osoby | prowadzona lekcja z gwarantowanym efektem, kroki w kolejności, mało wyjaśnień, link do nich | wyborów („możesz też…”), dygresji, wymagania wiedzy, której czytelnik nie ma |
| **instrukcja** (how-to; praca, działanie) | konkretny cel osoby, która już zna podstawy | tytuł „Jak <osiągnąć cel>”, warunki wstępne, kroki, wynik | uczenia od zera, opisu wszystkich opcji |
| **referencja** (praca, wiedza) | sprawdzenie faktu: parametr, kod błędu, opcja konfiguracji | opisowo, w kolejności struktury systemu, kompletnie, generowana ze źródeł, gdy się da | instrukcji i opinii |
| **wyjaśnienie** (nauka, wiedza) | zrozumienie: dlaczego tak, jak działa, kompromisy | proza z kontekstem, historią decyzji (link do ADR), alternatywami | kroków do wykonania |
- Strona, która próbuje być wszystkim naraz, nie służy nikomu — rozdziel i połącz linkami.
- Struktura serwisu dokumentacji może iść według tych czterech typów albo według obszarów produktu z podziałem na
  typy wewnątrz. Jedno i drugie działa; ważna jest konsekwencja.

## Ścieżka programisty i dokumentacja dla niego
Etapy: odkrycie → ocena (czy to rozwiązuje mój problem?) → **pierwszy sukces** → integracja → produkcja → utrzymanie.
- **Szybki start**: od zera do działającego wywołania w kilka minut — wymagania, instalacja, klucz lub token testowy,
  jedno działające polecenie lub fragment kodu, oczekiwany wynik, „co dalej”. Mierz czas do pierwszego sukcesu.
- **Uwierzytelnianie** na osobnej stronie, z przykładem w każdym wspieranym języku i typowymi błędami.
- **Referencja API** generowana ze specyfikacji (OpenAPI, GraphQL schema — be-api-design); każdy endpoint z przykładem
  żądania i odpowiedzi, błędami i limitami. Narzędzia: Redoc, Swagger UI, Scalar; SDK i biblioteki — TypeDoc,
  Compodoc (Angular), Javadoc.
- **Lista błędów**: kod, znaczenie, przyczyny, co zrobić — to strona, na którą programiści trafiają z wyszukiwarki.
- **Przykłady kodu**: kompletne (z importami), testowane w CI (przykład, który się nie kompiluje, jest gorszy niż brak),
  bez prawdziwych sekretów.
- **Wsparcie platform**: macierz wspieranych wersji (języki, przeglądarki, systemy) z datą końca wsparcia.

## Treści pomocy i wsparcia
- **Rozwiązywanie problemów**: zorganizowane według **objawu**, który widzi użytkownik („Płatność odrzucona z kodem
  402”), potem przyczyny od najczęstszej i kroki naprawy; na końcu, jak zebrać dane do zgłoszenia (identyfikator żądania,
  wersja, logi bez sekretów).
- **FAQ** tylko dla pytań naprawdę częstych (z danych wsparcia) i krótkich odpowiedzi z linkiem do właściwej
  dokumentacji. FAQ jako śmietnik na treści bez miejsca to sygnał złej struktury.
- **Notatki o wydaniu** (dla użytkowników) to coś innego niż CHANGELOG (dla programistów, każdy commit lub zmiana):
  co nowego i jaki daje pożytek, co się zmieniło w zachowaniu, co trzeba zrobić (migracja, zmiany łamiące, daty
  wycofania — be-api-design), znane problemy. Język użytkownika, nie nazwy zadań.
- **Treści w produkcie** (podpowiedzi, puste stany, komunikaty błędów) piszesz razem z projektantem (fe-ux-design,
  `tresci-i-etyka.md`).

## Inne formy
Białe księgi (problem, dane, analiza, rekomendacja — dla decydentów, z rzetelnymi źródłami), studia przypadków
(sytuacja klienta → rozwiązanie → zmierzone wyniki, za zgodą klienta), raporty z badań (metodologia jawna, dane
do sprawdzenia), e-booki (dłuższy przewodnik po temacie). Te formy należą zwykle do treści marketingowych
(`tresci-techniczne-i-seo.md`).

## Źródła
- D. Procida, [Diátaxis](https://diataxis.fr/); Google Developer Documentation Style Guide; Microsoft Writing Style Guide
- [roadmap.sh — Technical Writer](https://roadmap.sh/technical-writer) (types of technical content, developer docs,
  developer journey, API reference, troubleshooting, FAQ, release notes, help content, platform support, white papers,
  case studies)
Opisane własnymi słowami.
