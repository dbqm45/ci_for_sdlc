---
name: proc-product-discovery
description: Użyj przy decyzji, co budować i po co — wynik zamiast funkcji, drzewo szans, JTBD, testy założeń, RICE, eksperymenty.
metadata:
  katalog: "Użyj, gdy trzeba zdecydować, CO budować i po co — wynik zamiast funkcji, drzewo szans i rozwiązań, problem i JTBD, pytania „jak moglibyśmy”, co najmniej trzy rozwiązania, mapa założeń i ich testy, priorytety (RICE, MoSCoW, Kano), metryki sukcesu (HEART, OKR), eksperymenty A/B, gotowość do wydania. Nie do rytuałów zespołu (proc-agile) ani projektu interfejsu (fe-ux-design)."
---

# Odkrywanie produktu

Cel: nie budować rzeczy, których nikt nie potrzebuje, i wiedzieć, po czym poznamy, że zadziałały. Odkrywanie
i dostarczanie idą równolegle — małe testy co tydzień, nie jedna faza „badań” przed projektem.

## Procedura
1. **Wynik, nie funkcja.** Zacznij od mierzalnego wyniku produktowego, na który zespół ma wpływ („odsetek nowych
   klientów, którzy w 7 dni wystawili pierwszą fakturę: 35% → 50%”). Prośba o funkcję („dodajmy eksport do Excela”)
   to hipoteza rozwiązania — zapytaj, jaki problem i jaki wynik za nią stoi.
2. **Dowody od użytkowników**: wywiady o konkretnych, niedawnych zdarzeniach, dane z analityki, zgłoszenia
   (ddd-discovery-intake, `badania-uzytkownikow.md`). Bez dowodów szanse są zgadywaniem — oznacz je jako założenia.
3. **Drzewo szans i rozwiązań** (opportunity solution tree): wynik → szanse (potrzeby, problemy, pragnienia klientów)
   → rozwiązania → testy założeń. Test szansy: „czy da się ją rozwiązać więcej niż jednym sposobem?” — jeśli nie, to
   rozwiązanie przebrane za szansę. Drzewo dla jednego zespołu i jednego wyniku, nie dla całej firmy.
4. **Wybór szansy docelowej**: rozmiar (ilu klientów, jak często, jak bardzo boli), czynniki rynkowe, strategia firmy.
   Wysiłku na tym etapie nie liczysz — wiele szans ma zaskakująco proste rozwiązania.
5. **Ramowanie problemu**:
   - **stwierdzenie problemu**: kto, w jakiej sytuacji, czego potrzebuje, dlaczego to ważne, jak poznamy poprawę —
     bez rozwiązania w treści;
   - **zadanie do wykonania (JTBD)**: „Gdy [sytuacja], chcę [motywacja], żeby [oczekiwany efekt]” — opisuje postęp,
     którego człowiek szuka, niezależnie od produktu;
   - **„Jak moglibyśmy…?”**: oparte na odkryciu, nakierowane na efekt, pozytywne, ani za szerokie, ani z gotowym
     rozwiązaniem („…sprawić, żeby klient był pewien, że faktura jest poprawna?”, a nie „…dodać podgląd PDF?”).
6. **Co najmniej trzy rozwiązania** dla wybranej szansy (porównanie daje lepsze decyzje niż ocena jednego pomysłu);
   każde z propozycją wartości — dla kogo, jaki ból usuwa, jaki zysk daje, czym różni się od obecnego sposobu.
7. **Mapa założeń**: dla każdego rozwiązania wypisz, co musi być prawdą — w czterech ryzykach: **wartość** (czy
   zechcą), **użyteczność** (czy potrafią), **wykonalność** (czy zbudujemy — z inżynierią, ograniczenia API, danych,
   wydajności), **opłacalność** (czy to działa dla firmy: koszt, prawo, sprzedaż, wsparcie). Ustaw na macierzy
   *ważność × siła dowodów*; testujesz najpierw ważne i słabo udowodnione.
8. **Testy założeń od najtańszego**: rozmowa i dane, które już są → prototyp papierowy lub klikalny (fe-ux-design)
   → test „ręcznie zamiast automatu” (concierge) → wersja dla wąskiej grupy za flagą → A/B
   (`references/eksperymenty-i-wydanie.md`). Przed testem zapisz kryterium sukcesu i decyzję, którą podejmiesz
   przy każdym wyniku. Test „fałszywych drzwi” (przycisk funkcji, której jeszcze nie ma) tylko z uczciwym komunikatem
   po kliknięciu.
9. **Decyzja i zapis**: wybrane rozwiązanie, odrzucone z powodem, wyniki testów → `docs/project/01-discovery/`
   (core-project-record). Zakres pierwszej wersji tnij pionowo (proc-agile) — działająca funkcja przed dopracowaną.

## Priorytety i metryki
Szczegóły i wzory: `references/priorytety-i-metryki.md` — RICE, MoSCoW, Kano, wartość/wysiłek (WSJF: proc-lean),
HEART z celami, sygnałami i metrykami, OKR, metryka wiodąca z metrykami ochronnymi, dopasowanie produktu do rynku,
plan zdarzeń analitycznych.

Model biznesowy, rynek i konkurencja (kanwa modelu biznesowego, Lean Canvas, analiza konkurencji, SWOT z działaniami,
pięć sił Portera, mapa doświadczenia klienta): `references/model-biznesowy-i-rynek.md`.

## Zasady
- Decyzje produktowe (co budujemy, co wycinamy, czy wydajemy) podejmuje człowiek. Agent przygotowuje dowody,
  opcje z rekomendacją i pytania (core-plan-interview).
- Dane osobowe w badaniach i analityce: zgoda, minimalizacja, bez wysyłania do zewnętrznych narzędzi bez zgody
  organizacji (RODO).
- Wynik, który nie ma miary, nie jest wynikiem. Miara, której nikt nie sprawdzi po wydaniu, jest dekoracją.

## Checklista
- [ ] wynik mierzalny, z wartością wyjściową
- [ ] szanse oparte na dowodach, z oznaczonymi założeniami
- [ ] ≥ 3 rozwiązania, mapa założeń w czterech ryzykach
- [ ] test najsłabszego ważnego założenia z kryterium sukcesu zapisanym przed testem
- [ ] metryki sukcesu i ochronne + plan zdarzeń; termin sprawdzenia po wydaniu

## Źródła
- T. Torres, [Opportunity Solution Trees](https://www.producttalk.org/opportunity-solution-trees), *Continuous Discovery Habits* (2021)
- M. Cagan, *Inspired* (2018) — cztery ryzyka; NN/g, [How Might We questions](https://www.nngroup.com/articles/how-might-we-questions/)
- C. Christensen i in., *Competing Against Luck* (2016) — JTBD; Strategyzer — propozycja wartości
- [roadmap.sh — Product Design](https://roadmap.sh/product-design)
Opisane własnymi słowami.
