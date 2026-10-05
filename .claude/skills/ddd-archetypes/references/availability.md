# Archetyp Availability — mapper (dostępność zasobów w czasie, blokady)

> **Spis treści:** Test dopasowania · Model (istota) · Zapobieganie nakładaniu się przedziałów · W kodzie — na co uważać · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania typu „czy zasób jest wolny?” na jeden kontrakt: **zablokuj / zwolnij / wyłącz** zasób w przedziale czasu
przez właściciela. Rezerwacja, serwis, relokacja czy awaria to tylko **klienci** kontraktu — model nie zna przyczyn
niedostępności. Efekt: nowy powód niedostępności nie zmienia istniejących metod. Protokół wspólny (pytania, „To zależy”, kontrola R/A/X, zapis): `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy zasób w danym czasie (albo teraz) jest wolny lub trzymany przez dokładnie jednego właściciela?*
Tak → pasuje. Pytanie „ile jednostek zostało?” → wartość (Accounting); „kto dostanie następny?” → Waitlist.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| „nie wolno dwa razy zarezerwować”, podwójne rezerwacje | ✅ |
| serwis / przestój / relokacja / awaria wyłącza zasób | ✅ |
| „czy sala/auto/stanowisko jest wolne w terminie X?” | ✅ |
| blokada „teraz” z terminem („trzymamy 15 minut”) | ✅ wariant prosty |
| flagi `reserved`, `inMaintenance` w encji zasobu | ✅ sygnał do refaktoryzacji |
| „sala na 10 osób, zajętych 7”, pula biletów | ⚠️ graniczny |
| „kto dostanie zwolnione miejsce?” | ❌ → Waitlist |
| „kogo przydzielić, by dopasować kompetencje / zmaksymalizować wartość?” | ❌ → General assignment |
| „co można robić równolegle?”, ścieżka krytyczna | ❌ → Planning |
| „rezerwacja: złożona → opłacona → anulowana” | ❌ maszyna stanów umowy (która *korzysta* z Availability) |

**Przypadki graniczne:**
- *Availability vs Accounting* — czy jednostka jest **niepodzielna** (binarny slot wolny/zajęty)? Tak → Availability.
  Pojemność liczbowa zużywana częściowo („7 z 10”) → Accounting (pula). Rozstrzyga: *czy klient wybiera konkretne miejsce
  (12A)?* Tak → N zasobów-slotów w Availability; nie → pula w Accounting.
- *Przyszłe terminy czy tylko „teraz”?* Rezerwacje w przyszłości → wariant czasowy (segmenty); „wolny teraz / zajęty do T”
  (hulajnoga, licencja, stanowisko) → wariant prosty.
- *Dobór zasobu po cechach* („ktoś z uprawnieniami SEP”) — wybór to General assignment, samo zajęcie — Availability.

## Model (istota)
**Poziomy problemu:** (1) wyłączny dostęp — zakaz podwójnej rezerwacji (auto, miejsce, sala); (2) niedostępność z innych
powodów — serwis, relokacja, awaria; (3) przejścia z regułami — nie wysyłaj do serwisu auta z aktywną rezerwacją, nie
wycofuj auta w serwisie lub z rezerwacjami, nie rezerwuj auta w serwisie ani wycofanego.

| Ewolucja rozwiązań | Co się psuje |
|---|---|
| Flagi w encji (`reserved`, `inMaintenance`, `inRelocation`) | miesza niepowiązane sprawy z danymi zasobu; gubi *kto* i *na kiedy* |
| Osobne modele Rezerwacja / Serwis / Relokacja, sprawdzanie w serwisach | każdy nowy powód mnoży warunki we wszystkich metodach (13, potem 21 sprawdzeń); logika „wolny w czasie?” rozsiana, brak jednego źródła prawdy, eksplozja testów kombinacji |
| **Stabilna abstrakcja dostępności w czasie** | klient pyta tylko „czy jesteś dostępny?” (ukrywanie informacji); przyczyny jedynie korzystają z kontraktu |

- **Kontrakt (krawędź modułu):** `zablokuj(zasób, przedział, właściciel)`, `zwolnij(…)`, `wyłącz(…)`. Serwis biznesowy ma
  jeden warunek: „czy udało się zablokować?”.
- **Segment `ResourceAvailability`** — mały agregat: zasób, opcjonalnie zasób nadrzędny (grupowanie), przedział, blokada, wersja.
- **Agregat dynamiczny** — operacja na dłuższym przedziale składa grupę segmentów i blokuje je razem w jednej transakcji.
- **Stany blokady:** wolny · zablokowany przez właściciela · wyłączony przez właściciela (np. serwis).

| Operacja | Reguła przejścia |
|---|---|
| wyłącz | zawsze; ponownie włączyć może tylko ten, kto wyłączył |
| zablokuj | tylko wolny; nie zablokowany przez innego; wyłączony — nikt (także wyłączający) |
| zwolnij | tylko obecny właściciel blokady |

**Ewolucja implementacji** (kontrakt się nie zmienia):

| Wariant | Problem |
|---|---|
| Jeden kalendarz wszystkich zasobów | ładuje wszystko; konflikty między niezwiązanymi zasobami; wydajność spada z liczbą zasobów |
| Kalendarz per zasób | konflikty przy równoczesnych operacjach na tym samym zasobie w **różnych** terminach |
| Kalendarz per zasób per okres (tydzień/miesiąc) | kłopoty na granicach okresów; dobre tylko przy naturalnych granicach biznesowych |
| **Per zasób per mały segment czasu** ✔ | ładuje tylko segmenty z żądania; konflikt tylko przy realnym nakładaniu |

**Wariant prosty (bez kalendarza)** — tylko „czy wolny **teraz**”; jedna blokada na zasób:

| Stan blokady | Znaczenie |
|---|---|
| brak | wolny |
| serwisowa | stan początkowy po rejestracji — zasób trzeba aktywować |
| wycofania | zasób wycofany |
| właściciela | zablokowany przez kogoś do określonego momentu |

Operacje: *zarejestruj* (start w serwisie) → *aktywuj* (tylko z serwisu); *wycofaj* (tylko wolny lub w serwisie);
*zablokuj na czas* (tylko wolny); *przedłuż bezterminowo* i *odblokuj* (tylko obecny właściciel). **Wygasanie:** blokada ma
termin; zadanie cykliczne zwalnia przeterminowane i publikuje „blokada wygasła”. Każda operacja zwraca zdarzenie sukcesu albo
odrzucenia z powodem („zasób zablokowany”, „brak blokady dla tego właściciela”) — łatwe do obsłużenia na krawędzi i w UI.

## Zapobieganie nakładaniu się przedziałów
- **PostgreSQL:** typ zakresu czasu + ograniczenie wykluczające (exclusion constraint, indeks GiST) na (zasób, przedział) —
  baza sama odrzuca nakładające się przedziały; zapytania o konflikt używają operatora nakładania.
- **Inne bazy — normalizacja i segmentacja:** rozszerz przedział do granic segmentów (10:05–11:30 przy 30' → 10:00–11:30),
  podziel na segmenty, unikalność (zasób, początek, koniec). Żądania nakładające się choćby o 5 minut konkurują o ten sam rekord.
- Długość segmentu = kompromis między precyzją a liczbą rekordów.
- **Read model kalendarza:** operacyjnie drobne segmenty, użytkownik chce okresów („1–3 stycznia wolne, 3–7 zajęte przez X”).
  Łącz sąsiednie segmenty tego samego właściciela (funkcje okna w SQL) → mapa właściciel → przedziały; „brak właściciela” =
  wolne. Front buduje z tego widoki dnia/miesiąca i filtry.

## W kodzie — na co uważać
- Zapis grupy segmentów z kontrolą wersji jednym poleceniem (`UPDATE … WHERE wersja = oczekiwana`): **liczba zmienionych
  wierszy = liczba segmentów**; mniej = konflikt, wycofaj całość.
- `wyłącz` odbiera blokady innym → zdarzenie „zasób przejęty” z listą poprzednich właścicieli, by ich procesy (projekt,
  rezerwacja) mogły zareagować.
- Przedziały półotwarte `[od, do)`; czas ze strefą (`timestamptz`), liczony w UTC; miesiące w niektórych językach od 0 —
  testuj daty graniczne.
- Test współbieżności: N równoległych prób zablokowania segmentu → dokładnie jedna się udaje (lub ≥ 1 kończy się konfliktem),
  stan końcowy spójny.

## Pytania
**A — decyzje standardowe:**
- Jakie są powody niedostępności i kto jest ich **właścicielem**? Które to blokada, a które wyłączenie?
- Rezerwujemy **przyszłe terminy** czy tylko „teraz”? (wariant czasowy / prosty)
- Jak długie są typowe blokady i jak często się nakładają? (długość segmentu, konflikty)
- Czy zasoby tworzą grupy/hierarchie (sala w budynku, flota)? (zasób nadrzędny)
- Wyłączenie przy istniejących blokadach: **odbiera** je (zdarzenie „przejęty”) czy jest odrzucane?

**B — luki** (przykłady):
- blokady przeterminowane (niezapłacona rezerwacja) — wygasanie, kto ustala termin? · bufor między blokadami (sprzątanie,
  dojazd)? · przedłużanie blokady? · historia/audyt blokad? · widok kalendarza? · co po zwolnieniu — powiadomić Waitlist? · blokada kilku zasobów naraz (sala + projektor) — wszystko albo nic?

## Kroki mapowania
1. **Zasoby** — co blokujemy; identyfikacja; zasób nadrzędny.
2. **Powody niedostępności** → właściciel + operacja (`zablokuj` / `wyłącz`); żaden powód nie trafia do modelu jako flaga.
3. **Wariant** — czasowy (segmenty) albo prosty (blokada „teraz” z terminem).
4. **Czas** — ziarnistość, długość segmentu, normalizacja przedziałów, `[od, do)`, strefa.
5. **Reguły przejść** — tabela operacja → warunek; reguły zależne od *kto/dlaczego* odłóż do warstwy polityk.
6. **Wygasanie i przedłużanie** — termin jako parametr operacji; zadanie cykliczne; zdarzenie „wygasła”.
7. **Nakładanie** — exclusion constraint albo unikalność segmentów; kontrola wersji grupy.
8. **Zdarzenia** — sukces/odrzucenie z powodem, „zasób przejęty”, „blokada wygasła” i kto je konsumuje.
9. **Read model** — skonsolidowane okresy.

## Decyzje do kontroli (R/A/X)
wariant (czasowy/prosty) · długość segmentu · zasób nadrzędny · wyłączenie vs istniejące blokady · kto może włączyć ·
termin wygaśnięcia i kto go ustala · przedłużanie · bufor · atomowość blokady wielu zasobów · strefa czasowa i granice
przedziałów · mechanizm bazy · konsumenci zdarzeń.

## Format wyniku
```markdown
# Model Availability: <obszar>
## Zasoby             — | Zasób | Identyfikacja | Zasób nadrzędny | Wariant |
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Powody niedostępności — | Powód | Właściciel | Operacja | Wygasa? |
## Czas               — ziarnistość, segment, normalizacja, strefa
## Reguły przejść     — | Operacja | Warunek | Odrzucenie (powód) |
## Wygasanie          — | Blokada | Termin (parametr) | Co po wygaśnięciu |
## Zdarzenia          — | Zdarzenie | Kiedy | Konsumenci |
## Nakładanie         — mechanizm (constraint / segmenty), kontrola wersji
## Read model         — widoki kalendarza
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- Modeluj **dostępność**, nie przyczyny — przyczyna to tylko właściciel blokady.
- „Czy klient X może zarezerwować salę Y?” (limit rezerwacji, abonament, rola) — **autoryzacja poza archetypem**; archetyp
  pilnuje tylko niezmiennika „jeden właściciel naraz”.
- Polityka zmienna („VIP ma 48 h na płatność, reszta 2 h”) → archetyp dostaje gotowy termin wygaśnięcia.
- Stan umowy/rezerwacji (opłacona, anulowana) żyje poza archetypem; Availability zna tylko blokadę.

## Kontrola jakości
- [ ] każdy powód niedostępności ma właściciela i operację; brak flag w encji zasobu
- [ ] tabela reguł przejść pokrywa zablokuj/zwolnij/wyłącz (lub operacje wariantu prostego)
- [ ] ziarnistość czasu, `[od, do)` i strefa określone; mechanizm przeciw nakładaniu wybrany
- [ ] wygasanie: termin jako parametr, zadanie cykliczne, zdarzenie
- [ ] mapowanie i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Coworking wynajmuje sale na godziny. Salę można wyłączyć na sprzątanie lub remont. Rezerwacja nieopłacona
w terminie przepada.”

```markdown
## Zasoby — | sala | numer | piętro (nadrzędny) | czasowy, segment 15' |
## Mapowanie — rezerwacja → blokada (właściciel: id rezerwacji) · sprzątanie/remont → wyłącz (właściciel: obsługa) ·
   „przepada” → wygaśnięcie blokady
## Niezmapowane — płatność (→ Accounting/umowa) · cena godziny (→ Pricing)
## Reguły — remont odbiera blokady (A) → „zasób przejęty” → rezerwacja powiadamia klienta
## Wygasanie — termin płatności: A „ile czasu?” — To zależy → parametr `blokada_ważna_do` liczony przez politykę płatności
## Decyzje — segment 15' (X → techniczne, w Uwagach) · bufor 15' na sprzątanie po każdej rezerwacji (X → zapytaj)
```
