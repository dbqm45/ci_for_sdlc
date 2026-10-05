---
name: txt-polish-style
description: Użyj przy redakcji tekstu po polsku do gotowej wersji — skracanie, strona czynna, konkret, jeden ton, typografia.
metadata:
  katalog: "Użyj przy redakcji polskiego tekstu, gdy wynikiem ma być gotowa, poprawiona wersja — skracanie i wzmacnianie zdań, strona czynna, konkret, jeden ton i perspektywa, czytelność instrukcji i komunikatów, spójność między rozdziałami, typografia dokumentu. Nie do raportu błędów (txt-polish-correctness) ani zmian merytorycznych."
  slowa: "zredaguj, przeredaguj, redakcja tekstu, gotowa wersja tekstu, popraw styl, uprość zdanie, urzędowy styl, czytelniej, komunikat w interfejsie, ton, komunikaty UI, teksty przycisków, komunikat błędu, link kliknij tutaj, mikrotekst"
argument-hint: "[standardowy|rozszerzony|premium] [plik lub fragment]"
---

# Redakcja polskiego tekstu

Wynik: **gotowy tekst**, nie lista uwag. Poprawność (pisownia, interpunkcja, składnia) jest warunkiem wstępnym —
najpierw txt-polish-correctness (linter + ściągawka), potem styl.

## Zasada minimalnej ingerencji
Zmieniaj tylko to, co wymaga poprawy. Zachowaj głos autora, terminologię (słownik projektu), strukturę i **sens** każdego zdania.
Nie dopisuj treści, nie „upiększaj”, nie zmieniaj kodu, poleceń, cytatów źródłowych ani liczb. Zdanie o niejasnej intencji →
dwie wersje i pytanie do autora zamiast zgadywania.

## Tryby
| Tryb | Zakres | Kiedy |
|---|---|---|
| **standardowy** (domyślny) | korekta + uproszczenie + styl + ton + czytelność | dokumentacja, README, opisy, artefakty `docs/project/` |
| **rozszerzony** | + spójność między rozdziałami/plikami (terminy, szczegółowość, przejścia) | dłuższe dokumenty, zestaw plików |
| **premium** | + obrazowość, kontrast, rytm — **tylko na wyraźną prośbę** | artykuły, e-booki, teksty marketingowe |
Nie podano trybu → standardowy (powiedz o tym).

## Styl docelowy wg rodzaju tekstu
| Rodzaj | Perspektywa i ton | Priorytety |
|---|---|---|
| dokumentacja techniczna, runbook | bezosobowo lub „ty” (konsekwentnie), rzeczowo | kroki, czasowniki operacyjne, zero mgły informacyjnej |
| artefakty projektu (brief, ADR, raport) | neutralnie | TL;DR na początku, konkret i liczby, decyzja + uzasadnienie |
| komunikaty UI, błędy, przyciski | „ty”, krótko | co się stało + co zrobić; przycisk = czasownik z obietnicą efektu |
| artykuł, e-book, przewodnik | „ty” lub „my”, półformalnie | narracja + praktyka, rytm zdań |

## Przebieg (dla każdej sekcji)
1. **Korekta** — błędy normy (txt-polish-correctness).
2. **Uproszczenie** — puste słowa out, jedno zdanie = jedna myśl, rzeczowniki odczasownikowe → czasowniki.
3. **Styl** — strona czynna, konkret zamiast abstrakcji, bez urzędowego tonu.
4. **Ton** — jedna perspektywa i jeden poziom formalności w całym tekście.
5. **Czytelność** — czytelnik wie, gdzie jest, co ma zrobić i co się stanie potem.
6. *(rozszerzony)* **Spójność** — terminy, poziom szczegółowości, przejścia.
7. *(premium)* **Obrazowość** — oszczędnie, tylko gdy wzmacnia.
Szczegóły, tabele zamienników i przykłady: `references/redakcja.md`. Tekst, który brzmi jak wygenerowany
(puenty, trójki, „kluczowy”, resztki czatu): `references/slady-pisania-ai.md` — z porównaniem faktów przed i po. Dokument do druku/PDF/DOCX: `references/typografia-i-sklad.md`.

## Wynik
- Zmiany w pliku wprowadzaj punktowo (Edit), nie przepisuj całych plików; długi tekst — sekcja po sekcji.
- Na końcu nota (≤ 8 linii): tryb, zakres, 3–5 głównych zmian z powodem, **zachowane decyzje autora**, pytania do autora.
- Artefakt `docs/project/`: po redakcji `project_record.py check` musi przejść (TL;DR i Przekazanie zostają).

## Checklista
- [ ] tekst przeszedł korektę (linter czysty z uwag WYSOKICH/ŚREDNICH)
- [ ] sens, liczby, terminy, kod i cytaty bez zmian
- [ ] jedna perspektywa i ton; zdania krótkie tam, gdzie instrukcja
- [ ] nota redakcyjna z zachowanymi decyzjami autora
