# Struktury danych ukryte w wymaganiach

| id | Pytanie dopasowania | Sygnały | Pułapki |
|---|---|---|---|
| **priority-queue** | czy ciągle wybieramy następny najważniejszy element, a priorytety się zmieniają? | pilność, kolejka oczekujących, „najpierw VIP”, lista rezerwowa | zmiana priorytetu elementu w kolejce (decrease-key); sprawiedliwość (starvation) |
| **selection / percentyle** | top-k, mediana, percentyl bez pełnego sortowania? | „10 najlepszych”, SLA p95, ranking | agregaty przybliżone w strumieniu (t-digest) |
| **trie / prefiksy** | wyszukiwanie po prefiksie, podpowiadanie? | autouzupełnianie, kody, numeracja hierarchiczna | zwykle wystarczy indeks bazy/wyszukiwarki |
| **b-tree / zakresy** | zapytania zakresowe po uporządkowanym kluczu? | „od–do”, stronicowanie po dacie | to robi indeks bazy — nie implementuj |
| **segment-tree / sumy w przedziale** | sumy/minima w przedziałach przy częstych zmianach? | obłożenie w oknie czasu, limity w przedziale | często wystarczą funkcje okna SQL |
| **interval-tree / nakładanie przedziałów** | czy przedziały czasu nachodzą na siebie; wolne okna? | rezerwacje, urlopy, blokady zasobu, grafik | przedziały półotwarte `[od, do)`; strefy czasowe; w bazie: ograniczenie wykluczające na zakresach — archetyp Availability |
| **kd-tree / najbliższy punkt** | najbliższe punkty w kilku wymiarach? | „najbliższy serwisant”, wyszukiwanie w promieniu | słabnie przy wielu wymiarach; rozszerzenie geo w bazie |
| **point-location** | w której strefie/obszarze leży punkt? | strefy dostaw, rejony, taryfy geograficzne | typy geometryczne w bazie zamiast własnego kodu |
