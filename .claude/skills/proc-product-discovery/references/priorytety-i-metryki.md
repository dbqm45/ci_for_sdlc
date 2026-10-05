# Priorytety i metryki produktu

## Priorytetyzacja — dobór metody
| Metoda | Jak | Kiedy | Pułapka |
|---|---|---|---|
| **RICE** | (Zasięg × Wpływ × Pewność) / Wysiłek. Zasięg: liczba osób lub zdarzeń w okresie; Wpływ: 3 ogromny, 2 duży, 1 średni, 0,5 mały, 0,25 minimalny; Pewność: 100% / 80% / 50%; Wysiłek: osobomiesiące | porównanie wielu pomysłów w backlogu | pozorna precyzja — liczby to oszacowania; Pewność pilnuje, żeby nie zawyżać zgadywań |
| **MoSCoW** | Must / Should / Could / Won't (tym razem) | zakres jednego wydania lub terminu | „Must” rośnie bez końca — limit (np. ≤ 60% wysiłku) i pytanie „czy bez tego wydanie nie ma sensu?” |
| **Kano** | ankieta: dla każdej cechy pytanie „co czujesz, gdy jest” i „gdy jej nie ma” → kategorie: obowiązkowa, liniowa (im więcej, tym lepiej), atrakcyjna, obojętna, odwrotna | decyzja, co jest podstawą, a co wyróżnikiem | atrakcyjne z czasem stają się obowiązkowe; ankieta per segment |
| **wartość / wysiłek** | macierz 2×2: szybkie wygrane, duże zakłady, wypełniacze, strata czasu | szybki przegląd na warsztacie | oceny z jednej głowy — rób to z inżynierią i danymi |
| **WSJF** | koszt opóźnienia / czas trwania | gdy liczy się czas (terminy, okno rynkowe) | proc-lean |
Metoda porządkuje rozmowę, nie zastępuje decyzji. Zapisz dane wejściowe obok wyniku, żeby dało się je podważyć.

## Metryki sukcesu
- **HEART** (Google) — wybierz wymiary, które pasują do funkcji, nie wszystkie:
  | Wymiar | Przykładowa metryka |
  |---|---|
  | Happiness (zadowolenie) | ocena w krótkiej ankiecie w produkcie, SUS (`fe-ux-design`), NPS |
  | Engagement (zaangażowanie) | liczba dni aktywnych w tygodniu, użycie funkcji na użytkownika |
  | Adoption (przyjęcie) | odsetek nowych użytkowników funkcji w 7 dni |
  | Retention (utrzymanie) | odsetek wracających po 30 dniach, rezygnacje |
  | Task success (skuteczność) | odsetek ukończonych zadań, czas, błędy |
  Dla każdego wymiaru: **cel** (słowami) → **sygnał** (zachowanie, które świadczy o celu) → **metryka** (liczba).
- **Metryka wiodąca** (north star) oddaje wartość dla klienta i biznesu naraz; **metryki ochronne** (guardrails)
  pilnują, że jej wzrost nie psuje czegoś innego (błędy, czas ładowania, rezygnacje, zgłoszenia do wsparcia).
- **OKR**: cel jakościowy + 2–4 kluczowe rezultaty mierzalne (wyniki, nie zadania: „czas do pierwszej faktury ≤ 10 min”,
  nie „wydać kreator”). Rezultaty dla zespołu wynikają z celów firmy.
- **Dopasowanie produktu do rynku**: sygnały — utrzymanie, które się wypłaszcza zamiast spadać do zera; wzrost
  z poleceń; w ankiecie Seana Ellisa ≥ 40% odpowiedzi „bardzo rozczarowany”, gdyby produkt zniknął (heurystyka, nie prawo).

## Analityka produktowa
- **Plan zdarzeń** przed implementacją: nazwa zdarzenia (czasownik w czasie przeszłym, np. `invoice_sent`),
  właściwości, kiedy wysyłane, które metryki z niego liczysz. Plan w repo, przegląd w PR razem z kodem.
- Zdarzenia z serwera dla faktów biznesowych (płatność, wysyłka) — nie gubią się przez blokery reklam; z klienta dla
  interakcji UI.
- Zgoda i RODO: analityka nieniezbędna dopiero po zgodzie (baner bez wzorców zwodniczych, `fe-ux-design`), bez danych
  osobowych w nazwach i właściwościach zdarzeń, retencja ustalona.
- Mapy ciepła i nagrania sesji: tylko z maskowaniem pól i treści, za zgodą, na wybranych ekranach — dużo danych
  osobowych, mało odpowiedzi „dlaczego” (to dają wywiady i testy).

## Źródła
- Intercom (S. McBride) — RICE; DSDM — MoSCoW; N. Kano (1984); K. Rodden i in., Google — HEART (2010)
- [roadmap.sh — Product Design](https://roadmap.sh/product-design) (prioritization frameworks, success metrics,
  business metrics & OKRs, product analytics, heatmaps, session recordings, product-market fit)
Opisane własnymi słowami.
