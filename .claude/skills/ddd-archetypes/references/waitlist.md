# Archetyp Waitlist — mapper (lista oczekujących, pojemność, priorytety)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których **podaż jest ograniczona, a chętnych więcej** (miejsca na kursie, bilety, wizyty, produkt
w przedsprzedaży), na model listy oczekujących: pojemność, typ kolejki, priorytety, oferta z terminem i rezygnacje. Efekt:
decyzja „kto dostaje zwolniony zasób” jest **sprawiedliwa, przewidywalna i wyjaśnialna**, a nie zaszyta w `ORDER BY data_wpisu`
(który nie obsługuje priorytetów, limitu ani rezygnacji). Protokół wspólny: `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy gdy zwolni się jednostka zasobu, trzeba wybrać, **kto z czekających** ją dostaje?*
Tak → pasuje. Jeśli nikt nie czeka, a pytanie brzmi „czy wolne?” → Availability.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| „lista rezerwowa”, „zapisz mnie, gdy zwolni się miejsce” | ✅ |
| „kolejność zgłoszeń”, „stali klienci mają pierwszeństwo” | ✅ |
| „maksymalnie 20 osób na liście rezerwowej” | ✅ pojemność listy |
| „masz 24 h na potwierdzenie, potem następna osoba” | ✅ oferta z terminem |
| „czy sala jest wolna w czwartek?” | ❌ → Availability |
| „ile miejsc zostało?”, pula biletów | ❌ → Accounting (pula) / Availability |
| „kogo przydzielić, by dopasować kompetencje i zmaksymalizować wartość?” | ❌ → General assignment |
| „kolejka zadań do przetworzenia” (worker, broker) | ❌ technika, nie archetyp biznesowy |
| „zgłoszenia obsługiwane wg SLA / pilności” | ⚠️ graniczny |

**Przypadki graniczne:**
- *Kolejka zgłoszeń (helpdesk)* — czy czekający **konkurują o ograniczony zasób** i mogą go nie dostać? Tak → Waitlist.
  Każde zgłoszenie i tak zostanie obsłużone, liczy się tylko kolejność pracy → General assignment / maszyna stanów.
- *Przydział jednorazowy (loteria, rekrutacja)* — wybór z puli naraz, a nie „po zwolnieniu” → reguła wyboru nad listą
  (to wciąż Waitlist, jeśli po odrzuceniu oferty idzie następny) albo General assignment, gdy liczy się dopasowanie.
- *Pozycja w kolejce vs saldo* — porządek, nie wartość; punkty lojalnościowe dające priorytet liczy Accounting, lista
  dostaje gotowy priorytet.

## Model (istota)
- **Lista oczekujących** — identyfikator, **zasób/oferta**, której dotyczy, **pojemność**, **typ kolejki**:
  - **FIFO** — kto pierwszy, ten lepszy;
  - **priorytetowa** — element ma priorytet (stały klient, pilność medyczna), pozostali dostają priorytet domyślny;
    przy równym priorytecie rozstrzyga czas wpisu (stabilność = sprawiedliwość).
- **Element (wpis)** — identyfikator oczekującego (strona, rezerwacja, zamówienie), priorytet, czas wpisu, opcjonalnie liczba
  potrzebnych jednostek i okno ważności wpisu.
- **Operacje:** dodaj (odmowa po przekroczeniu pojemności) · **pobierz następnego** (gdy zwolni się zasób) · usuń po
  identyfikatorze (rezygnacja) · podgląd zawartości i rozmiaru · (opcjonalnie) pozycja oczekującego.
- **Oferta** — „następny z listy” nie dostaje zasobu od razu, lecz ofertę z **terminem potwierdzenia**:

| Stan wpisu | Przejście |
|---|---|
| oczekuje | → zaoferowano (pobrany jako następny) · → zrezygnował · → wygasł (okno wpisu minęło) |
| zaoferowano | → przyjął (zasób przydzielony) · → odrzucił / termin minął → następny z listy |
| przyjął / zrezygnował / wygasł | stany końcowe |

- **Współpraca z Availability:** zdarzenie „zasób zwolniony” → polityka „pobierz następnego i **zablokuj dla niego** na czas
  oferty” → przyjęcie przedłuża blokadę, odrzucenie/wygaśnięcie zwalnia ją → kolejny cykl.
- Algorytm pod spodem: **kolejka priorytetowa** (kopiec) zamknięta za interfejsem listy.

## Pytania
**A — decyzje standardowe:**
- Kolejność: **FIFO czy priorytety**? Kto nadaje priorytet i czy może się **zmieniać** w czasie oczekiwania?
- **Pojemność:** ile osób może czekać? Co przy przekroczeniu — odmowa, druga lista, wypchnięcie najniższego priorytetu?
- **Oferta:** ile czasu na potwierdzenie? Co, gdy nie potwierdzi — następny, czy wraca na listę (na koniec / na swoje miejsce)?
- Czy jedna osoba może być na **wielu listach** jednocześnie (i co, gdy przyjmie ofertę z jednej)?

**B — luki** (przykłady):
- zwolnione 2 miejsca, a pierwszy chce 3 — czekać czy przeskoczyć do mniejszego zgłoszenia? · czy oczekujący widzi swoją
  pozycję? · ważność wpisu (lista na konkretny termin wygasa z nim) · limit odrzuceń ofert · oferta równoległa kilku osobom
  (kto pierwszy potwierdzi) · audyt decyzji „dlaczego nie ja?” · anonimizacja wpisów (RODO) · powiadomienia (kanał, kto wysyła).

## Kroki mapowania
1. **Zasób i lista** — czego dotyczy lista (termin, kurs, produkt); jedna lista per zasób czy per grupa zasobów.
2. **Oczekujący** — kto się wpisuje (strona → Party, rezerwacja); dane wpisu; ile jednostek.
3. **Typ kolejki i priorytety** — źródło priorytetu jako **parametr** z zewnątrz; reguła remisu.
4. **Pojemność** — limit i zachowanie przy przekroczeniu.
5. **Cykl oferty** — wyzwalacz (zdarzenie z Availability), termin potwierdzenia, skutki odrzucenia/wygaśnięcia.
6. **Rezygnacje i wygasanie wpisów** — usunięcie po identyfikatorze, okno ważności, zadanie cykliczne.
7. **Sprawiedliwość** — zapisz regułę kolejności tak, by dało się odtworzyć każdą decyzję (zdarzenia: wpisano, zaoferowano,
   przyjął, odrzucił, wygasł).
8. **Integracje** — Availability (blokada na czas oferty), Party (kim jest oczekujący), powiadomienia.

## Decyzje do kontroli (R/A/X)
FIFO/priorytet · źródło i zmienność priorytetu · reguła remisu · pojemność i zachowanie przy przekroczeniu · termin oferty ·
los po odrzuceniu (następny / powrót na listę / usunięcie) · wiele list naraz · częściowe dopasowanie liczby jednostek ·
widoczność pozycji · ważność wpisu · blokada zasobu na czas oferty.

## Format wyniku
```markdown
# Model Waitlist: <obszar>
## Listy              — | Lista | Zasób | Pojemność | Typ kolejki | Reguła remisu |
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Priorytety         — | Kategoria | Priorytet | Źródło (parametr) | Zmienny w czasie? |
## Cykl oferty        — | Stan | Zdarzenie | Następny stan | Termin |
## Przekroczenie pojemności / rezygnacje / wygasanie
## Integracje         — | Zdarzenie | Z / do archetypu | Reakcja |
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- Kolejność w `ORDER BY` zapytania = brak priorytetów, limitu i historii decyzji; lista jest bytem domenowym.
- **Priorytet to parametr**, nie logika listy: „czy klient jest stały?” liczy warstwa polityk (lub Accounting/Party).
- „Czy ta osoba w ogóle może się zapisać?” (wiek, uprawnienia, blokada konta) — **autoryzacja poza archetypem**; lista pilnuje
  tylko pojemności i porządku.
- Przydział bez oferty z terminem → zasób trafia do kogoś, kto już nie chce; bez blokady w Availability → wyścig z rezerwacją
  „z ulicy”.
- Zmiana priorytetu w trakcie = wyjęcie i ponowne wstawienie (z zachowaniem czasu wpisu, jeśli tak postanowiono).
- Sprawiedliwość jest **regułą biznesową** — zapisz ją jawnie i testuj przykładami (remisy, rezygnacje w trakcie oferty).

## Kontrola jakości
- [ ] każda lista ma zasób, pojemność, typ kolejki i regułę remisu
- [ ] priorytet ma źródło (parametr) i zasadę zmiany
- [ ] cykl oferty ma termin i zachowanie przy odrzuceniu/wygaśnięciu
- [ ] określono zachowanie przy przekroczeniu pojemności i przy rezygnacji
- [ ] współpraca z Availability (kto blokuje, kiedy zwalnia) opisana
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Szkoła językowa: grupa ma 12 miejsc. Gdy grupa pełna, można zapisać się na listę rezerwową (max 10 osób).
Kursanci kontynuujący mają pierwszeństwo. Po rezygnacji kogoś z grupy pierwsza osoba z listy dostaje SMS.”

```markdown
## Listy — | rezerwowa_grupy | grupa (12 miejsc w Availability) | 10 | priorytetowa | czas wpisu |
## Mapowanie — rezygnacja z grupy → „zasób zwolniony” (Availability) · SMS → oferta (powiadomienie poza archetypem) ·
   kursant kontynuujący → priorytet 1, pozostali → 0
## Niezmapowane — opłata za kurs (→ Accounting) · poziom językowy (dopasowanie → General assignment?)
## Priorytety — „kontynuujący” liczy warstwa polityk z historii zapisów (Party) → parametr `priorytet`
## Cykl oferty — termin potwierdzenia: A „ile czasu?” — To zależy (krócej tuż przed startem kursu) → parametr
   `oferta_ważna_do` liczony przez politykę; brak odpowiedzi → następny, wpis usunięty (X → zapytaj)
## Decyzje — pojemność 10 (R) · pierwszeństwo kontynuujących (R) · przepełnienie = odmowa (X → zapytaj)
```
