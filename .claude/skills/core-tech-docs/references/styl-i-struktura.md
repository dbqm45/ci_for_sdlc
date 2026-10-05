# Styl i struktura dokumentacji technicznej

> **Spis treści:** Cechy dobrej dokumentacji · Dla kogo piszesz — wybór stylu · Co musi się znaleźć w dokumentacji technicznej… · Przykłady dobrych spisów treści (wzorce nawigacji) · Opisywanie komponentów, metod, komend · Konsystencja — ważniejsza niż elegancja · Formatowanie — jednolity zestaw stylów · Narzędzia (generatory dokumentacji) · Dlaczego to się opłaca

Rozwinięcie hubu core-tech-docs. Elementy „ciężkie” (copyright, spis ilustracji, indeks, numeracja stron) dotyczą
większych dokumentów (podręcznik, dokumentacja systemu), nie README.

## Cechy dobrej dokumentacji

- jest **dokładna i bezbłędna**,
- jest **kompletna** (nie zostawia dziur, które czytelnik musi sam wypełnić domysłem),
- jest **spójna** — terminologia, styl, formatowanie,
- jest napisana **klarownie i jednoznacznie**,
- użytkownik może **łatwo znaleźć** potrzebną informację (nawigacja, spis treści, indeks),
- ma **porządny, przewidywalny wygląd** (jednolite formatowanie).

## Dla kogo piszesz — wybór stylu

Trzy typowe sytuacje, w których ktoś otwiera dokumentację:
1. jest ciekawy, jak coś działa i co oferuje,
2. chce zacząć z tego korzystać,
3. utknął w trakcie korzystania i szuka pomocy.

Realnym odbiorcą częściej jest **programista wdrażający/integrujący system** niż osoba czysto decyzyjna —
domyślnie pisz stylem technicznym i konkretnym: krótkie, treściwe zdania bez ozdobników, czytelne od
pierwszego spojrzenia, logicznie poukładane.

Jeśli odbiorców jest kilka grup o istotnie różnych potrzebach (np. dział sprzedaży korzystający z UI vs.
dział IT rozwijający kod źródłowy) — rozważ **dwie odrębne dokumentacje**. To więcej pracy, ale wygodniejsze
dla odbiorców niż jedna dokumentacja próbująca obsłużyć obie grupy. Jeśli mimo to decydujesz się na jeden
dokument, **wyraźnie oznacz**, które sekcje są dla której grupy.

**Podejście opisowe vs. zadaniowe**: opisowe idzie za strukturą systemu (np. kolejność w menu); zadaniowe
idzie za kolejnością, w jakiej odbiorca faktycznie wykonuje swoje zadania. Przykład: dokumentując interfejs
dla osoby wystawiającej faktury, podejście zadaniowe opisze opcje w kolejności użycia przy wystawianiu
faktury, nie w kolejności ułożenia w menu.

## Co musi się znaleźć w dokumentacji technicznej aplikacji/systemu

- **wstęp** — konkretny opis, co robi ta aplikacja/system (jednym zdaniem albo jednym akapitem — obie formy
  są akceptowalne, zależnie od złożoności),
- **sposób instalacji i zależności**,
- **zastosowane algorytmy / logika działania**,
- **rozmieszczenie i sposób działania poszczególnych komponentów**.

### Na początku dokumentu

- copyright (jeśli dotyczy — najlepiej sformułowanie od działu prawnego, nie improwizowane),
- spis treści,
- opcjonalnie: spis ilustracji/diagramów (przydatny w większych dokumentach),
- wstęp, który informuje: jaki produkt opisuje dokumentacja, dla kogo jest przeznaczona, co ogólnie zawiera,
  jakie konwencje zapisu są stosowane (np. czcionka/format dla fragmentów kodu, oznaczenia UWAGA/OSTRZEŻENIE).

### Na końcu dokumentu

- załączniki — informacje pomocnicze, przydatne, ale niekrytyczne dla zrozumienia głównego tekstu (np.
  definicje pól w bazie danych). Załączniki **nie są** miejscem na wszystko, czego nie wiadomo gdzie
  umieścić — to sygnał, że struktura wymaga przemyślenia, nie że trzeba dorzucić kolejny załącznik.
- słowniczek terminów specyficznych dla systemu oraz skrótów, których czytelnik może nie znać. **Słowniczek
  na końcu jest lepszy niż wyjaśnianie przy pierwszym wystąpieniu w tekście** — dokumentacja nie jest
  powieścią czytaną liniowo od A do Z, czytelnik trafia do konkretnego rozdziału z linku/wyszukiwania.
- indeks — silnie wpływa na to, jak użyteczna jest dokumentacja w praktyce; nie traktować jako opcjonalnego
  dodatku w większych dokumentach.

## Przykłady dobrych spisów treści (wzorce nawigacji)

- **Heroku Dev Center** — główne kategorie widoczne od razu (architektura, bazy danych, bezpieczeństwo,
  CLI, dodatki, języki), a pod nimi — bez chowania w rozwijanych menu — pełna lista elementów każdej
  kategorii w kilku kolumnach. Zaleta: nic nie wymaga dodatkowego kliknięcia, żeby zobaczyć zakres.
- **Laravel** — główne kategorie w bocznym pasku, rozwijane plusikiem; aktualne podmenu wyróżnione kolorem.
  Zaleta: wyraźna orientacja „gdzie jestem” przy głębszej nawigacji.

Nie ma jednego słusznego układu — oba powyżej są uznawane za bardzo dobre, mimo że kompletnie różne. Wybór
zależy od rozmiaru dokumentacji: płaska, widoczna od razu lista (Heroku) dla mniejszych/średnich zestawów;
rozwijany boczny pasek (Laravel) dla bardzo rozległej dokumentacji.

## Opisywanie komponentów, metod, komend

- Każdą opisywaną metodę/komendę/endpoint **podeprzyj fragmentem kodu**. Powody: (1) przykład tłumaczy
  zasadę działania szybciej niż opis słowny; (2) to gotowy element kopiuj-wklej dla czytelnika, który nie
  musi samodzielnie rozpracowywać składni.
- **Stopniuj trudność** — zacznij od 3–5 najłatwiejszych przypadków (proste żądanie, uwierzytelnianie),
  potem przechodź do bardziej złożonych. Czytelnik zdobywa pewność na wczesnych sukcesach, zanim trafi na
  trudniejsze wyzwania — łatwiej mu wtedy przyswoić nowe informacje.
- Zrzuty ekranu z formularzami/danymi — wypełnij **realistycznymi, ale zmyślonymi** danymi (imię, adres,
  telefon), nie zostawiaj pustych pól. **Nigdy** nie używaj danych rzeczywistych osób (np. przepisanych z
  książki telefonicznej) — to realne ryzyko prawne, nie tylko stylistyczne uchybienie.

## Konsystencja — ważniejsza niż elegancja

- Jeśli w jednym akapicie słowo „system” powtarza się dziesięć razy — to nie błąd. Zamiana na synonimy
  („program”, „aplikacja”) dla urozmaicenia **wprowadza w błąd**, bo czytelnik zaczyna się zastanawiać, czy
  to wciąż to samo, czy coś innego. Raz przyjęty termin na dane zjawisko/element — używany konsekwentnie do
  końca dokumentu.
- To samo dotyczy czynności: jeśli w pierwszym rozdziale piszesz o „kliknięciu”, nie zmieniaj w innym
  rozdziale na inny synonim tej samej czynności.
- Jednoznaczność bije ścisłe trzymanie się reguł stylistycznych/gramatycznych, gdy te dwie wartości
  kolidują. Przykład: zdanie „systemy: A, B, C i D” jest niejednoznaczne (4 systemy, czy 3, z których
  ostatni nazywa się „C i D”?) — dodanie przecinka po "C" usuwa niejednoznaczność, nawet jeśli wynikowa
  interpunkcja jest nietypowa.
- Dokumentacja jest dla człowieka, nie dla komputera: jeśli jakiś diagram (np. diagram przejść stanów)
  wychodzi bardziej zagmatwany niż pomocny — lepiej zrezygnować z niego i opisać stany/warunki przejścia
  słownie, niż upierać się przy wizualizacji „bo taki był plan”.

## Formatowanie — jednolity zestaw stylów

Zdefiniuj i konsekwentnie stosuj styl dla (kluczowe zwłaszcza, gdy nad dokumentem pracuje więcej niż jedna
osoba — inaczej rozdziały różnych autorów będą wizualnie niespójne):
- nagłówek rozdziału głównego, podrozdziału, pod-podrozdziału (i tak dalej),
- „zwykły” tekst,
- lista numerowana / wypunktowana,
- tekst-kontynuacja elementu listy (przesunięty, od nowego wiersza),
- fragment kodu źródłowego,
- podpis pod rysunkiem/zrzutem ekranu.

Kluczowe informacje (zwłaszcza sekwencje czynności do wykonania) eksponuj jako **listę**, nie jako
wyliczenie po przecinkach w jednym zdaniu ukrytym wśród innych. Czytelnik wykonujący czynności odrywa wzrok
od ekranu/dokumentu i wraca do niego wielokrotnie — lista pozwala szybciej odnaleźć właściwy krok niż zdanie
złożone.

**Wiele małych rozdziałów jest lepsze niż kilka dużych** — łatwiej trafić bezpośrednio w potrzebny fragment.

**Zasada KISS** (*Keep It Short and Simple*): kilka krótkich, prostych zdań/akapitów łatwiej przyswoić niż
jedno długie zdanie złożone / jeden długi akapit.

## Narzędzia (generatory dokumentacji)

Gdy dokumentację da się generować ze źródeł (komentarze w kodzie, adnotacje, kontrakty) — generuj: szybciej niż ręczny
dokument i mniej podatne na rozjazd z kodem. Przykłady: TypeDoc / JSDoc (TS/JS), OpenAPI + Redoc/Scalar/Swagger UI
(HTTP API), Javadoc (Java), Doxygen (C/C++ i in.). Narracyjne strony (podręczniki, tutoriale) — generatory stron
statycznych z Markdown (np. Docusaurus, MkDocs, VitePress; Slate dla jednostronicowej dokumentacji API).
Generatory dobrze rozwiązują dokumentację referencyjną, gorzej narracyjną — tę piszesz sam.

## Dlaczego to się opłaca

Dobra dokumentacja techniczna realnie zmniejsza liczbę zgłoszeń do supportu (rozwiązywanie problemu trwa
zwykle dłużej niż napisanie akapitu, który by go uprzedził), zmienia ton komunikacji z klientami z
frustracji na neutralność/zadowolenie, i staje się podwaliną do skalowania kolejnych produktów/funkcji bez
konieczności odtwarzania kontekstu od zera.
