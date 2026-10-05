# Principal / Distinguished Engineer / Fellow — Frontend

> **Spis treści:** Wizja technologiczna i platformy na ekstremalną skalę · Granica frontend/backend/infrastruktura · Wpływ na standardy branżowe · Sponsoring kariery i kultura techniczna · Podsumowanie — jak korzystać z tego pliku

Poziom: horyzont decyzji wykracza poza jedną firmę — wizja technologiczna, platformy na ekstremalną skalę,
granica frontend/infrastruktura, wpływ na standardy branżowe, rozwój kadry technicznej. Soczewka: **cała
firma i/lub branża**.

## Wizja technologiczna i platformy na ekstremalną skalę

Na tym poziomie problem nie jest „jak zbudować tę funkcję”, a „jaka architektura pozostanie słuszna za 3–5
lat, gdy skala (użytkownicy, zespoły, kod) wzrośnie o rząd wielkości”. Praktyczne implikacje:

- **Decyzje odwracalne vs nieodwracalne** — Principal rozpoznaje, które decyzje architektoniczne są łatwe
  do odwrócenia później (wybór biblioteki UI w jednym module) a które są praktycznie nieodwracalne po
  wdrożeniu na skalę (model danych we współdzielonym API, wybór frameworka dla setek zespołów, kontrakt
  Design Systemu używany przez cały ekosystem) — i przykłada nieproporcjonalnie więcej rygoru decyzyjnego
  do drugiej kategorii, świadomie oszczędzając ten rygor na pierwszej (żeby nie zamrozić organizacji
  analysis-paralysis na decyzjach, które i tak można zmienić).
- **Platforma jako produkt dla innych inżynierów** — na tej skali frontend przestaje być „stroną”, a staje
  się **platformą** (Design System, biblioteka komponentów, wewnętrzne SDK, standardy) traktowaną z tym
  samym rygorem co produkt zewnętrzny: ma własną roadmapę, wersjonowanie, ścieżkę migracji dla użytkowników
  wewnętrznych (innych zespołów), i mierzony poziom adopcji.
- **Techniczna kotwica (north star)** — Principal formułuje i komunikuje długoterminową architektoniczną
  wizję (np. „za 2 lata każdy nowy produkt startuje z tego jednego szablonu platformy”), względem której
  poszczególne zespoły mogą samodzielnie oceniać, czy ich lokalna decyzja idzie w dobrą stronę, bez
  potrzeby centralnej zgody na każdą decyzję — to skaluje decyzyjność bez skalowania biurokracji.

## Granica frontend/backend/infrastruktura

Na poziomie Principal granica między „frontend” i „nie-frontend” się rozmywa — decyzje wymagają zrozumienia
infrastruktury, na której frontend faktycznie działa.

### Edge Computing

Wykonywanie kodu (zwykle lekkiego, request-scoped) na węzłach sieci **geograficznie najbliższych**
użytkownikowi, zamiast w jednym centralnym data center — redukuje opóźnienie sieciowe (RTT) dla logiki, która
wcześniej wymagałaby round-tripu do centralnego serwera. Typowe zastosowania frontendowe: personalizacja/
A-B testing bez migotania treści (decyzja podjęta na edge, przed wysłaniem HTML do klienta, zamiast po
stronie klienta z widocznym przeskokiem), przekierowania geograficzne/localizacyjne, lekka autoryzacja
przed dotarciem do origin. Ograniczenie: środowisko edge zwykle ma **mniejszy** zestaw dostępnych API/
czasu wykonania niż pełny serwer (brak długotrwałych połączeń, limity pamięci/czasu CPU) — Principal musi
rozpoznać, która logika **kwalifikuje się** do edge (szybka, bezstanowa lub z małym stanem), a która musi
zostać w tradycyjnym backendzie.

### CDN (Content Delivery Network)

Sieć serwerów cache'ujących statyczne (i coraz częściej częściowo dynamiczne) zasoby blisko użytkownika.
Na poziomie Principal kluczowe decyzje to nie „czy używać CDN” (to jest już baseline), a: strategia
invalidacji cache przy wdrożeniu (jak nowa wersja aplikacji dociera do wszystkich punktów obecności bez
okna, w którym różni użytkownicy dostają niekompatybilne wersje JS/CSS — problem szczególnie istotny przy
częstych wdrożeniach wielu niezależnych zespołów, patrz Micro-frontends w `staff.md`), oraz granica między
tym, co CDN może cache'ować agresywnie (assety z hashem w nazwie, bezpieczne do cache'owania „na zawsze”) a
tym, co wymaga rewalidacji (HTML, dane spersonalizowane).

### Serverless

Model wykonania, w którym infrastruktura (skalowanie, provisioning maszyn) jest w całości zarządzana przez
dostawcę — kod wykonuje się jako krótkotrwałe funkcje wywoływane na żądanie, rozliczane za faktyczny czas
wykonania, nie za utrzymywany serwer. Kompromisy istotne na poziomie Principal: **cold start** (opóźnienie
pierwszego wywołania po okresie bezczynności, gdy środowisko musi się od nowa zainicjalizować) jako
realne ryzyko dla ścieżek wymagających niskiego, przewidywalnego opóźnienia; brak długotrwałego stanu
lokalnego (każde wywołanie może trafić do innej instancji) wymuszający przeniesienie stanu do zewnętrznego
magazynu; oraz korzyść: brak konieczności zarządzania pojemnością/skalowaniem dla ruchu o dużej
zmienności (nagłe piki), co bezpośrednio redukuje obciążenie operacyjne zespołu (koszt DevEx, patrz
`devex.md`, „toil”).

**Zasada nadrzędna dla tej sekcji:** Principal nie musi umieć samodzielnie skonfigurować infrastruktury
edge/CDN/serverless (to zwykle rola zespołu platformowego — proc-team-topologies; narzędzia — ops-*) — musi umieć **rozmawiać z
tamtym zespołem na równych prawach**, rozumieć kompromisy wystarczająco głęboko, by podjąć wspólną decyzję
o tym, gdzie leży granica odpowiedzialności frontend/infrastruktura dla konkretnego problemu.

## Wpływ na standardy branżowe

### Open Source

Na poziomie Principal/Distinguished udział w open source przestaje być hobby, a staje się narzędziem
strategicznym: utrzymywanie/wydanie na wolnej licencji wewnętrznego narzędzia buduje reputację firmy jako
pracodawcy technicznego (rekrutacja), pozwala zewnętrznym kontrybutorom rozwiązywać błędy zamiast
wewnętrznego zespołu (redukcja kosztu utrzymania), i tworzy presję na jakość API (kod używany publicznie
musi mieć jasny, stabilny kontrakt, co samo w sobie bywa zdrowe też dla wewnętrznych użytkowników).
Kompromis: publiczne API wymaga formalnego procesu deprecacji/wersjonowania (SemVer, patrz
core-conventional-commits), którego wewnętrzne narzędzie mogłoby nie wymagać.

### TC39

Komitet standaryzujący **język JavaScript/ECMAScript** — nowe funkcje języka (np. optional chaining,
`Array.prototype.toSorted`, decorators — lang-javascript, lang-typescript) przechodzą przez formalny
proces (Stage 0 „pomysł” → Stage 1 „propozycja formalna” → Stage 2 „szkic składni” → Stage 2.7 „zatwierdzona
w zasadzie, czeka na testy test262” (etap dodany w 2024) → Stage 3 „kandydat, implementacje w silnikach” →
Stage 4 „gotowe, trafia do najbliższej edycji ECMAScript”). Principal
poziomu Distinguished/Fellow może realnie **uczestniczyć** w tym procesie (proponować, recenzować
propozycje) — nawet bez tego, śledzenie stage'u konkretnej propozycji jest praktyczną kompetencją: kod
produkcyjny nie powinien zależeć od funkcji języka poniżej Stage 3/4 bez transpilacji i jawnej zgody na
ryzyko zmiany składni przed finalizacją.

### W3C

Konsorcjum standaryzujące **web platform** (HTML, CSS, dostępność/WCAG — patrz `staff.md`, API
przeglądarkowe) poprzez Working Groups. Podobnie jak TC39, wpływ na tym poziomie polega na realnym udziale
w grupach roboczych (zgłaszanie use case'ów z realnej skali produkcyjnej firmy, recenzowanie specyfikacji)
— firma korzystająca z web platform na dużą skalę ma realny interes w tym, by nowe standardy (np. nowe
CSS selektory, nowe API dostępności) odpowiadały jej rzeczywistym potrzebom, zanim staną się nieodwracalnym
standardem.

## Sponsoring kariery i kultura techniczna

Na poziomie Principal wpływ na ludzi wykracza poza bezpośredni mentoring (domena Seniora, patrz
`senior.md`) — to **kształtowanie kultury technicznej całej organizacji**:

- **Sponsoring vs mentoring** — mentoring to rozwijanie kompetencji osoby w rozmowie z nią; **sponsoring**
  to aktywne wykorzystanie własnej pozycji/widoczności, by otworzyć tej osobie okazje, których sama nie ma
  dostępu (rekomendacja do trudnego, widocznego projektu, wystawienie na spotkanie z decydentami) — różnica
  jest częstym punktem, w którym rozwój karier na wyższych poziomach się zatrzymuje, bo dobry mentoring bez
  sponsoringu nie przekłada się na realne okazje do awansu.
- **Kultura code review i standardów jako artefakt kulturowy, nie tylko proces** — na poziomie Principal to,
  jak organizacja **traktuje** błędy w produkcji (szukanie winnego vs blameless postmortem), jak traktuje
  różnicę opinii technicznych (otwarta dyskusja z jasnym mechanizmem rozstrzygania vs polityczne
  przepychanki), i czy dokumentuje decyzje architektoniczne w sposób odtwarzalny (np. Architecture Decision
  Records — core-tech-docs) — to wszystko jest efektem świadomego kształtowania przez najbardziej wpływowych inżynierów w
  organizacji, nie przypadku.
- **Rozpoznawanie i rozwój przyszłych Staff/Principal** — identyfikacja, którzy inżynierowie w organizacji
  mają potencjał do przejścia na wyższą soczewkę (od jednego repo do wielu zespołów, od wielu zespołów do
  całej firmy/branży) i aktywne dawanie im okazji do ćwiczenia tej soczewki **przed** formalnym awansem
  (np. poproszenie Staff engineera o reprezentowanie firmy w zewnętrznym Working Groupie) — to jest
  praktyczna różnica między organizacją, która **ma** kolejnych Principal engineerów, gdy potrzebuje, i
  organizacją, która musi ich szukać na rynku.

## Podsumowanie — jak korzystać z tego pliku

Treść tego pliku jest z natury bardziej strategiczna/organizacyjna niż techniczna — w przeciwieństwie do
`senior.md`/`staff.md`, które da się bezpośrednio zastosować do konkretnego fragmentu kodu, ten plik służy
głównie do: (a) oceny, czy dany problem faktycznie wymaga tej soczewki (patrz `SKILL.md`, „Jak korzystać z
tego skilla” — nie każda duża zmiana kodu jest decyzją Principal), i (b) dostarczenia języka/ram do
uzasadnienia decyzji na tym poziomie komuś poza zespołem inżynierskim.
