# Ocena heurystyczna, przegląd ekspercki i testy użyteczności

## 10 heurystyk Nielsena (do oceny i do uzasadniania uwag)
1. **Widoczność stanu systemu** — użytkownik wie, co się dzieje (postęp, zapisano, ile zostało).
2. **Zgodność ze światem użytkownika** — jego słowa i kolejność, nie język bazy danych.
3. **Kontrola i swoboda** — wyjście awaryjne: anuluj, cofnij, wróć bez utraty danych.
4. **Spójność i standardy** — to samo wygląda i działa tak samo; konwencje platformy.
5. **Zapobieganie błędom** — ograniczenia, dobre wartości domyślne, potwierdzenie przed nieodwracalnym.
6. **Rozpoznawanie zamiast przypominania** — opcje widoczne, kontekst przy polu, ostatnio używane.
7. **Elastyczność i wydajność** — skróty dla wprawnych, bez utrudniania początkującym.
8. **Estetyka i minimalizm** — każda informacja konkuruje o uwagę; usuń zbędne.
9. **Rozpoznanie, diagnoza i naprawa błędów** — komunikat prostym językiem: co się stało i co zrobić.
10. **Pomoc i dokumentacja** — w kontekście zadania, krótka, z krokami.

## Przegląd heurystyczny i ekspercki — procedura
1. Zakres: przepływy i ekrany, dla kogo, jakie zadania.
2. 3–5 oceniających niezależnie (jeden znajduje mniej niż połowę problemów), najlepiej osoby, które nie projektowały
   ekranu. Agent może być jednym z oceniających, nie jedynym.
3. Każdy problem: miejsce (ekran, element), naruszona heurystyka lub zasada, opis, **waga 0–4**
   (0 nie problem, 1 kosmetyczny, 2 drobny, 3 poważny — naprawić przed wydaniem, 4 katastrofa — blokuje zadanie),
   rekomendacja. Także mocne strony — żeby ich nie zepsuć.
4. Scal wyniki, uzgodnij wagi, posortuj. Przegląd ekspercki rozszerza heurystyki o wytyczne, psychologię poznawczą
   i doświadczenie oceniającego; nie zastępuje testów z użytkownikami.

## Test użyteczności
- **Uczestnicy**: prawdziwi lub reprezentatywni użytkownicy; ok. 5 na segment w teście jakościowym (większość
  częstych problemów), więcej przy pomiarze ilościowym (ok. 20+ i jasno zdefiniowane miary).
- **Zadania** realistyczne, z celem, bez podpowiadania słowami z interfejsu: „Zwróć buty, które przyszły w złym
  rozmiarze” zamiast „Kliknij Zwroty”. Kolejność od łatwych; każde z kryterium sukcesu.
- **Myślenie na głos**, prowadzący neutralny (nie pomaga, nie tłumaczy, pyta „czego się spodziewałeś?”).
- **Formy**: moderowany (na miejscu lub zdalnie) — głębsze „dlaczego”; niemoderowany zdalnie — szybciej i taniej,
  bez dopytania.
- **Miary**: ukończenie zadania, czas, błędy, ocena trudności po zadaniu (SEQ, 1–7), na końcu SUS (10 pytań, wynik
  0–100; średnia z wielu badań ok. 68).
- **Raport**: najważniejsze problemy z wagą, częstością (ilu uczestników), cytatem i nagraniem lub zrzutem, rekomendacje;
  co działało dobrze. Nagrania to dane osobowe — zgoda i retencja (ddd-discovery-intake).

## Benchmark UX
Te same zadania i miary powtarzane co wydanie lub kwartał (oraz u konkurencji, jeśli to możliwe) pokazują, czy
zmiany poprawiają doświadczenie. Warunek: stały zestaw zadań, podobni uczestnicy, wystarczająca próba.

## Źródła
- J. Nielsen, *10 Usability Heuristics for User Interface Design* (NN/g, 1994, aktualizacja 2020); skala wagi Nielsena
- NN/g: [UX Expert Reviews](https://www.nngroup.com/articles/ux-expert-reviews/),
  [Usability Testing 101](https://www.nngroup.com/articles/usability-testing-101/),
  [Benchmarking UX](https://www.nngroup.com/articles/benchmarking-ux/); J. Brooke — SUS (1996)
Opisane własnymi słowami.
