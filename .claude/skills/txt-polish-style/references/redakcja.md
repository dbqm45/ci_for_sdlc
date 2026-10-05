# Warsztat redakcyjny — zasady i zamienniki

Zasada nadrzędna: **dobry tekst jest poprawny, krótki, konkretny i prowadzi czytelnika — dopiero potem brzmi ładnie.**
<!-- polish-lint: off -->

## 1. Uproszczenie
| Zamiast | Pisz |
|---|---|
| w celu | aby, żeby |
| z uwagi na fakt, że | ponieważ, bo |
| należy zaznaczyć, że / warto wspomnieć, że | (usuń) |
| w ramach | podczas, przy, w |
| jest możliwe | można |
| dokonać analizy / przeprowadzić weryfikację / wykonać optymalizację | przeanalizować / zweryfikować / zoptymalizować |
| w związku z powyższym, w dniu dzisiejszym, niniejszym, przedmiotowy | dlatego, dziś, (usuń), ten |
| posiadać (o rzeczach) | mieć |
- **Jedno zdanie = jedna myśl.** Więcej niż 2–3 poziomy zależności → podziel.
- Słowo w trzech kolejnych zdaniach → przebuduj zdanie (ale **terminu technicznego nie zastępuj synonimem**).
- Przymiotnik, który nic nie wnosi („ciekawy”, „nowoczesny”, „kompleksowy”) → usuń.
<!-- polish-lint: on -->

## 2. Styl
- **Strona czynna:** „Zespół wdrożył poprawkę.” zamiast „Zostało wykonane wdrożenie poprawki.” Bierna tylko, gdy wykonawca
  jest nieistotny lub nieznany („Plik zostaje usunięty po 30 dniach.”).
- **Konkret:** „skróciliśmy czas odpowiedzi z 800 do 200 ms” zamiast „nastąpiła optymalizacja wydajności”;
  „ponad 10 000 użytkowników” zamiast „duża liczba użytkowników”.
- **Rytm:** krótkie zdanie = akcent; dłuższe = kontekst. Kilka długich pod rząd → podziel jedno.
- **Naturalność:** pisz tak, jak wyjaśniłbyś to koledze przy biurku — bez urzędowych formuł i bez żargonu marketingowego.

## 3. Ton i perspektywa
| Perspektywa | Kiedy | Przykład |
|---|---|---|
| bezosobowo / tryb rozkazujący | instrukcje, runbooki | „Uruchom migrację.” / „Należy uruchomić…” — wybierz jedno |
| „ty” | poradniki, komunikaty UI | „Możesz przywrócić wersję…” |
| „my” | teksty zespołu/firmy, ADR | „Wybraliśmy PostgreSQL, bo…” |
| neutralna | raporty, analizy | „System obsługuje…” |
Mieszanie („Użytkownik powinien… Możesz teraz… System umożliwia…”) to najczęstszy błąd — ujednolić. Poziom formalności:
profesjonalny (dokumentacja), półformalny (artykuły), osobisty (blog) — jeden w całym tekście.

## 4. Czytelność instrukcji (UX tekstu)
Czytelnik zawsze wie: **gdzie jest** (kontekst), **co ma zrobić** (akcja), **co się stanie** (efekt).
- Kroki numerowane, jeden krok = jedna akcja; warunek przed akcją („Jeśli X, kliknij Y”).
- Czasowniki operacyjne: kliknij, wybierz, wpisz, uruchom, sprawdź — zamiast „można skorzystać z opcji”.
- Bez mgły: „kliknij **Zapisz**, aby zakończyć” zamiast „możliwe jest wykonanie operacji zapisu”.
- Komunikat błędu: co się stało + dlaczego (jeśli wiadomo) + co zrobić. Bez obwiniania użytkownika.
- Przycisk: czasownik + efekt („Zapisz zmiany”, „Wyślij zaproszenie”), nie „OK”/„Kliknij tutaj”.

## 5. Spójność (tryb rozszerzony)
- Zbierz terminy, nazwy własne i skróty → jedna forma w całości (zgodnie ze słownikiem projektu).
- Wyrównaj szczegółowość podobnych sekcji (jedna z przykładem, druga bez → dodaj albo usuń w obu).
- Przejścia: sekcja kończy się tym, co dalej, albo następna zaczyna od problemu, który rozwiązuje.
- Jednolite wyróżnienia: nazwy przycisków zawsze tak samo (pogrubienie albo cudzysłów), kod zawsze w `kodzie`.

## 6. Obrazowość (tryb premium, na życzenie)
Oszczędnie i tylko gdy wzmacnia: obraz zamiast ogólnika („reaguje, zanim zauważysz opóźnienie” zamiast „działa szybko”),
wejście w sytuację czytelnika, kontrast przed/po („Wczoraj 10 minut. Dziś trzy kliknięcia.”), jedno krótkie zdanie po długim akapicie.

## 7. Heurystyki
Czytasz zdanie dwa razy → przepisz. Da się usunąć słowo bez straty sensu → usuń. Brzmi urzędowo → po ludzku.
Czytelnik nie wie, co kliknąć → popraw. Akapit nic nie wnosi → skróć albo usuń (za zgodą autora, jeśli to treść merytoryczna).
