# Archetyp Planning / Parallelization — mapper (etapy, zależności, harmonogram)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których praca składa się z **etapów zależnych od siebie**, na model grafu: etapy, zależności jawne
i niejawne (wspólny zasób), poziomy równoległe, ścieżka krytyczna, cykle i harmonogram. Efekt: odpowiedź na „co można robić
równolegle?”, „ile to potrwa?” i „co nas opóźni?” jest **wyliczana**, nie zgadywana w arkuszu. Protokół wspólny: `SKILL.md` →
„Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy jest zbiór prac, z których część wymaga wyników innych, i trzeba ustalić ich kolejność lub
równoległość?* Tak → pasuje. Pytanie „kto to zrobi?” → General assignment; „czy zasób jest wolny?” → Availability.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| „etap B może ruszyć dopiero po A” | ✅ |
| „co można robić równolegle?”, „ile potrwa projekt?” | ✅ |
| ścieżka krytyczna, kary za opóźnienia, „etap X musi zacząć się w oknie” | ✅ |
| „dwa etapy potrzebują tego samego specjalisty / sprzętu” | ✅ zależność niejawna |
| „kogo przydzielić, by zmaksymalizować wartość?” | ❌ → General assignment |
| „zarezerwuj koparkę na 3–7 maja” | ❌ → Availability |
| „zamówienie: nowe → w realizacji → wysłane” | ❌ maszyna stanów / proces |
| „kto następny do zasobu?” | ❌ → Waitlist |
| „proces zatwierdzania wniosku w krokach” | ⚠️ graniczny |

**Przypadki graniczne:**
- *Workflow / proces biznesowy* — czy kroki mają **czasy trwania i mogą iść równolegle**, a pytanie dotyczy czasu całości?
  Tak → Planning. Liniowy przepływ statusów jednego dokumentu → maszyna stanów.
- *Planowanie zmian pracowników* — gdy etapów nie łączą zależności, a problemem jest obsada → General assignment + Availability.

## Model (istota)
**Poziomy problemu:** (1) etapy, część wymaga wyników innych — co **równolegle**? (2) czasy trwania — ile trwa projekt, które
etapy są **krytyczne** (opóźnienie = opóźnienie całości, kary)? (3) etapy potrzebują tych samych zasobów (ludzie, sprzęt) —
to też zależność, choć nikt jej nie narysował; (4) zależności się zapętliły — którą zerwać? (5) harmonogram: od daty startu,
od etapu krytycznego (musi zacząć się w oknie), od dostępności wybranych zasobów.

| Element | Istota |
|---|---|
| **Etap** | nazwa, czas trwania, zależności od innych etapów, potrzebne zasoby/kompetencje |
| **Zależność jawna** | B wymaga A |
| **Zależność niejawna** | A i B potrzebują tego samego unikalnego zasobu → nie mogą iść równolegle |
| **Graf etapów** | sortowanie topologiczne na **poziomy równoległe**; poziom = etapy bez zależności między sobą |
| **Czas projektu** | ≈ suma najdłuższych etapów kolejnych poziomów; dokładnie — ścieżka krytyczna |
| **Cykl** | sprzeczne reguły planu → wynik „brak wykonalnego planu” + propozycja najmniejszego zestawu zależności do usunięcia (decyduje człowiek), nie wyjątek techniczny |
| **Harmonogram** | osobne obliczenie — kalkulatory: od startu, od etapu krytycznego, od dostępności zasobów; plan równoległości bez zmian, zmienia się przypięcie do kalendarza |

- Generyczny graf i sortowanie żyją **osobno od domeny** (węzeł niesie dowolny ładunek) — ten sam algorytm użyjesz gdzie indziej.
- **Współpraca:** Planning mówi **co i w jakiej kolejności**, General assignment — **kim** (optymalny przydział), Availability —
  **czy zasób jest wolny**, i blokuje go. Brakujące zasoby → zdarzenie „zapotrzebowanie niespełnione” dla innych procesów
  (np. ryzyka).

## Pytania
**A — decyzje standardowe:**
- Które zależności wynikają z **natury pracy**, a które z przyzwyczajenia (można je zerwać)?
- Czy etap może zacząć się **przed całkowitym końcem** poprzedniego (częściowe zależności)?
- Co się dzieje, gdy etap się **opóźni** — kogo to dotyka, jakie są kary?
- Czasy trwania **pewne czy szacunkowe** (wtedy zakresy / symulacja)?

**B — luki** (przykłady):
- kto zatwierdza plan i czy jest **wiążący** (blokuje zasoby), czy tylko symulacją? · wspólne zasoby między projektami ·
  kalendarz roboczy (weekendy, święta) · przeplanowanie po opóźnieniu — automatyczne czy ręczne? · porównywanie wariantów planu ·
  co przy cyklu — kto decyduje, którą zależność zerwać?

## Kroki mapowania
1. **Etapy** — lista z czasami trwania (wartość lub zakres) i potrzebnymi zasobami.
2. **Zależności jawne** — z wymagań; oznacz „z natury” vs „z przyzwyczajenia”.
3. **Zależności niejawne** — wyprowadź ze wspólnych unikalnych zasobów.
4. **Graf i poziomy** — sortowanie topologiczne; wykryj cykle → wynik domenowy z propozycją zerwania.
5. **Czas i ścieżka krytyczna** — etapy krytyczne, kary, okna czasowe.
6. **Harmonogram** — wybierz kalkulator(y): od startu / od etapu krytycznego / od dostępności zasobów.
7. **Granice** — co przekazujesz do General assignment (kto) i Availability (blokady); zdarzenie „zapotrzebowanie niespełnione”.
8. **Testy** — scenariusze biznesowe jako przykłady (patrz niżej).

## Decyzje do kontroli (R/A/X)
które zależności są twarde · częściowe zależności · pewność czasów (wartość / zakres) · traktowanie wspólnych zasobów ·
kalkulator harmonogramu · kalendarz roboczy · plan wiążący vs symulacja · reakcja na cykl · reakcja na opóźnienie i kary ·
kto zatwierdza plan.

## Format wyniku
```markdown
# Model Planning: <obszar>
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Etapy              — | Etap | Czas trwania | Zasoby | Krytyczny? |
## Zależności         — | Od | Do | Rodzaj (jawna/niejawna) | Twarda? | Źródło |
## Poziomy równoległe — | Poziom | Etapy | Najdłuższy etap |
## Ścieżka krytyczna i czas projektu
## Cykle              — wykryte / propozycja zerwania / kto decyduje
## Harmonogram        — kalkulator, punkt zaczepienia, kalendarz roboczy
## Integracje         — General assignment, Availability, zdarzenia
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- Graf w domenie, algorytm (sortowanie topologiczne, ścieżka krytyczna) za interfejsem — generyczny, z ładunkiem domenowym.
- Pominięte zależności niejawne → plan „równoległy” na papierze, niewykonalny w praktyce.
- Cykl jako wyjątek techniczny ukrywa problem biznesowy — zwróć wynik z propozycją.
- Mieszanie planu z harmonogramem: zmiana daty startu nie powinna przeliczać równoległości.
- „Czy kierownik może zmienić plan?” — **autoryzacja poza archetypem**; Planning tylko liczy.
- Polityka zmienna (kary, bufory, kalendarz roboczy zależny od kraju) → parametr kalkulatora, nie `if` w grafie.

## Kontrola jakości
- [ ] każdy etap ma czas trwania (lub zakres) i zasoby
- [ ] zależności niejawne wyprowadzone ze wspólnych zasobów
- [ ] poziomy równoległe policzone; cykle obsłużone jako wynik domenowy
- [ ] ścieżka krytyczna i kalkulator harmonogramu wybrane
- [ ] granice z General assignment i Availability opisane
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

**Testy:** scenariusze biznesowe (np. „badania i rozwój”, „kaskada z etapem krytycznym”) jako przykłady — wejście: etapy
i zależności; wynik: poziomy równoległe / czas / etap krytyczny. Asercje w języku domeny („etap Projekt jest na poziomie 2”).

## Przykład (skrócony)
**Wejście:** „Remont mieszkania: skucie płytek (2 dni), elektryka (3), hydraulika (2), tynki (4) po elektryce i hydraulice,
malowanie (2) po tynkach. Elektryk i hydraulik to ta sama firma, jedna ekipa. Za każdy dzień po terminie — kara.”

```markdown
## Zależności — skucie → elektryka, skucie → hydraulika (R, jawne) · elektryka ↔ hydraulika (niejawna: ta sama ekipa)
## Poziomy — 1: skucie · 2: elektryka · 3: hydraulika · 4: tynki · 5: malowanie (bez ekipy: 2 i 3 równolegle)
## Czas — 2+3+2+4+2 = 13 dni; ścieżka krytyczna: wszystkie etapy
## Harmonogram — od daty startu; kalendarz roboczy: A „czy soboty?” — To zależy → parametr `kalendarz_roboczy`
## Niezmapowane — kara za dzień (→ Pricing/Accounting) · wybór ekipy (→ General assignment)
## Decyzje — ekipa nie dzieli się na dwa etapy (X → zapytaj: czy druga ekipa skróci do 11 dni?)
```
