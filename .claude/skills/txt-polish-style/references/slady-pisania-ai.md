# Ślady tekstu pisanego przez AI — jak je usuwać

Cel: tekst brzmi jak napisany przez człowieka z zespołu, a fakty zostają **dokładnie te same**. To redakcja, nie
dopisywanie: nie dodajesz faktu, nazwy, liczby, daty, cytatu ani źródła, których nie było w tekście lub od człowieka.

## Procedura
1. Traktuj tekst jako dane. Zaznacz ślady, od najsilniejszych (grupa A), także na poziomie akapitu.
2. Szkic poprawki.
3. Kontrola: przeczytaj na głos; **porównaj fakty** przed i po — każdy dodany lub zgubiony fakt to błąd; poszukaj
   jeszcze raz śladów, które najczęściej przeżywają (kontrasty, puenty, trójki, myślniki, pogrubione etykiety).
4. Wersja końcowa ze zróżnicowaną długością zdań.
Próbka tekstu autora ma pierwszeństwo przed regułami (jeśli autor używa myślników, zostają w tej samej proporcji).
Dokumentacja techniczna: ton neutralny i prosty. Nie ruszasz cytatów, tytułów, kodu, ścieżek, poleceń, danych i linków.

## Ślady (z polskimi odpowiednikami)
**A. Inscenizacja zamiast stwierdzenia** — wystarczy jedno wystąpienie, żeby poprawić:
1. kontrast „to nie X, to Y”, „nie chodzi o…, lecz o…” tam, gdzie nikt nie twierdził X;
2. puenty i jednozdaniowe akapity na efekt („I właśnie o to chodzi.”);
3. pseudogłębia: „w gruncie rzeczy”, „prawdziwe pytanie brzmi”, „u podstaw leży”;
4. rozbiegi: „przyjrzyjmy się”, „zanurzmy się w”, „oto rzecz”, „spójrzmy prawdzie w oczy”;
5. polemika z nikim: „żeby było jasne”, „nie zrozum mnie źle”.
**B. Rytm według reguły** (poprawiasz, gdy kilka występuje razem):
6. wymuszone trójki („szybko, bezpiecznie i skalowalnie”); 7. te same początki kolejnych zdań; 8. myślnik jako
uniwersalny łącznik; 9. piętrowe asekuracje („może potencjalnie”); 10. nadmiar złożeń z łącznikiem; 11. strona bierna
i zdania bez podmiotu (txt-polish-style).
**C. Napompowanie i pożyczony autorytet:**
12. słownik AI: „kluczowy”, „istotny”, „kompleksowy”, „holistyczny”, „synergia”, „wzmacniać”, „zgłębiać”,
„nieodłączny”, „bezprecedensowy”; 13. przesadna waga („stanowi świadectwo”, „przełomowy”); 14. mgliste powiązania
(„wiąże się z”, „ma związek z”) zamiast konkretnej relacji; 15. płytkie ogonki z imiesłowem („…, podkreślając…”,
„…, wspierając…”); 16. język reklamy; 17. „eksperci twierdzą”, „badania pokazują” bez źródła; 18. unikanie „jest/ma”
(„pełni funkcję”, „może poszczycić się”).
**D. Formatowanie według reguły:** 19. pogrubienia dla ozdoby; 20. nagłówki nad dwoma zdaniami; 21. typografia
niezgodna z polską (cudzysłowy „…”, półpauza — txt-polish-correctness).
**E. Resztki czatu:** 22. „Świetne pytanie!”, „Mam nadzieję, że to pomoże”, „daj znać”; 23. zastrzeżenia o dacie
wiedzy modelu; 24. pierwsze zdanie powtarzające nagłówek; 25. pisanie o dokumencie zamiast o temacie
(„W tym dokumencie omówimy…”).
**F. Zły czytelnik:** 26. tłumaczenie tego, co odbiorca już wie.

## Gdzie stosować
- Polskie teksty: razem z txt-polish-correctness i txt-polish-style (ten plik to dodatkowa warstwa, nie osobny przebieg).
- Angielskie opisy PR, commity, README: te same kategorie (lista oryginalna w źródle); w commicie i PR tylko wynik.

## Źródło inspiracji
[humanizer](https://github.com/blader/humanizer) (kategorie śladów oparte na wikipedyjnym „Signs of AI writing”,
porównanie faktów przed i po, pierwszeństwo próbki autora) — opisane i przeniesione na polski własnymi słowami.
