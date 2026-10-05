---
name: ddd-connascence-analysis
description: Użyj przy pomiarze sprzężenia dwóch modułów lub kontekstów — umowy, dowody w kodzie, stopień connascence, koszt.
metadata:
  katalog: "Użyj przy POMIARZE sprzężenia między dwoma modułami/kontekstami (istniejący kod albo mapa kontekstów) — rozbicie na pojedyncze umowy, powtarzalne wyszukiwanie dowodów, stopień liczony z linii kodu, koszt, profil pasm, rejestr decyzji. Nie do projektowania modelu wewnątrz kontekstu (ddd-tactical-design) ani wyboru wzorca relacji (ddd-context-mapping)."
---

# Pomiar connascence na granicy dwóch modułów

Słownik rodzajów i siły jest w ddd-tactical-design. Ten skill zamienia ocenę „na oko” w **powtarzalny pomiar**:
dwa przebiegi na tym samym kodzie mają dać ten sam zbiór najgroźniejszych sprzężeń.

## Zasady
1. **Zawsze jedna para** A ↔ B. Liczy się tylko to, co **przechodzi przez granicę** — to jest lokalność, zapisana w zakresie.
2. **Jeden wiersz = jedna umowa jednego rodzaju.** Jeden fakt w kodzie może dać kilka wierszy (reguły: `references/taxonomy.md`).
3. **Stopień się liczy, nie szacuje:** stopień = liczba miejsc w kodzie produkcyjnym, które trzeba zmienić, gdy umowa się zmieni
   (import i nieużywana deklaracja się nie liczą; test liczony osobno). Szczegóły: `references/scoring.md`.
4. **Każde twierdzenie ma źródło** (`kod:ścieżka:linia`, `szukanie:<wzorzec>`, `dok:ścieżka§sekcja`, `człowiek:Q3`).
   Twierdzenie bez źródła to `założenie:` — wypisane, ale bez kosztu i poza sumami.
5. **Porównuj zbiór winowajców i udziały pasm, nigdy sumy** (koszt jest porządkowy, nie „punktami”).

## Przebieg (bramka po krokach 0, 1, 2 — protokół w ddd-facilitation)
0. **Rama:** co należy do A i do B (ścieżki, pakiety), reguły lokalne stosu: gdzie są testy, jak wygląda import, znacznik transakcji,
   operacje zapisu, wspólne instancje (singleton, DI). Zapis w `docs/project/02-domain/connascence/<a>-<b>.frame.md`
   — kolejny przebieg startuje z tej samej ramy.
1. **Zbieranie dowodów — podagent `scout` wg przepisu** (`references/evidence.md`): publiczna powierzchnia obu stron, wyszukiwanie
   każdego symbolu po drugiej stronie w obu kierunkach, osobne szukanie sprzężeń dynamicznych (transakcje, wspólne magazyny,
   współdzielone instancje, czas i ponowienia). Wraca lista trafień `plik:linia` + wykonane wyszukiwania — **bez ocen**.
   Bramka: człowiek odcina fałszywe trafienia przed najdroższym krokiem.
2. **Klasyfikacja i koszt** (główny wątek — widzi cały szew): wiersze wg rodzajów, stopień, koszt, pasma.
3. **Raport** `docs/project/02-domain/connascence/<a>-<b>.md`:
   - tabele per rodzaj (każdy z 9 rodzajów ma wiersze **albo** opisany brak z dowodem, że szukano),
   - tabela kosztów posortowana deterministycznie (koszt ↓, potem ścieżka, linia),
   - **profil pasm:** statyczne słabe (nazwa, typ) · statyczne semantyczne (znaczenie, pozycja, algorytm) · dynamiczne
     (kolejność, czas, wartość, tożsamość) — liczba wierszy, suma, udział,
   - największe sprzężenia z rekomendacją osłabienia (tabela refaktoryzacji w ddd-tactical-design),
   - nieużywana powierzchnia publiczna (kandydaci do ukrycia),
   - **rejestr decyzji** — każdy przypadek, którego reguły nie rozstrzygnęły, i jak go policzono.

## Bez kodu
Na mapie kontekstów lub kontraktach działa tak samo, ale stopnie są **przedziałami** (`2–4`), a brak dowodu jest jawny.
Gdy mapa i kod się różnią — podaj oba źródła; rozstrzyga kod.

## Interpretacja
- Relacja Open Host / Published Language powinna dawać głównie pasmo statyczne słabe.
- Wiersze dynamiczne przez granicę (wspólna transakcja, dwa magazyny, które muszą się zgadzać) = granica przecieka →
  jeden właściciel danych + zdarzenia / saga (ddd-context-mapping, be-messaging-outbox).
- Fitness function: pasmo dynamiczne na krytycznych granicach nie rośnie między wydaniami (arch-quality-attributes).

## Koszt
Wyszukiwanie (najdroższe) robi `scout` na tanim modelu; główny wątek dostaje tylko wiersze. Analizuj pary wskazane przez mapę
kontekstów lub zgłoszony problem — nie wszystkie pary. Mały, oczywisty szew oceń od razu, bez podagenta.
