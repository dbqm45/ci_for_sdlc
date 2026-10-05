# Krytyka wzorców i pułapki nadużywania

Ta część jest równie ważna jak katalog: jej celem jest **nie proponować wzorca tam, gdzie prostszy kod jest lepszy**.

## 1. Wzorzec jako łata na brak cechy języka
Znany zarzut (m.in. Paul Graham, Peter Norvig): część wzorców istnieje, bo język, dla którego je spisano, nie miał
odpowiedniej abstrakcji. W językach z funkcjami jako wartościami, domknięciami i modułami wiele wzorców kurczy się do
kilku linii:

| Wzorzec | Lżejsza forma w TS/JS |
|---|---|
| Strategia | funkcja przekazana jako parametr (typ funkcyjny) |
| Polecenie | closure `() => void` w tablicy/mapie; dane polecenia jako unia dyskryminowana |
| Metoda wytwórcza | funkcja fabrykująca albo przekazana funkcja tworząca |
| Singleton | instancja na poziomie modułu ES / zakres providera DI |
| Iterator | `Symbol.iterator`, generatory, `for…of` |
| Obserwator | `EventTarget`, `EventEmitter`, RxJS, sygnały frameworka |
| Dekorator | funkcja wyższego rzędu, middleware |
| Stan / Odwiedzający | unia dyskryminowana + wyczerpujący `switch` |
| Prototyp | `structuredClone`, spread, obiekty niezmienne |

Nie znaczy to, że wzorce są zbędne — **kształt** realizacji powinien wykorzystać to, co język daje, zamiast kopiować
strukturę klas z podręcznika pisanego dla C++/Javy sprzed lambd.

## 2. Stosowanie mechaniczne
Wzorce opisują częste podejścia, ale nie są dogmatem do odtworzenia punkt po punkcie. Sygnał w review: **widać
strukturę wzorca, nie widać problemu**, który miała rozwiązać — np. `AbstractFactory` z jedną rodziną, która nigdy
nie dostanie drugiej. Uprość.

## 3. Młotek i gwoździe
Kto właśnie poznał wzorce, widzi je wszędzie. Pytanie kontrolne: czy rozwiązanie **bez** wzorca (funkcja, warunek,
kilka linii) byłoby krótsze i równie jasne? Jeśli tak — to jest odpowiedź. Wzorzec zarabia na swoją złożoność tylko
wtedy, gdy problem realnie występuje i się powtarza, a nie „może się przydać” (YAGNI, reguła trzech —
eng-design-principles).

## 4. Koszt złożoności
Każda warstwa pośrednia to plik i przeskok, które czytelnik musi pokonać, by zrozumieć jedną ścieżkę wykonania.
Kod trudniejszy do zrozumienia niż problem, który rozwiązuje, jest regresem, nie ulepszeniem.

## Checklista przed zaproponowaniem wzorca
1. Umiem nazwać **konkretny, powtarzający się** problem w tym kodzie (nie hipotetyczny)?
2. Czy prostszy kod rozwiązuje go równie dobrze? Jeśli tak — prostszy kod.
3. Czy język daje lekką formę (tabela wyżej)? Jeśli tak — ona, bez pełnej struktury klas.
4. Czy liczba nowych typów/plików jest proporcjonalna do zysku przy przyszłych zmianach?
5. Czy wzorzec nie dubluje mechanizmu frameworka (DI, middleware, store, sygnały)?

Gdy (2) lub (3) daje „tak”, zostaw prosty kod i — jeśli warto — zanotuj w PR, jaki wzorzec byłby następnym krokiem,
gdy problem faktycznie urośnie.

## Sygnały nadużycia w review
- interfejs z jedną implementacją i bez planu drugiej;
- nazwy klas ze słowami wzorców (`…Factory`, `…Strategy`, `…Visitor`) bez zmienności, którą by obsługiwały;
- singleton jako wygodny dostęp globalny;
- stos dekoratorów/łańcuch dla dwóch stałych kroków;
- `accept()`/Visitor dla dwóch typów i jednej operacji;
- mediator z `switch` na dziesiątki zdarzeń (nowy „boski obiekt”).
