# Grafy: kolejność i zależności
Format pozycji: **Pytanie dopasowania** · Sygnały · Mapowanie · To nie to, jeśli… · Pułapki

## topological-sort — kolejność z zależności
- **Pytanie:** czy elementy mają relację „X musi być przed Y” i szukamy dopuszczalnej kolejności lub poziomów równoległych?
- **Sygnały:** „zależy od”, „najpierw… potem”, „blokuje”, etapy, kroki, „co można robić równolegle”.
- **Mapowanie:** węzeł = etap/zadanie; krawędź = zależność; poziom = zbiór rzeczy wykonalnych równolegle.
- **To nie to, jeśli** liczą się czasy trwania i termin → `job-scheduling`; zależności tworzą cykle → `feedback-arc-set`.
- **Pułapki:** cykl oznacza sprzeczne reguły biznesowe — to pytanie do eksperta, nie błąd techniczny; zależności niejawne
  (np. wspólny zasób) też są krawędziami.

## job-scheduling (ścieżka krytyczna, CPM) — harmonogram z czasami trwania
- **Pytanie:** czy zadania z zależnościami mają czasy trwania i pytamy o najwcześniejszy koniec, zapas, ścieżkę krytyczną?
- **Sygnały:** termin, opóźnienie, „kara za spóźnienie”, „co jest krytyczne”, zapas czasu, kaskada opóźnień.
- **Mapowanie:** DAG etapów, waga = czas trwania; ścieżka krytyczna = najdłuższa ścieżka.
- **To nie to, jeśli** dochodzą ograniczone zasoby → harmonogramowanie z zasobami (NP-trudne; heurystyki/solver CP).
- **Pułapki:** z ograniczeniami zasobów problem przestaje być prosty; niepewne czasy → PERT/symulacja.

## transitive-closure — kto na kogo wpływa (osiągalność)
- **Pytanie:** czy pytamy, co pośrednio zależy od danej rzeczy (kaskada skutków)?
- **Sygnały:** „wpływa pośrednio”, „jeśli X się opóźni, co jeszcze”, analiza ryzyka, zależności przechodnie.
- **Mapowanie:** osiągalność w grafie zależności.
- **Pułapki:** pełne domknięcie jest gęste (n²) — licz na żądanie (BFS/DFS) zamiast przechowywać.

## feedback-arc-set — rozbijanie cykli
- **Pytanie:** czy zależności tworzą cykle i trzeba wskazać najmniej zależności do usunięcia?
- **Sygnały:** „kręci się w kółko”, wzajemne blokady, sprzeczne kolejności.
- **Pułapki:** NP-trudne w ogólności; heurystyki. Decyzję, którą zależność zerwać, podejmuje biznes.

## connectivity (punkty/krawędzie krytyczne)
- **Pytanie:** czy usunięcie jednego elementu rozspójnia sieć (pojedynczy punkt awarii)?
- **Sygnały:** „jeśli ta osoba odejdzie”, „jedyne połączenie”, redundancja.
- **Mapowanie:** mosty i punkty artykulacji w grafie.
