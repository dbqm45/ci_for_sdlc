# Archetyp Party — mapper (strony, role, relacje, adresy)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania o **kimś** (użytkownik, klient, lead, partner, dostawca, pracownik, dział) na model ze **stroną** (osobą
lub organizacją) w centrum, rolami jako jej cechą i relacjami jako osobnymi bytami z rolami na obu końcach. Efekt: ta sama
firma bywa klientem, dostawcą i partnerem bez duplikatów, flag i klas-iloczynów.
Protokół wspólny (pytania, „To zależy”, kontrola R/A/X, zapis): `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy ta sama osoba/organizacja występuje w kilku rolach albo łączą ją z innymi znaczące relacje?*
Tak → pasuje. Jedyny „ktoś” to login bez ról biznesowych → wystarczy moduł tożsamości.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| klient to osoba, firma albo JDG (oba naraz); „klient jest też dostawcą”; lead → klient; partner tylko przez API | ✅ |
| konto przed klientem (bez subskrypcji) lub po nim (umowa → konta) | ✅ |
| działy, oddziały; „w imieniu”, pełnomocnik, przełożony–podwładny | ✅ |
| adresy z zastosowaniami; „obserwuje / przestaje obserwować” (graf) | ✅ |
| hasło, MFA, sesje | ❌ uwierzytelnianie (osobny moduł, łączy `PartyId`) |
| „ile punktów ma klient?” | ❌ → Accounting |
| „czy doradca jest wolny w czwartek?” | ❌ → Availability |
| grupa docelowa kampanii, segment | ⚠️ graniczny |

**Przypadki graniczne:**
- *Segment / grupa* — ma **własną tożsamość i odpowiedzialność** (płaci, podpisuje)? Tak → Organization(Unit); nie → projekcja.
- *Uprawnienia* — z **roli w relacji** („manager zespołu X”) → relacja; globalne ACL → autoryzacja.
- *Konto użytkownika* — zwykle strona + rola `UŻYTKOWNIK`; poświadczenia poza archetypem.

## Model (istota)
### Strona
- **Party** — abstrakcja wspólna dla: **Person** (dane osobowe), **Organization** → **Company**, **OrganizationUnit** (dział,
  oddział, zespół). Zawiera: identyfikator, role, zarejestrowane identyfikatory, wersję.
- **PartyId** — jeden identyfikator dla wszystkich typów, generowany przez aplikację (kontrola, testowalność). Bez kluczy
  semantycznych: NIP/PESEL nie dotyczą każdego typu, telefony są odsprzedawane, e-mail bywa niezweryfikowany lub cudzy.
  Brak `PersonId`/`OrganizationId` — role i relacje nie zależą od typu.
- **RegisteredIdentifier** — 0..n identyfikatorów semantycznych (NIP, PESEL, REGON, paszport): typ + wartość, reguły użycia
  (unikalność, format, „NIP tylko dla organizacji”).
- **Role** — obiekt wartości (nazwa); dodawanie/usuwanie **idempotentne**; polityka może zabraniać ról (organizacyjnych dla osób).
- **Addresses** — **osobny agregat** (klucz `PartyId`): geograficzny, e-mail, www, telefon; każdy z zastosowaniami
  (kontaktowy, rozliczeniowy, do faktur) i cyklem życia. Reguły dotyczą zbioru naraz („dokładnie jeden aktywny adres kontaktowy”, „rozliczeniowy
  tylko dla firm”, „zmiana nie częściej niż raz na kwartał”) → sekcja krytyczna obejmuje wszystkie adresy strony. Adresy
  zmieniają się w innym rytmie niż role/uwierzytelnianie, rzadko łączą je reguły natychmiastowej spójności → osobno
  (w dużej skali osobny moduł „książki adresowej”).
- **Wyniki operacji jako zdarzenia**: sukces / pominięto (duplikat, brak zmian) / porażka; idempotencja upraszcza
  infrastrukturę; publikuj tylko faktyczne zmiany stanu.

### Relacje (Party Relationship)
- **PartyRelationship** — osobny rekord z tożsamością: „od” + rola, „do” + rola, nazwa, opcjonalnie okres; zarządzany
  niezależnie od stron; zwykle **kierunkowy**.
- **PartyRole** — rola przypięta do konkretnego końca relacji; tworzona przez fabrykę z **polityką definiowania ról**.
  Ta sama strona bywa „Managerem” w jednej relacji i „Podwładnym” w innej — uprawnienia z roli w relacji, nie globalne.
- Poziomy: **znaczenie** (lekarz–pacjent vs lekarz–konsultant — różne uprawnienia) · **(a)symetria** · **role w relacjach** ·
  **w imieniu** (operator konfiguruje stację właściciela) · **ograniczenia typów** (dostawcą tylko organizacja) · **reguły**
  ilościowe (max 10 dostawców, 12 podwładnych), jakościowe (kto z kim), czasowe (min. czas trwania, sezon) — sprawdzane przy tworzeniu.
- **Hierarchia organizacji** = relacje `nadrzędna–podrzędna` (płatnik = centrala, zakupy w oddziałach), nie `parentId`,
  bo struktur bywa kilka (prawna, kosztowa, sprzedażowa).
- **Przechowywanie:** strony + krawędzie; baza grafowa, gdy dominują ścieżki; lub oba (zapis relacyjnie z outboxem, zapytania
  w grafie). Graf służy innym procesom: „kto zatwierdzi wydatek w imieniu firmy?”.

## Pytania
**A — decyzje standardowe:**
- Adresy w agregacie strony czy osobno? (rozstrzyga reguła **natychmiastowej spójności** strony i adresów)
- Relacje w Party czy osobno? Czy reguły relacji muszą być spójne natychmiast, czy to wykonalne, co przy spójności ostatecznej?
- Zmiana strony wpływa na relacje (zablokowana strona)? Relacji na stronę (dezaktywacja managera z 10 podwładnymi)?
- Jakie identyfikatory semantyczne i czy muszą być unikalne?

**B — luki** (przykłady): scalanie duplikatów (ten sam NIP dwa razy)? · stan na dzień (historia danych i relacji)? · RODO:
anonimizacja przy zachowaniu relacji? · osoba kontaktowa firmy jako relacja? · zgody kontaktowe per adres? · wygasanie relacji? ·
kilka struktur organizacyjnych?

## Kroki mapowania
1. **Strony** — każdy „ktoś” z wymagań → typ (Person / Company / OrganizationUnit); nazwy ról usuń z nazw bytów.
2. **Role** — rzeczowniki-role (klient, lead, dostawca, partner, użytkownik) → role strony; polityka dozwolonych ról per typ.
3. **Identyfikatory** — `PartyId` techniczny; RegisteredIdentifier z regułami.
4. **Relacje** — z czasowników („pracuje w”, „w imieniu”, „płaci za”): nazwa, role na końcach, kierunek, okres, typy.
5. **Reguły relacji** — polityki; dla każdej: spójność natychmiastowa czy ostateczna.
6. **Adresy** — rodzaje, zastosowania, reguły zbioru, granica agregatu.
7. **Operacje** — rola, relacja, adres → sukces/pominięto/porażka; zwykle CRUD z politykami, czasem proces (rejestracja,
   zmiana adresu z weryfikacją) — nie buduj procesu, gdzie wystarczy polityka.

## Decyzje do kontroli (R/A/X)
typy stron · role per typ · identyfikatory i unikalność · agregat adresów · relacje w Party vs osobno · spójność reguł relacji ·
skutki blokady strony · kierunek i okres relacji · limity relacji · hierarchia · scalanie duplikatów · anonimizacja.

## Format wyniku
```markdown
# Model Party: <obszar>
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Strony             — | Typ strony | Dozwolone role | Identyfikatory (typ, unikalność) | Uwagi |
## Role               — | Rola | Dla typów | Polityka nadania/odebrania |
## Relacje            — | Relacja | Od (typ, rola) | Do (typ, rola) | Kierunek | Okres | Ograniczenia |
## Reguły relacji     — | Reguła | Rodzaj (ilościowa/jakościowa/czasowa) | Spójność | Parametr |
## Adresy             — | Rodzaj | Zastosowania | Reguły zbioru | Agregat |
## Operacje i zdarzenia — | Operacja | Sukces | Pominięto | Porażka |
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- **`User` + flagi** (`isCustomer`, pola firmy = null, mnożące się `validTo`, `active`, `agreementSignedAt`) — niezależne
  strumienie zmian w jednej klasie, ciągłe „czym to właściwie jest?”.
- **Klasa per rola** (`Customer`, `Lead`, `Partner`) — duplikaty albo `CustomerPartner`; semantycznie błędne.
- **Aplikacja per rola** — wiele źródeł, trudna spójność, błędy badane przez kilka zespołów. Przyczyna: model **zorientowany
  na rolę**, nie na stronę.
- Relacje w Party upraszczają proste przypadki; przy regułach ilościowych i dużych grafach Party to **obiekt-bóg** (wolny, mieszane odpowiedzialności).
- **Poza archetypem:** „czy X może zatwierdzić fakturę?” — autoryzacja **pyta** graf relacji; Party nie zna procesu. Też uwierzytelnianie.
- **Polityki zmienne jako parametry:** limit relacji zależny od pakietu klienta → Party dostaje gotowe `max_dostawców`.

## Kontrola jakości
- [ ] żadna nazwa roli nie jest typem bytu; brak flag `isX` na stronie
- [ ] jeden `PartyId` dla wszystkich typów; identyfikatory semantyczne nie są kluczem
- [ ] relacje: nazwa, role na obu końcach, kierunek, typy
- [ ] reguły relacji mają rodzaj i spójność; granica agregatu adresów uzasadniona
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Sieć klinik: pacjenci i firmy kupujące abonamenty dla pracowników. Lekarz jest pracownikiem kliniki albo
kontraktowym. Recepcja umawia wizyty w imieniu pacjenta. Fakturę dla firmy wysyłamy na adres centrali.”

```markdown
## Mapowanie pojęć
| pacjent | Person + rola PACJENT | rola, nie klasa |
| firma-abonent | Company + rola KLIENT_KORP | może być też dostawcą |
## Relacje
| zatrudnia / kontrakt | Klinika (PRACODAWCA / ZLECENIODAWCA) | Lekarz (PRACOWNIK / KONTRAKTOR) | → | od–do | — |
| abonament_dla | Company (PŁATNIK) | Person (BENEFICJENT) | → | od–do | limit `max_beneficjentów` |
| w_imieniu | Recepcja (PEŁNOMOCNIK) | Pacjent (MOCODAWCA) | → | — | tylko umawianie |
## Adresy — rozliczeniowy tylko dla Company (R); osobny agregat
## Decyzje
| limit beneficjentów | A: „To zależy” od pakietu → parametr `max_beneficjentów` |
| lekarz może być też pacjentem | X → zapytano → A: tak (dwie role jednej strony) |
| co z relacjami po zakończeniu zatrudnienia | X → hot spot |
## Niezmapowane pojęcia — wizyta (→ Availability), abonament jako produkt (→ Product/Pricing)
```
