# Wyszukiwanie, podobieństwo, czas rzeczywisty

| id | Pytanie dopasowania | Sygnały | Pułapki |
|---|---|---|---|
| **inverted-index** | wyszukiwanie pełnotekstowe po dokumentach? | „szukaj w opisach”, filtrowanie po słowach | wyszukiwarka/indeks bazy; odmiana słów (polski!) |
| **approximate-string-match** | literówki, prawie takie same nazwy? | „Kowalski/Kowalsky”, deduplikacja kontrahentów | porównanie wszystkich par to n² → najpierw blokowanie (grupowanie po kluczu) |
| **lcs / diff** | różnice między wersjami tekstu/listy? | historia zmian, porównanie umów | — |
| **lsh / vector-similarity** | podobieństwo semantyczne, rekomendacje? | „podobne produkty”, „podobne zgłoszenia” | kompromis trafność ↔ opóźnienie; indeks wektorowy zamiast pełnego przeglądu |
| **edf / fixed-priority** | twarde terminy zadań okresowych, wywłaszczanie? | systemy sterowania, SLA w ms | inwersja priorytetów; EDF niestabilny przy przeciążeniu |
