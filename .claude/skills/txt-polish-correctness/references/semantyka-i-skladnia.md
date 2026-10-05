# Część III. Semantyka, słownictwo i składnia — poprawność językowa

> **Spis treści:** 21. Norma językowa i rejestr · 22. Typologia błędów językowych — mapa do reszty skilla · 23. Błędy leksykalno-semantyczne, słowotwórcze i… · 24. Składnia — związki wyrazowe, szyk, odniesienie · 25. Relacje semantyczne a konsystencja terminologii

<!-- polish-lint: ignore-file (plik zawiera celowe przykłady błędów) -->

Źródła: definicje i typologia poprawności językowej wg materiału ZPE „Co każdy powinien wiedzieć o
poprawności językowej”, definicja i podtypy semantyki językoznawczej (polszczyzna.pl), kategorie i relacje
semantyczne Słownika semantycznego języka polskiego (SSJP, Katedra Lingwistyki Komputerowej UJ / Grupa
Lingwistyki Komputerowej AGH), oraz podstawowe pojęcia składni zdania polskiego (aniakubica.com/skladnia).

**Status inny niż Części I–II.** Pisownia i interpunkcja (`pisownia.md`, `interpunkcja.md`) kodują jeden
ujednolicony, obowiązujący zbiór RJP PAN (2024) — tu rozstrzygnięcie jest zawsze jednoznaczne. Semantyka,
frazeologia, składnia i stylistyka nie mają analogicznego jednego, skodyfikowanego zbioru reguł tej
szczegółowości — źródła użyte w tej części mają w większości charakter definicyjny/przeglądowy, nie listy
gotowych reguł. Ta część łączy więc to, co te źródła faktycznie podają (typologia błędów, definicje normy,
kategorie i relacje semantyczne SSJP, części/związki składniowe zdania) z ogólnie przyjętą, ustabilizowaną
wiedzą o kulturze języka polskiego, potrzebną, by te definicje przełożyć na konkretne, sprawdzalne przypadki.
W razie wątpliwości między „ładniej” a „jednoznacznie” — jak w całym tym skillu — wybieraj jednoznaczność.

## 21. Norma językowa i rejestr

Cztery typy normy (za ZPE):
- **Skodyfikowana** — zasady sformułowane przez specjalistów (słowniki, zbiory RJP).
- **Wzorcowa** — obowiązująca w sytuacjach oficjalnych, zgodna z tradycją; to jest domyślny rejestr dla
  dokumentacji technicznej, opisów funkcji, tekstów commitów/PR, komunikacji formalnej.
- **Użytkowa** — dopuszczalna w kontaktach swobodnych (czat wewnętrzny, komentarz roboczy), mniej rygorystyczna.
- **Zwyczajowa** — to, co społeczność uznaje za poprawne w praktyce, niezależnie od kodyfikacji.

Przy korekcie dokumentacji/kodu/tekstów formalnych rozstrzygaj wg normy **wzorcowej**, nie zwyczajowej —
nawet jeśli jakaś potoczna forma jest dziś szeroko używana, w dokumentacji technicznej stosuj formę
poprawną wzorcowo, o ile nie zmienia to jednoznaczności na niekorzyść czytelnika.

**Błąd językowy** to nieuzasadnione i *nieświadome* naruszenie normy — odróżniaj to od **innowacji
uzasadnionej**: nazwanie nowego zjawiska/pojęcia, świadome złamanie normy w celu retorycznym, terminologia
przyjęta w danym środowisku (żargon techniczny, nazwy własne, kalki uzgodnione w zespole jako standard). Nie
poprawiaj „z powrotem” na formę wzorcową terminu, który w danym repo/dokumentacji jest już ustabilizowanym,
konsekwentnie używanym żargonem (np. anglicyzmy typu `deploy`, `merge`, `commit` w dokumentacji technicznej
nie są błędem — są przyjętym rejestrem tej dziedziny).

## 22. Typologia błędów językowych — mapa do reszty skilla

Pełna typologia błędów (za ZPE), z odsyłaczem, która część tego skilla je pokrywa:

| Typ błędu | Przykład | Gdzie szukać |
|---|---|---|
| ortograficzny | *wziąś* zamiast *wziąć* | `pisownia.md` |
| interpunkcyjny | brak przecinka przed *który* | `interpunkcja.md` |
| fleksyjny (odmiana) | *poszłem* zamiast *poszedłem* | §23 niżej (przypadki, rodzaj) |
| słowotwórczy | wyraz utworzony wg nieistniejącego wzorca (np. *„skopowanie”* zamiast *ograniczenie zakresu*) | §23 niżej |
| składniowy (budowa zdania, związki) | *nie mam czas* zamiast *nie mam czasu* | §24 niżej |
| leksykalno-semantyczny (znaczenie wyrazu) | *efektowny* użyte w znaczeniu *efektywny* | §23 niżej |
| frazeologiczny (zwroty utrwalone) | *pełnić rolę* (kontaminacja *pełnić funkcję* + *odgrywać rolę*) | §23 niżej |
| stylistyczny | szablon, moda językowa, niedopasowanie rejestru | §23 niżej |

Fleksyjne i słowotwórcze błędy nie mają w tym skillu osobnej sekcji regułowej (to zamknięta lista form w
gramatyce, nie zbiór zasad do wyliczenia) — traktuj je jako „czy ta forma istnieje w tym znaczeniu” i w razie
wątpliwości sprawdzaj w słowniku, tak jak przy `ó`/`u`, `rz`/`ż`, `h`/`ch` w `pisownia.md`, zamiast zgadywać.

## 23. Błędy leksykalno-semantyczne, słowotwórcze i frazeologiczne

**Pleonazm** — użycie dwóch wyrazów, z których jeden już zawiera znaczenie drugiego: *cofnąć się do tyłu*
(*cofnąć się* już znaczy „do tyłu”), *kontynuować dalej*, *identyczny taki sam*, *kompletnie pusty* (*pusty*
już jest kompletny/całkowity). W dokumentacji technicznej zwłaszcza: *wewnętrzny mechanizm wewnątrz systemu*,
*opcjonalny do wyboru*.

**Tautologia** — powtórzenie tej samej treści innymi słowami w obrębie jednej wypowiedzi (szersze niż
pleonazm — może obejmować całe frazy, nie tylko pojedyncze wyrazy): *„ten sam identyczny plik”*, *„zbiór
wszystkich elementów, które w nim są”*.

**Kontaminacja frazeologiczna** — skrzyżowanie dwóch utrwalonych zwrotów we frazę, która nie istnieje w
żadnym z nich, przez zniekształcenie, wymianę elementu albo zmianę formy fleksyjnej. Klasyczny przykład:
*pełnić rolę* (skrzyżowanie *pełnić funkcję* + *odgrywać/grać rolę*) — poprawne to *pełnić funkcję* albo
*odgrywać rolę*, nie mieszanka. Przy takich zwrotach sprawdzaj, czy czasownik i rzeczownik pochodzą z tego
samego, jednego utrwalonego związku, nie z dwóch różnych.

**Niewłaściwe użycie bliskoznaczników/paronimów** — wyrazy podobne w formie lub znaczeniu, ale nie
wymienne. Częste w tekstach technicznych/formalnych:
- *efektywny* (dający efekt, skuteczny) vs *efektowny* (robiący wrażenie, widowiskowy) — „efektowne
  rozwiązanie” ≠ „efektywne rozwiązanie”, to nie synonimy.
- *ilość* (rzeczy niepoliczalne, masa/objętość: *ilość wody*) vs *liczba* (rzeczy policzalne: *liczba
  wpisów*, *liczba użytkowników*) — w rejestrze wzorcowym „ilość rekordów”/„ilość plików” jest błędem
  leksykalno-semantycznym, poprawnie *liczba rekordów*, *liczba plików*.
- *permanentny* (stały, nieprzerwany) vs *stały* — bliskoznaczne, ale *permanentny* ma dodatkowy odcień
  „bez przerwy trwający”, nie każde *stałe* da się nim zastąpić.
- *incydentalny* (wyjątkowy, jednorazowy) vs *przypadkowy* (bez przyczyny/losowy) — mylone, ale to różne
  znaczenia: coś może być *incydentalne* (rzadkie) bez bycia *przypadkowym* (nieplanowane).

**Kalki językowe / anglicyzmy składniowe** — dosłowne tłumaczenie angielskiej konstrukcji, które w polskim
łamie walencję czasownika albo brzmi nienaturalnie, choć każde słowo z osobna jest poprawne. Przykład
znaleziony i poprawiony w tym repo: *„X pojawia swoje issue pod wszystkimi z nich”* (kalka *„X surfaces its
issues”*) — *pojawiać (się)* jest w polskim nieprzechodnie/zwrotne i nie przyjmuje dopełnienia bliższego;
poprawnie *„X ma swoje issue widoczne pod wszystkimi z nich”*. Przy tłumaczeniu z angielskiej dokumentacji
źródłowej sprawdzaj nie tylko słowo, ale i czy polski czasownik w ogóle łączy się z takim dopełnieniem, jakie
ma angielski oryginał (zob. też §24, związek rządu).

**Moda językowa / nadużywane słowa** — wyrazy używane bez potrzeby, spłycające tekst przez nadużycie:
*dokładnie, globalny, kultowy, ekstremalny*; szablony korporacyjne: *nowa formuła, odbyć rozmowę, owocna
współpraca, szereg osiągnięć*. W dokumentacji technicznej odpowiednikiem są nadużywane, nic-nie-mówiące
słowa wypełniające (*„robust”, „seamless”, „leveraging”* i ich kalki: *„bezproblemowo”, „wykorzystując
możliwości”*) — zgodnie z zasadą KISS ze skilla core-tech-docs, zamieniaj je na konkretny, sprawdzalny
opis tego, co się faktycznie dzieje.

## 24. Składnia — związki wyrazowe, szyk, odniesienie

Trzy związki składniowe rządzące łącznością wyrazów w zdaniu:

- **Związek zgody** — dwa wyrazy zgadzają się w rodzaju/liczbie/przypadku (podmiot–orzeczenie, przydawka–
  rzeczownik). Pułapka: podmiot zbiorowy typu *większość/część/wiele + rzeczownik w dopełniaczu* w rejestrze
  wzorcowym łączy się z orzeczeniem w liczbie **pojedynczej**: *„Większość komponentów **ma** już tę flagę”*
  (nie *„mają”*), choć w mowie potocznej forma mnoga jest tolerowana.
- **Związek rządu** — czasownik/przymiotnik/przyimek wymaga od zależnego wyrazu określonego przypadka
  (**walencja**). Najważniejsza pułapka do wyłapywania przy korekcie: **zaprzeczony czasownik przechodni
  zazwyczaj wymaga dopełniacza, nie biernika, jakiego wymagałby ten sam czasownik w formie niezaprzeczonej**:
  *„mam czas”* (biernik) → zaprzeczone *„nie mam **czasu**”* (dopełniacz), nigdy *„nie mam czas”*. To
  dokładnie mechanizm błędu znalezionego i poprawionego w `FEATURES.pl.md` tego repo: *„(...) ma prawie
  żadnej konfiguracji”* — rzeczownik już stał w dopełniaczu („żadnej konfiguracji”), ale czasownik nie był
  zaprzeczony, co jest niezgodne; zgubione „nie” ujawnia się właśnie przez tę niezgodność przypadka.
  **Praktyczna heurystyka:** rzeczownik/zaimek w dopełniaczu po czasowniku, który wygląda na niezaprzeczony
  (`mieć`, `widzieć`, `znać`, `czytać`…) — sprawdź, czy przypadkiem nie zgubiono `nie` przed czasownikiem,
  zamiast automatycznie poprawiać sam przypadek na biernik (kierunek poprawki zależy od tego, co autor
  faktycznie chciał powiedzieć).
  Inne czasowniki o „wrażliwej” walencji, łatwe do pomylenia przez bliskoznaczność: *słuchać kogoś/czegoś*
  (dopełniacz) vs *słyszeć kogoś/coś* (biernik); przyimek *dzięki* wymaga celownika (*dzięki niemu*, nie
  *dzięki niego*).
- **Związek przynależności** — okolicznik/dopełnienie przynależy do jednego, konkretnego orzeczenia w
  zdaniu; w zdaniach wielokrotnie złożonych sprawdzaj, że okolicznik faktycznie modyfikuje to orzeczenie, do
  którego wizualnie/logicznie jest najbliżej, nie inne, odległe.

**Szyk wyrazów** — w polskim szyk jest swobodny (nie decyduje o gramatyczności), ale decyduje o akcencie
logicznym i o jednoznaczności. W dokumentacji technicznej: przydawka/dopełnienie umieszczone zbyt daleko od
wyrazu, do którego się odnosi, może sugerować odniesienie do innego, bliżej stojącego rzeczownika — jeśli
przestawienie szyku usuwa dwuznaczność bez zmiany treści, przestaw, nawet gdy oryginalny szyk nie jest per se
błędem.

**Odniesienie zaimków w zdaniach złożonych** — zaimek względny (`który/która/które`, `co`, `jaki`) powinien
mieć jednoznaczny antecedent. Gdy w zdaniu są dwa rzeczowniki-kandydaci (zwłaszcza różnego rodzaju, co samo
nie rozstrzyga przy przydawce dalszej), a z kontekstu nie wynika jednoznacznie, do którego zaimek się odnosi,
przeformułuj zamiast zostawiać czytelnikowi zgadywanie — to ten sam nadrzędny priorytet „jednoznaczność nad
sztywną regułą”, co w skillu core-tech-docs.

## 25. Relacje semantyczne a konsystencja terminologii

SSJP (Słownik semantyczny języka polskiego, UJ/AGH) opisuje znaczenia wyrazów przez relacje: **synonimia**,
**bliskoznaczność**, **hiponimia/hiperonimia** (wyraz szczegółowy/ogólny), **meronimia/holonimia**
(część/całość). Praktyczne zastosowanie przy redakcji dokumentacji technicznej:

- **Synonimia/bliskoznaczność jako pułapka konsystencji** — dwa wyrazy bliskoznaczne (nie identyczne, ale
  wymienne w danym kontekście) użyte niekonsekwentnie dla jednego pojęcia technicznego dezorientują
  czytelnika, nawet jeśli osobno każde użycie jest poprawne językowo. To ta sama zasada, co „konsystencja
  terminologii ważniejsza niż elegancja” ze skilla core-tech-docs — tu nazwana z perspektywy
  semantyki: jeśli raz nazwałeś coś „workflowem”, nie zamieniaj na „przepływ pracy” czy „proces” dla
  urozmaicenia w tym samym dokumencie.
- **Hiperonim vs hiponim** — pilnuj, by ogólny termin (hiperonim, np. „błąd”) nie zastępował precyzyjnego
  terminu szczegółowego (hiponim, np. „wyjątek”/„ostrzeżenie”/„awaria”), gdy dokumentacja gdzie indziej
  rozróżnia te poziomy — użycie hiperonimu tam, gdzie kontekst ustalił już rozróżnienie na hiponimy, jest
  utratą precyzji, nie stylistycznym urozmaiceniem.
- **Meronimia/holonimia** (relacja część–całość) — przy opisie architektury/komponentów sprawdzaj, czy
  wyrażenie „komponent X” i „część systemu Y” trzymają się jednego, konsekwentnego kierunku tej relacji w
  całym dokumencie (X jest częścią Y, nie odwrotnie), zwłaszcza w dokumentach z wieloma poziomami
  zagnieżdżenia (system → moduł → komponent → funkcja).
