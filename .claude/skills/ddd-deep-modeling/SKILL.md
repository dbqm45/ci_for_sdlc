---
name: ddd-deep-modeling
description: Użyj przy odkrywaniu i doprecyzowaniu pojęć modelu — Being/Behaving/Becoming, 5 why, klasyfikacja, przykłady.
metadata:
  katalog: "Użyj przy odkrywaniu i doprecyzowaniu pojęć modelu — pytania modelujące Being/Behaving/Becoming, 5 why, klasyfikacja problemu (CRUD, transformacja, prezentacja, integracja, konkurencja o zasoby), modelowanie przez przykłady. Nie do granic kontekstów (ddd-strategic-analysis) ani wzorców implementacyjnych (ddd-tactical-design)."
---

# Głębokie modelowanie

**Model głęboki** pomaga zrozumieć i uprościć problem — nie tylko go odwzorowuje. Model to nie schemat bazy
danych: schemat przechowuje stan, model niesie zachowanie i reguły. Schemat wymyślony za wcześnie utrwala
niezrozumienie domeny na miesiące.

## Pytania modelujące — trzy perspektywy
Dla każdego ważnego pojęcia przejdź przez trzy perspektywy. Odpowiedzi od razu mówią, jaki element modelu powstaje.

### Being — czym to jest (struktura)
- Jakie informacje opisują to pojęcie? **Ile** ich jest (krotność: jedna, wiele, zero)? **Jakiego typu** (liczba, kwota, okres, jednostka)?
- Jaki zakres wartości jest dopuszczalny? Co jest obowiązkowe?
- Czy dwa egzemplarze z takimi samymi danymi to **to samo**? — tak → obiekt wartości; nie, liczy się tożsamość → encja.
- Czy liczba ma jednostkę albo walutę? → obiekt wartości (Quantity, Money), a nie „goła” liczba.

### Behaving — jak się zachowuje (zmiana)
- **Kto** to zmienia? **Dlaczego** — jaki jest powód biznesowy zmiany? Jaki jest **skutek** zmiany i kogo dotyczy?
- **Jak często** się zmienia? Czy kilka osób zmienia to **jednocześnie**? → konkurencja o zasoby, wielkość agregatu.
- Czy zmianę można **powtórzyć** (np. dwa razy to samo polecenie)? → idempotencja.
- Czy zmianę można **wycofać**? Jak — usunięciem, korektą, stornem, kompensacją? Kto może wycofać?
- Jakie reguły mogą zmianę **odrzucić**? → niezmienniki, polityki.
- **5 why** — pytaj „dlaczego?” aż dojdziesz do prawdziwej potrzeby biznesowej:
  „Trzeba zmienić status faktury” → dlaczego? → „bo klient zapłacił” → dlaczego to ważne? → „bo wtedy zwalniamy towar” →
  … → prawdziwe zdarzenie to „Płatność zaksięgowana”, a regułą jest „zwolnij towar po zaksięgowaniu płatności”.

### Becoming — w co się zmienia (zmiana istoty)
- Czy to pojęcie w pewnym momencie **staje się czymś innym**? (lead → klient, oferta → umowa, rezerwacja → wypożyczenie, szkic → opublikowany dokument)
- Czy ta przemiana jest **łatwo odwracalna**? Trudno odwracalna → zdarzenie przełomowe, często inny model/kontekst, inne reguły.
- Czy po przemianie obowiązują inne reguły, inni aktorzy, inne dane? → rozdziel modele zamiast jednej klasy z flagami.
- Stany z różnymi dozwolonymi operacjami → maszyna stanów (jawne przejścia) zamiast pola „status”.

## Klasyfikacja problemu → sposób modelowania
Zanim zaprojektujesz, nazwij klasę problemu. Każda wymaga innego podejścia.

| Klasa | Rozpoznasz po | Podejście |
|---|---|---|
| **CRUD** | formularze, proste walidacje, brak reguł między danymi | nie przemodelowuj; prosta warstwa danych, ewentualnie polityki walidacji |
| **Transformacja / obliczenia** | „policz”, „wyceń”, „wyznacz”, dużo reguł, deterministyczny wynik | czyste funkcje, polityki/strategie, obiekty wartości na wejściu i wyjściu, testy na przykładach |
| **Prezentacja** | „pokaż”, „zestawienie”, „raport”, łączenie wielu źródeł | read modele, projekcje (CQRS), bez logiki biznesowej |
| **Integracja** | inny system, inny język, inne tempo zmian | ACL / Open Host, tłumaczenie, idempotencja, outbox (ddd-context-mapping) |
| **Konkurencja o zasoby** | „nie może być dwa razy”, limity, rezerwacje, współbieżność | agregat wokół niezmiennika, dobór ziarnistości blokad, archetyp dostępności (ddd-archetypes) |

Jeden obszar biznesowy zwykle zawiera kilka klas — rozdziel je, zamiast budować jeden „model do wszystkiego”.

**Klasę wyznacza skutek operacji dla stanu systemu**, nie liczba reguł: obliczenie, którego wynik tylko zapisujemy, to CRUD
z polityką; bogata walidacja danych z żądania nie zmienia klasy. Rozstrzygający jest **test zmienności**:
*czy dane, na podstawie których podejmujemy decyzję, może w tej samej chwili zmienić inne żądanie?* Tak → konkurencja
o zasoby (atomowość, agregat). Nie → CRUD/obliczenie z walidacją.
Sygnały mocne i słabe, sygnały z makiet UI, pułapki, ścieżka dedukcji i typowe kombinacje: `references/problem-classes.md`.
Gdy obliczenie wygląda na znany problem (kolejność, przydział, pakowanie) → ddd-algorithm-recognition.

## Kiedy CRUD wystarczy
Brak reguł między polami, brak współbieżnych zmian, brak przemian istoty, zmiany nie wywołują skutków w innych
obszarach. Wtedy głęboki model to koszt bez zysku. Sygnał, że CRUD przestał wystarczać: pojawiają się flagi,
pole „status” z warunkami w wielu miejscach, powtarzające się `if` w serwisach, konflikty przy równoczesnych zmianach.
Przy polu „status” zacznij od **5 why** (sekcja Behaving): pytaj, po co zmienia się status, aż dojdziesz do zdarzenia
biznesowego; dopiero potem decyduj o maszynie stanów.

## Modelowanie przez przykłady
- Każdą regułę opisz **konkretnym przykładem** z liczbami i datami (Given / When / Then), razem z **kontrprzykładem**.
- Przykłady brzegowe: zero, jeden, wiele; granice dat; równoczesne działania; wycofanie.
- Przykłady od eksperta są lepsze niż Twoje; Twoje oznaczaj jako **[propozycja]**.

## Karta pojęcia (zapis w `docs/project/02-domain/concepts/<pojecie>.md`)
```markdown
# <Pojęcie> (kontekst: <nazwa>)
Definicja: …
Being: dane, krotność, typy, tożsamość (encja / obiekt wartości)
Behaving: kto zmienia, dlaczego, skutek, częstotliwość, współbieżność, powtarzalność, odwracalność
Becoming: w co się zmienia, czy odwracalnie, zdarzenie przełomowe
Niezmienniki: …
Klasa problemu: CRUD | transformacja | prezentacja | integracja | konkurencja o zasoby — pewność: wysoka/średnia/niska; ścieżka dedukcji: …
Dowody: id cytatów z banku (ddd-discovery-intake) albo [propozycja]
Przykłady (Given/When/Then) i kontrprzykłady: …
Otwarte pytania (hot spoty): …
```

## Ciągłe dojrzewanie modelu
Model ewoluuje razem z wiedzą (knowledge crunching). Ewolucja „na ślepo” utyka w lokalnym optimum — co jakiś czas
wróć do pytań podstawowych i sprawdź, czy nowe przypadki nie wymagają przemodelowania, a nie kolejnego `if`.
