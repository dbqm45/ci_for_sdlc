# Przepis na zbieranie dowodów (dla podagenta `scout`)

Wejście: rama (`*.frame.md`) — członkostwo A i B, reguły lokalne stosu. Wyjście: surowe trafienia, **bez nazywania rodzajów i ocen**.

1. **Powierzchnia publiczna** A i B: eksportowane typy, funkcje, endpointy, tematy zdarzeń; także porty implementowane
   po drugiej stronie i pola wstrzykiwane pod inną nazwą niż typ.
2. **Szukanie symboli** każdej pozycji z powierzchni A w kodzie B i odwrotnie — jako całe słowo, w zakresie drugiej strony,
   z pominięciem linii importu. Zapisz **dokładne wzorce** wyszukiwania (kolejny przebieg ma dać to samo).
3. **Szukanie dynamiczne** (osobno, strukturalnie): znaczniki transakcji obejmujące wywołania drugiej strony; zapisy do magazynów
   obu stron w jednym przepływie; współdzielone instancje (rejestracje DI, singletony, statyczne pola); timeouty, ponowienia,
   harmonogramy; kolejność wywołań wymagana przez drugą stronę.
4. Odrzuć trafienia nieprzechodzące przez granicę (wewnętrzne użycia).
5. Zwróć: listę wykonanych wyszukiwań; wiersze `kod:ścieżka:linia` + fragment ≤ 1 linii; osobno liczbę trafień w testach;
   nieużywaną powierzchnię publiczną.
Czytaj tylko minimum wokół trafienia (kilka linii), nie całe pliki.
