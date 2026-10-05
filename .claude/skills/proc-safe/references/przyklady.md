# Przykłady: SAFe

## 1. Kolejność featurów w backlogu ARTu według WSJF
**Sytuacja:** Product Management ARTu „Sprzedaż online” ma pięć featurów na najbliższy PI i spór, co pierwsze:
„BLIK przynosi najwięcej pieniędzy, więc idzie na górę”.

**Jak:**
1. Każdy składnik kosztu opóźnienia oceniasz względnie, porównując featury między sobą (tu skala umowna 1–10).
2. Koszt opóźnienia = wartość biznesowa + krytyczność czasowa + redukcja ryzyka/otwarcie możliwości.
3. Dzielisz przez rozmiar (też względny) i sortujesz malejąco.
4. Wynik to podstawa rozmowy na PI Planning, nie wyrok — oceny ustalają razem Product Management i Business Owners.

**Wynik:**

| Feature | Wartość | Czas | Ryzyko/możliwości | Koszt opóźnienia | Rozmiar | WSJF |
|---|---|---|---|---|---|---|
| Flagi funkcji | 1 | 2 | 8 | 11 | 2 | **5,5** |
| Wymiana biblioteki szyfrowania (koniec wsparcia) | 2 | 8 | 7 | 17 | 5 | **3,4** |
| Płatność BLIK | 9 | 7 | 2 | 18 | 6 | **3,0** |
| Raport sprzedaży | 6 | 2 | 1 | 9 | 4 | **2,25** |
| Integracja z magazynem | 7 | 3 | 4 | 14 | 10 | **1,4** |

Wniosek: BLIK ma najwyższy koszt opóźnienia, ale dwa mniejsze featury dają więcej wartości na jednostkę pracy
i otwierają możliwości (flagi pozwolą wydawać BLIK stopniowo). Integrację z magazynem warto pociąć — przy rozmiarze
10 może nie zmieścić się w PI.

## 2. Czy SAFe pasuje?
**Sytuacja:** „Mamy trzy zespoły po 6 osób: aplikacja mobilna, panel dla partnerów, blog firmowy. Zarząd chce
wdrożyć SAFe, bo »tak robią duzi«”.

**Jak:**
1. Sprawdzasz warunki: wspólne rozwiązanie? realne zależności? potrzeba synchronizacji?
2. Liczysz skalę: 18 osób to poniżej typowego rozmiaru ARTu (~50–125 osób).
3. Szukasz ryzyka „SAFe-washingu”: nowe nazwy na starym procesie.
4. Zanim dołożysz koordynację — sprawdzasz, czy da się zmniejszyć zależności.

**Wynik (rekomendacja):**

| Kryterium | Stan | Ocena |
|---|---|---|
| Wspólne rozwiązanie | trzy niezależne produkty | nie |
| Zależności między zespołami | sporadyczne (wspólne logowanie) | słabe |
| Skala | 18 osób | poniżej ARTu |
| Gotowość do zmiany finansowania | brak sygnałów | nie |

Rekomendacja: **nie wdrażać SAFe**. Każdy zespół pracuje wg proc-agile; wspólne logowanie przenieść do jednego
właściciela z jasnym interfejsem (proc-team-topologies). Wrócić do tematu, gdy powstanie wspólne rozwiązanie
z wieloma zespołami i realnymi zależnościami.

## 3. Wynik PI Planning jako wspólny plan
**Sytuacja:** ART „Sprzedaż online” (4 zespoły, PI = 4 iteracje + iteracja IP) kończy PI Planning. RTE prosi
o podsumowanie dla Business Owners.

**Jak:**
1. Zbierasz cele PI każdego zespołu i zależności z tablicy programu.
2. Zależności bez właściciela lub z terminem po iteracji odbiorcy oznaczasz jako ryzyko.
3. Plan opisujesz jako wspólne przewidywanie, które Inspect & Adapt zweryfikuje, a nie kontrakt zakresu.

**Wynik:**

| Zespół | Cel PI | Zależność | Ryzyko |
|---|---|---|---|
| Płatności | BLIK za flagą dla 10% klientów | flagi funkcji od zespołu Platforma (iteracja 1) | niskie |
| Platforma | flagi funkcji, nowa biblioteka szyfrowania | — | średnie: migracja szyfrowania niepewna |
| Koszyk | raport sprzedaży dla działu handlowego | dane z Płatności (iteracja 3) | niskie |
| Magazyn | pierwszy kawałek integracji: stany magazynowe | API dostawcy magazynu (iteracja 2) | **wysokie**: brak potwierdzenia od dostawcy |

Business Owners akceptują cele i ich wartość; ryzyko „Magazyn” ma właściciela (RTE) i termin wyjaśnienia przed
końcem iteracji 1. System Demo po każdej iteracji pokazuje zintegrowany przyrost.
