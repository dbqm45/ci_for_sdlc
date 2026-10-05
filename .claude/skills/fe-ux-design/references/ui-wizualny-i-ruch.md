# Interfejs wizualny, stany i ruch

Implementacja w CSS i tokenach: fe-css. Tu zasady projektowe.

## Hierarchia wizualna
- Jedna główna akcja na ekran lub sekcję; wyróżniona wielkością, kontrastem, kolorem akcentu i położeniem. Akcje
  drugorzędne słabsze wizualnie, niebezpieczne odseparowane i opisane wprost („Usuń konto”, nie „OK”).
- Kolejność czytania: od tego, czego użytkownik potrzebuje najpierw. Grupuj bliskością i wspólnym tłem (prawa Gestalt:
  bliskość, podobieństwo, wspólny obszar), nie liniami wszędzie.
- Test zmrużonych oczu lub rozmycia: czy nadal widać, co jest najważniejsze?

## Typografia
- Skala z tokenów (np. modularna, stosunek ok. 1,2–1,25), 3–5 rozmiarów w użyciu, nie dziesięć. Baza 16 px,
  interlinia ok. 1,5 dla tekstu, ciaśniej dla nagłówków; linia 60–75 znaków.
- Hierarchię budujesz wielkością **i** grubością **i** odstępem — nie samym kolorem.
- Liczby w tabelach wyrównane (`tabular-nums`), do prawej; polskie znaki we wszystkich krojach i grubościach.

## Kolor
- Role zamiast barw: tło, powierzchnia, tekst, tekst drugorzędny, akcent, stany (sukces, ostrzeżenie, błąd, info).
  Kolor nigdy jedynym nośnikiem znaczenia — dodaj ikonę, tekst, wzór (daltonizm).
- Kontrast i tryb ciemny według progów z fe-css (`przeglad-ui.md`).

## Układ i siatka
- Rytm odstępów 4/8 px z tokenów; siatka kolumn dla stron treściowych, układ elastyczny dla aplikacji.
- Projektuj od najmniejszego ekranu: co zostaje, co się zwija, co przechodzi w inną formę (tabela → karty).
- Wielo-platformowo: konwencje platformy (nawigacja, gesty, przyciski systemowe) ważniejsze niż identyczny wygląd.

## Stany komponentów
Każdy element interaktywny: domyślny, najechanie, fokus (widoczny, nie tylko kolor), wciśnięty, wyłączony
(z wyjaśnieniem dlaczego, jeśli niejasne), ładowanie, błąd, wybrany. Ekran: pusty, ładowanie (szkielet dla treści,
wskaźnik dla akcji), częściowy, błąd z akcją naprawy, sukces. Wzorce implementacji: fe-architecture.

## Mikrointerakcje
Budowa (D. Saffer): **wyzwalacz** (działanie użytkownika lub systemu) → **reguły** (co się dzieje) → **informacja
zwrotna** (co widać i słychać) → **pętle i tryby** (co przy powtórzeniu). Przykłady: przełącznik z natychmiastowym
zapisem i komunikatem, licznik znaków, potwierdzenie skopiowania, cofnięcie usunięcia zamiast okna potwierdzenia.
Informacja zwrotna w ≤ 100 ms od działania; dłuższe operacje — wskaźnik postępu.

## Ruch
- Ruch ma cel: pokazuje związek (skąd przyszło okno), zmianę stanu, kierunek. Bez ruchu dla ozdoby w aplikacjach
  roboczych.
- Czasy: małe elementy ok. 100–200 ms, wejścia i większe przejścia ok. 200–300 ms, rzadko > 500 ms. Wyjście krótsze
  niż wejście. Przyspieszenie na start i hamowanie na końcu (ease-out dla wejść).
- `prefers-reduced-motion`: zamiana przesunięć i powiększeń na przenikanie lub brak ruchu. Animuj `transform`
  i `opacity` (fe-css).

## Źródła
- [Material Design 2 — Understanding layout](https://m2.material.io/design/layout/understanding-layout.html),
  [States](https://m2.material.io/design/interaction/states.html), [Understanding motion](https://m2.material.io/design/motion/understanding-motion.html)
- D. Saffer, *Microinteractions* (2013); NN/g, [Microinteractions in User Experience](https://www.nngroup.com/articles/microinteractions/)
- [roadmap.sh — Product Design](https://roadmap.sh/product-design) (visual foundations, hierarchy, typography,
  color, layout & grid, interface states, micro-interactions, motion principles)
Opisane własnymi słowami.
