# Quorum — redesign: zmiany do wdrożenia

Oct 10, 2026 · @QuartMediaDropBox Db

Aby aplikacja wyglądała jak plansze „(header + account)”, trzeba zmienić tokeny i style w `styles.css`, przebudować pasek boczny i nagłówek w `App.tsx` oraz wprowadzić drobne zmiany na dziewięciu ekranach. Układ stron zostaje bez zmian.

## Zakres

Wersją docelową jest rząd „Final — graphite blue actions and logo”: dziewięć ekranów z dopiskiem „(graphite)”, w tym PAY-125 z kolorowym tłem findings i stan „Item PAY-1 (not found)”, oraz plansza marki. To te same ekrany co „(header + account)”, z kolorem akcji i hierarchią przycisków z sekcji „Kolor akcji i przyciski”. Porównałem je z obecną aplikacją z `packages/web`, wyrenderowaną w trybie demo (dane Checkout, 1440 px, motyw jasny).

| Ekran | Plansza docelowa | Kod źródłowy |
| --- | --- | --- |
| Project health | Final — Project health (graphite) | `pages/Overview.tsx` |
| Backlog | Final — Backlog (graphite) | `pages/Backlog.tsx` |
| Item | Final — Item PAY-125 (graphite) | `pages/ItemPage.tsx`, `components/FindingCard.tsx` |
| Item — nie znaleziono | Final — Item PAY-1 (not found) (graphite) | `pages/ItemPage.tsx` |
| Decisions | Final — Decisions (graphite) | `pages/Decisions.tsx` |
| Drift | Final — Drift (graphite) | `pages/Drift.tsx` |
| Impact analysis | Final — Impact analysis (graphite) | `pages/Impact.tsx` |
| Settings | Final — Settings (graphite) | `pages/Settings.tsx` |
| Audit log | Final — Audit log (graphite) | `pages/Audit.tsx` |
| Marka | Final — Quorum name + logo (graphite) | logo w `App.tsx`, favikona |

Wspólna powłoka (pasek boczny, nagłówek) jest w `App.tsx`, komponenty pomocnicze w `components/ui.tsx`, a style w `styles.css`. Wszystkie plansze powstały z prawdziwego DOM aplikacji z nałożonymi stylami, więc nazwy klas w tym dokumencie odpowiadają tym w kodzie.

## Fundament: kolory, typografia, kształty

Wszystkie zmiany w tej sekcji dotyczą `styles.css`. Najprościej dopisać nowe wartości jako nadpisanie bloku `:root` (motyw ciemny wymaga osobnej palety — patrz Otwarte kwestie).

### Paleta neutralna (zamiast fioletowego akcentu)

| Token | Obecnie | Docelowo |
| --- | --- | --- |
| `--bg` | #f6f7f9 | #f4f4f5 |
| `--panel` | #ffffff | #ffffff |
| `--panel-2` | #f1f3f6 | #f4f4f5 |
| `--border` | #e3e6eb | #e4e4e7 |
| `--text` | #1b1f27 | #18181b |
| `--muted` | #667085 | #71717a |
| `--faint` | #98a2b3 | #a1a1aa |
| `--accent` | #4f46e5 | #18181b |
| `--accent-soft` | #eef0ff | #f4f4f5 |
| `--info` / `--info-soft` | #475467 / #eef1f5 | #52525b / #f4f4f5 |
| `--radius` | 10px | 16px |
| `--shadow` | 0 1px 2px rgba(16,24,40,.05) | 0 1px 2px rgba(24,24,27,.04) |

### Kolory statusów (paleta Vivid)

Każdy stan dostaje trzy odcienie: `-solid` do kropek, pasków i znaczników, zwykły token do tekstu oraz `-soft` do tła znaczków i kafelków. Nowe tokeny `--ok-solid`, `--warn-solid`, `--bad-solid` trzeba dodać.

| Stan | Tekst (obecnie → docelowo) | Solid (nowy) | Soft (obecnie → docelowo) |
| --- | --- | --- | --- |
| OK | #12945a → #067647 | #12b76a | #e5f6ee → #dcfae6 |
| Warning | #b7791f → #8a5a00 | #f5b400 | #fdf3e1 → #fef4d4 |
| Critical | #d92d20 → #b42318 | #f04438 | #fdecea → #fee4e2 |

W kodzie wszystkie miejsca, które rysują kolorem stanu pasek lub kropkę (`background: var(--ok)` w `Bar`, paski w `.stack`, `.dot`, `.sdot` w znaczkach), przechodzą na `var(--*-solid)`. Tekst i liczby zostają na `var(--ok|warn|bad)`.

### Kolor akcji i przyciski

Kolorem akcji i marki jest grafitowy niebieski. Zastępuje czerń w przyciskach i fiolet `--accent`; tekst i nagłówki zostają #18181b.

| Token | Wartość | Użycie |
| --- | --- | --- |
| `--act` (= `--accent`) | #1E293B | główny przycisk, obrys akcji w karcie, aktywna zakładka, fokus pól, kafelek logo |
| `--act-hover` | #0F172A | najechanie na główny przycisk |
| `--act-soft` | #F1F5F9 | tło wybranej opcji i wybranego filtra, najechanie na przycisk z obrysem |

Hierarchia przycisków:

| Rodzaj | Wygląd | Przykłady |
| --- | --- | --- |
| Główny (jeden na widok) | tło `--act`, biały tekst; nieaktywny: przezroczystość 40% | Analyze now, Save & re-analyze, Go to backlog |
| Akcja w karcie | białe tło, obrys i tekst `--act`; nieaktywny: obrys #e4e4e7, tekst #a1a1aa | Record decision |
| Drugorzędny | białe tło, obrys #e4e4e7, tekst #18181b | AI review, Accept risk, Check Jira filter |
| Ryzykowny | białe tło, tekst #B42318, obrys #FBCDC9, hover #FEE4E2 | Force approve… |
| Wybór (nie akcja) | tło `--act-soft`, obrys i tekst `--act` — nigdy pełne tło | wybrana odpowiedź w pytaniu, Any readiness, All topics |

### Typografia

- Fonty Geist (tekst) i Geist Mono (`--mono`) z Google Fonts, z włączonymi cyframi tabelarycznymi (`font-feature-settings: 'tnum' 1`).
- `h1`: 32px, waga 600, `letter-spacing: -0.03em`, `line-height: 1.15`; `h2`: waga 600, `-0.01em`.
- Nagłówki kolumn tabel (`.table th`) i etykiety sekcji w pasku: Geist Mono 11px, wielkie litery, `letter-spacing: 0.05–0.06em`, kolor `--faint`, tło nagłówka tabeli #fafafa.

### Kształty i ramki

- Karty: promień 16px, ramka `--border`, bardzo lekki cień; karta w karcie: tło #fafafa, promień 12px, bez cienia.
- Przyciski: promień 10px (małe 8px), waga 500; kolory według hierarchii z sekcji „Kolor akcji i przyciski”.
- Ostatni wiersz każdej tabeli bez dolnej linii: `.table tbody tr:last-child td { border-bottom: none; }`.
- Paski postępu (`.bar`) na tle #f4f4f5; segmenty `.stack` z odstępem 3px i zaokrągleniem 4px.
- Aktywna zakładka (`.tab.active`): podkreślenie w kolorze akcji #1E293B. Wybrana opcja (`.option.selected`): tło #F1F5F9, obrys i tekst #1E293B zamiast pełnego fioletu.

## Powłoka: tło i pasek boczny

Zmiany w `App.tsx` (element `aside.sidebar`) i `styles.css`. Pasek ma tyle samo pozycji co dziś, zmienia się marka, ikony, sekcja Sources i rytm odstępów.

### Ramka strony

- Całe tło strony #f4f4f5; siatka `.shell` z kolumną paska 248px.
- Pasek bez własnego tła i bez prawej krawędzi; padding 20px 14px, pozycje co 2px.
- Obszar treści (`.main`) to zaokrąglony panel: margines 12px (bez lewego), tło #fafafa, promień 20px, obwódka `0 0 0 1px #e4e4e7`. Nagłówek jest włączony w ten panel.
- `.content` z paddingiem 28px; `.page` maks. 1240px szerokości.

### Marka

- Nazwa „Continuous Intelligence” → „Quorum” (16px, waga 600, `-0.03em`), pod nią „Product definition quality gate” (10.5px, #71717a, bez zawijania). To samo w `<title>` i favikonie.
- Kafelek „CI” zastępuje logo: grafitowy (#1E293B) kwadrat 34×34px, promień 10px, w środku biały znak 22px — trzy łuki i kropka.
- Znak (viewBox 0 0 32 32, stroke biały 2.6, `stroke-linecap: round`): łuki `M17.74 6.15A10 10 0 0 1 25.40 19.42`, `M23.66 22.43A10 10 0 0 1 8.34 22.43`, `M6.60 19.42A10 10 0 0 1 14.26 6.15`, koło `cx=16 cy=16 r=3` wypełnione.
- Wiersz marki ma padding 9px 8px 15px, żeby środek logo wypadał na wysokości środka tekstu „Project: Checkout” w nagłówku (y = 46px).
- Pod marką linia 1px #e4e4e7 (wcięta 10px z boków) dokładnie na wysokości dolnej krawędzi nagłówka (y = 80px).

### Nawigacja

- Etykiety grup „Overview” (nowa, nad pierwszą grupą) i „Administration”: Geist Mono 11px, wielkie litery, #a1a1aa, padding 18px 10px 6px.
- Ikony unicode z tablic `NAV` i `ADMIN` (◎ ☰ ✓ ↯ ⌖ ⚙ ⧉) → ikony SVG 17px, obrys 1.7, `currentColor` (styl Lucide): activity, list, circle-check, git-compare, target, sliders-horizontal, file-text.
- Pozycja: padding 8px 10px, odstęp ikona–tekst 10px, promień 10px, kolor #52525b; hover #ebebed.
- Pozycja aktywna: białe tło, tekst #18181b waga 500, cień `0 0 0 1px #e4e4e7, 0 1px 2px rgba(24,24,27,.06)`. Dla `/item/*` aktywny zostaje Backlog (jak dziś).
- Liczniki (`.count`): szara pigułka #e4e4e7, promień 6px, padding 0 7px, 11.5px, #52525b.

### Sources

- Tekst „Sources: Jira · Confluence · Figma” na dole paska usunąć. Zamiast niego, zaraz pod Administration: linia 1px #e4e4e7 (margines 18px 10px 0), etykieta „Sources” w stylu pozostałych grup i trzy wiersze.
- Wiersz źródła ma te same wymiary co pozycja menu (padding 8px 10px, odstęp 10px) i prawdziwe logo 17px: Jira i Confluence w #0052CC (ścieżki z simple-icons), Figma w wersji wielokolorowej.
- Logotypy przyda się wydzielić do komponentu `SourceLogo`, bo używa go też ekran Item i Settings.

## Nagłówek i menu konta

Zmiany w `App.tsx` (element `header.topbar`). Kolejność elementów od lewej: projekt, odstęp, znaczki, ostatnia analiza, przycisk, awatar.

| Element | Obecnie | Docelowo |
| --- | --- | --- |
| Projekt | Etykieta „Project” nad pogrubioną nazwą (dwie linie) | Jedna linia „Project: **Checkout**”: 14px #71717a, nazwa #18181b waga 600. To nie jest select — nazwa pochodzi z `settings.project.name` |
| Ostatnia analiza | Zaraz po projekcie, „Last analysis: 24 min ago” | Po znaczkach, przed przyciskiem: ikona zegara 14px + „Last analysis: **24 min ago** in 12 ms” (13px, #71717a; czas z `analyzedAt`, milisekundy z `durationMs`) |
| Znaczki stanu | `.badge` 11.5px, kolor jako tło, bez kropki | 12.5px, waga 500, padding 3px 10px, pigułka, tło `-soft`, tekst w kolorze stanu, kropka 6px w kolorze `-solid` |
| Analyze now | Fioletowy, ikona „↻” | Grafitowy niebieski #1E293B, wysokość 40px, padding 0 16px, promień 10px, ikona SVG refresh 15px |
| Konto | Brak | Awatar 40px za przyciskiem, otwiera menu konta |

Nagłówek: padding 14px 28px, odstępy 12px 16px, dolna linia 1px #e4e4e7, bez własnego tła (leży na panelu `.main`). Jeśli AI jest włączone, obecny znaczek „AI: model” można zostawić obok „Last analysis” — na planszach go nie widać, bo demo ma AI wyłączone.

### Menu konta (nowe)

- Awatar: koło 40px, tło #e4e4e7, inicjały 13px waga 600. Gdy menu jest otwarte, awatar ma czarną obwódkę (`0 0 0 2px #fafafa, 0 0 0 4px #18181b`).
- Menu: 260px szerokości, wyrównane do prawej, 12px pod awatarem; białe tło, promień 14px, cień `0 0 0 1px #e4e4e7, 0 12px 32px -8px rgba(24,24,27,.18)`, padding 6px.
- Zawartość: blok użytkownika (awatar 36px, imię i nazwisko 14px/600, e-mail 12.5px #71717a, znaczek roli w Geist Mono, np. „Admin”), linia, „Account settings” (ikona osoby), linia, „Log out” (ikona wyjścia). Pozycje: padding 8px 10px, promień 8px, 14px #3f3f46, hover #f4f4f5.
- Dostępność: przycisk `aria-haspopup="menu"` i `aria-expanded`, menu `role="menu"`, pozycje `role="menuitem"`, zamykanie Esc i kliknięciem poza menu.

Aplikacja nie ma dziś logowania, więc menu konta wymaga źródła danych o użytkowniku i akcji wylogowania (patrz Otwarte kwestie).

## Elementy wspólne dla wszystkich ekranów

Te zmiany najlepiej zrobić raz, w `styles.css` i `components/ui.tsx`. Wtedy ekrany dostaną je automatycznie.

### Tytuł strony i odstępy

- `.page`: `gap` 20px → 16px, `max-width` 1280px → 1240px.
- `h1` w `.page-head`: 32px (patrz Typografia). Opis pod tytułem bez odstępu: `.page-head p { margin: 0 }` (dziś 4px).
- Bez nadtytułów nad `h1` (w rodzaju „Checkout · Decisions”).

### Kafelki z liczbami (`Stat`)

- `.stat .value`: waga 600, `letter-spacing: -0.03em`, `line-height: 1.3`.
- Kafelek z tonem `warn` lub `bad` dostaje tło w kolorze stanu: tło `-soft`, ramka #f9e3a3 (warn) lub #fbcdc9 (bad), etykieta i podpis w kolorze tekstu stanu. Najprościej: `Stat` dodaje klasę `q-warn`/`q-bad` do `.card`, gdy dostaje `tone`.

### Znaczki stanu

- `StatusBadge`, `SeverityBadge`, `ReadinessBadge` i licznik decision debt: emoji 🔴 🟡 ⚪ 🟢 oraz „●” → kropka `<span class="sdot">` (7px w treści, 6px w nagłówku) w kolorze `-solid`.
- `.badge`: waga 600 → 500. W tabeli Backlog znaczki gotowości mają rozmiar jak w nagłówku (12.5px, padding 3px 10px).

### Ikonki statusu

Jeden wzór dla OK, Warning i Critical: kwadrat 14px, promień 4px, tło `-soft`, znak w kolorze tekstu stanu — SVG „✓” (OK), „!” (Warning), SVG „×” (Critical). Wydzielić komponent `StatusIcon` i użyć zamiast znaków ✓ ⚠ ✗:

- `ItemPage.tsx`: wymiary Readiness (linia 255), Checklist i pokrycie (275, 290, 393, 442), wymagania i Figma (424–425), ostrzeżenia (351), stan zatwierdzenia (115).
- `Backlog.tsx` linia 75 (pierwszy problem blokujący), `Overview.tsx` linia 129, `Settings.tsx` linia 187.

Pytania (❓ w `Decisions.tsx` i `FindingCard.tsx`) zastąpić czarnym kółkiem 20px z białym „?”.

### Logotypy źródeł

Komponent `Source` (dziś kolorowy napis wielkimi literami, np. „JIRA”) pokazuje logo 17px i nazwę: 13px, waga 500, #3f3f46, bez wielkich liter. Logo to ten sam `SourceLogo` co w pasku bocznym.

### Puste stany

Puste listy i tabele (Recent drift na Project health, Change log na Drift) dostają jeden wzór: blok z przerywaną ramką 1px, tło #fafafa, promień 12px, na środku ikona w białym kwadracie 36px, pogrubione zdanie i szary opis 12.5px.

### Daty w tabelach

Kolumna When (Decision log, Audit log; analogicznie Drift): `toLocaleString()` w jednej linii → data w pierwszej linii, godzina pod nią w rozmiarze 0.75em (9px), `line-height: 1.3`, bez zawijania.

### Rozwijanie wierszy

Trójkąty ▸ / ▾ (`Backlog.tsx` linia 67, `ItemPage.tsx` linia 221) → cienki chevron SVG 16px, obrys 1.8, #a1a1aa; w rozwiniętym wierszu obrócony o 90° (`transition: transform .15s`).

### Przyciski

Przyciski i zaznaczenia według hierarchii z sekcji „Kolor akcji i przyciski”: jeden grafitowy przycisk na widok, „Record decision” z obrysem, „Force approve…” na czerwono, wybrane opcje i filtry z jasnym wypełnieniem. Fioletowy akcent znika z całej aplikacji.

## Zmiany na poszczególnych ekranach

Poniżej tylko to, co wykracza poza elementy wspólne. Każdy ekran dostaje też nową powłokę, nagłówek i style z poprzednich sekcji.

| Ekran | Co zmienić | Plik |
| --- | --- | --- |
| Project health | Tytuł „Continuous Intelligence — Checkout” → „Project health”; usunąć „Analyzed … in … ms” z prawej strony tytułu (jest w nagłówku). Kafelki Warnings i Critical z tłem stanu. Siedem kafelków metryk zebrać w szary kontener „Quality metrics” (tło #f4f4f5, promień 18px, padding 8px, nagłówek z dopiskiem „7 indicators”, kafelki bez cienia, odstęp 8px). Recent drift: pusty stan z przerywaną ramką i link „All events” ze strzałką SVG. Domains: ostatni wiersz bez linii. | `Overview.tsx` |
| Backlog | Filtry: „All” → „Any readiness”; Critical / Needs attention / Healthy jako białe przyciski bez kropek (wybrany: jasne wypełnienie z grafitową obwódką). Chevron zamiast ▸. Znaczki Readiness w rozmiarze z nagłówka. Pierwszy problem blokujący z czerwoną ikonką ×. | `Backlog.tsx` |
| Item (PAY-125) | Findings bez grubej kolorowej krawędzi po lewej: ramka 1px i tło według wagi (critical #fff6f5 / ramka #fbd9d5, warning #fffbeb / #f6e6b0, info #fafafa). Dowody i pytanie w białych blokach, promień 16px dla findingu i 12px dla bloków. Źródła jako logo + nazwa. Ikonki statusu w Readiness i Checklist. „Force approve…” jako akcja ryzykowna (czerwony tekst i obrys). | `ItemPage.tsx`, `FindingCard.tsx` |
| Item — akcje pytania | „Record decision”, „Accept risk”, „Not applicable” i notka w jednym rzędzie, 14px odstępu nad nimi. „Record decision” z grafitowym obrysem, aktywny dopiero po wyborze odpowiedzi (wcześniej szary); wybrana odpowiedź z jasnym wypełnieniem. Notka po prawej w dwóch liniach: „Decision by **Product Owner**” (12px, nazwa #18181b/500), pod spodem „the human owns the decision” 9px, odstęp 1px. | `FindingCard.tsx` (linie 140–156) |
| Item — nie znaleziono | Zamiast gołego tekstu błędu: link „‹ Backlog”, tytuł z kluczem („PAY-1”) i szary znaczek „Not found”, pod spodem pusty stan: ikona lupy, „No work item PAY-1”, wyjaśnienie (brak w ostatniej analizie, mogła zostać usunięta lub przeniesiona w Jira albo nie pasuje do klucza projektu i filtra JQL), etykiety „Last analysis” i „Items analyzed”, przyciski „Go to backlog” (główny, grafitowy) i „Check Jira filter” (prowadzi do Settings). Tylko dla błędu 404; inne błędy zostają jak dziś. | `ItemPage.tsx` (linia 33) |
| Decisions | Kafelki Critical i Important z tłem stanu. Decision log: data w dwóch liniach. Pytania z czarnym „?”. | `Decisions.tsx` |
| Drift | Pusty Change log jako pusty stan z przerywaną ramką, zieloną ikonką ✓, tekstem „No drift yet.” i opisem. Daty zdarzeń w dwóch liniach. | `Drift.tsx` (linie 69, 76) |
| Impact analysis | Tylko elementy wspólne. | `Impact.tsx` |
| Settings | Integrations: logo przed nazwą Jira / Confluence / Figma. Policy: etykiety jako znaczek + „findings” w jednej linii — „Critical” (czerwony), „Warning” (żółty; dziś literówka „Warnings”), „Info” (szary). 🤖 i 🔁 przy dwóch kolejnych polach → ikony SVG 15px (sparkles, refresh-cw) w #52525b. Notka o kodzie źródłowym z zieloną ikonką ✓. | `Settings.tsx` (linie 187, 234, 241) |
| Audit log | Kolumna When: data i godzina w dwóch liniach. | `Audit.tsx` (linia 43) |

## Nawigacja na mniejszych ekranach

Pasek boczny ma trzy stany zależne od szerokości okna. Progi są te same co w obecnym `styles.css` (1100 px i 760 px). Dziś przy ≤ 760 px pasek po prostu znika (`.sidebar { display: none }`), więc na telefonie nie ma żadnej nawigacji. Wzorem są plansze z rzędu „Responsive navigation — proposal”.

| Szerokość | Stan paska | Nagłówek i treść |
| --- | --- | --- |
| ≥ 1101 px | Pełny pasek 248 px, przyklejony (`position: sticky; top: 0; height: 100vh`), treść przewija się osobno. Opcjonalnie przycisk zwijania na dole; wybór zapamiętany w `localStorage`. | Bez zmian. |
| 761–1100 px | Wąski pasek z ikonami, 72 px. Szczegóły poniżej. | „Last analysis” skrócone do ikony zegara i „24 min ago” (bez „Last analysis:” i „in 12 ms”). Kafelki w dwóch kolumnach (istniejąca reguła dla `.g3`, `.g4`, `.split`). |
| ≤ 760 px | Brak paska; nawigacja w wysuwanym panelu. Szczegóły poniżej. | Górny pasek 56 px zamiast obecnego nagłówka, pod nim pasek stanu projektu. Panel `.main` bez marginesu, zaokrągleń i obwódki; padding treści 16px; `h1` 26px; kafelki w dwóch kolumnach, szerokie karty w jednej. |

### Wąski pasek z ikonami (761–1100 px)

- Siatka `.shell`: kolumna paska 72px, padding paska 20px 12px.
- Zostaje samo logo (kafelek 34px); nazwa i podtytuł znikają. Linia pod logo zostaje na wysokości dolnej krawędzi nagłówka.
- Etykiety grup (Overview, Administration, Sources) zamieniają się w cienkie linie 1px #e4e4e7 z marginesem 14px 6px 10px; linia między Administration a Sources znika, bo zastępuje ją ta z etykiety.
- Pozycje menu i źródła pokazują tylko ikonę, wyśrodkowaną, z polem kliknięcia ok. 40px wysokości. Tekst zostaje w DOM jako `aria-label`.
- Liczniki (11, 28) przechodzą w czarne kółka na prawym górnym rogu ikony: 10px, min. 16px szerokości, biały tekst, obwódka 2px w kolorze tła paska.
- Najechanie lub fokus klawiatury pokazuje dymek po prawej: czarne tło, 12.5px, nazwa i liczba (np. „Decisions · 28 open”), strzałka w stronę ikony.
- Na dole paska przycisk „Expand sidebar” (ikona panelu ze strzałką). Otwiera pełny pasek 248px jako nakładkę nad treścią: treść się nie przesuwa, jest lekko przyciemniona (rgba(24,24,27,.12)), pasek ma cień `16px 0 40px -12px rgba(24,24,27,.22)`. Na dole rozwiniętego paska jest „Collapse sidebar”.
- Nakładka zamyka się klawiszem Esc, kliknięciem w treść i po wyborze strony.

### Telefon (≤ 760 px)

- Górny pasek 56px, przyklejony: przycisk menu (ikona trzech linii, 40px), logo 30px i „Quorum”, odstęp, awatar 36px otwierający to samo menu konta co na desktopie.
- Pod nim pasek stanu projektu: „Project: Checkout” i po prawej zegar z „24 min ago”; w drugim wierszu znaczki stanu; na dole czarny przycisk „Analyze now” na całą szerokość.
- Przycisk menu otwiera panel z lewej, 300px szerokości, na całą wysokość ekranu, z pełną nawigacją jak na desktopie (marka, grupy, liczniki, Sources). W wierszu marki jest przycisk zamknięcia (×). Reszta ekranu jest przyciemniona (rgba(24,24,27,.45)).
- Panel zamyka się przyciskiem ×, kliknięciem w przyciemnienie, klawiszem Esc i po wyborze strony. Fokus zostaje w panelu, a po zamknięciu wraca na przycisk menu.
- Przycisk menu ma `aria-controls` wskazujące na pasek i `aria-expanded` zgodne ze stanem; przewijanie strony pod otwartym panelem jest zablokowane.

### Do zrobienia w kodzie

- `App.tsx`: stan `navOpen` dla nakładki i panelu, nowy komponent górnego paska (renderowany tylko poniżej 761 px albo ukrywany CSS-em), przycisk rozwijania na dole paska.
- Pasek boczny: etykiety pozycji w osobnym `<span>`, żeby dało się je ukryć w trybie z ikonami; komponent dymka (może być czysty CSS na `:hover` i `:focus-visible`).
- `styles.css`: reguły dla `@media (max-width: 1100px)` i `@media (max-width: 760px)` zamiast obecnego `display: none`.

## Otwarte kwestie

- [ ] **Konto użytkownika.** Aplikacja nie ma logowania; dziś jest tylko „Your name (recorded on decisions)” w Settings. Trzeba zdecydować, skąd brać imię, e-mail i rolę, dokąd prowadzi „Account settings” i co robi „Log out”. Na planszach są dane przykładowe (Anna Kowalska, Admin).
- [ ] **Motyw ciemny.** Plansze pokazują tylko motyw jasny. `styles.css` ma dziś paletę ciemną — trzeba ją dopasować do nowych tokenów (neutralne szarości, `-solid` dla statusów) albo tymczasowo wyłączyć.
- [ ] **Rozmiar znaczków w treści.** W Backlogu znaczki gotowości są już w rozmiarze z nagłówka (12.5px), na pozostałych ekranach wciąż 11.5px. Ustalić jeden rozmiar dla całej aplikacji.
- [ ] **Nazwa produktu.** Zmiana na „Quorum” dotyczy też `<title>`, favikony, README i nazwy pakietu CLI — do potwierdzenia, czy w tym samym kroku.
- [ ] **Godzina 9px.** Godzina w kolumnie When i notka „the human owns the decision” mają 9px — sprawdzić czytelność na ekranach o mniejszej gęstości pikseli.
- [ ] **Układ responsywny.** Zachowanie nawigacji jest opisane w sekcji „Nawigacja na mniejszych ekranach”. Do zaprojektowania zostaje reszta treści na telefonie (tabele Backlog, Decisions, Audit, strona pozycji) — plansze pokazują tylko pierwszy ekran Project health.
