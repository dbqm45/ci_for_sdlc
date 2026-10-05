---
name: ddd-discovery-intake
description: Użyj przy surowych materiałach (wywiady, notatki, tablice ES) — obszary biznesowe z dowodami, cytaty, sprzeczności.
metadata:
  katalog: "Użyj, gdy z surowych materiałów (wywiady, notatki, zdjęcia tablic Event Stormingu, dokumenty) trzeba wyprowadzić obszary biznesowe OPARTE NA DOWODACH — ocena „czy warto”, bank cytatów, progi dowodowe, wykrywanie sprzeczności, pytania strategiczne, zamrożenie obszarów. Nie do prowadzenia warsztatu (ddd-event-storming) ani granic kontekstów (ddd-strategic-analysis)."
  slowa: "notatki z wywiadów, transkrypcje, zdjęcia tablic, czy warto modularyzować, czy dzielić na moduły, prototyp, obszary biznesowe"
---

# Od materiałów do obszarów biznesowych (intake)

Cel: z materiałów źródłowych powstaje **zamrożona lista obszarów biznesowych**, w której każde twierdzenie ma cytat
ze źródła. To wejście do analizy strategicznej — obszar to jeszcze **nie** kontekst ani moduł.
Zasada nadrzędna: **cytować wolno tylko bank dowodów**; czego nie ma w banku, tego agent nie twierdzi.

## Przebieg (każdy krok kończy się bramką — protokół w ddd-facilitation)
| # | Krok | Wynik w `docs/project/` | Szczegóły |
|---|---|---|---|
| 0 | **Ocena wstępna („czy warto modularyzować?”)** — zawsze trzy pytania do człowieka | `01-discovery/pre-flight.md` | niżej |
| 1 | **Inwentarz i bramka rozmiaru** — lista źródeł z rozmiarem i typem; powyżej ~150 KB tekstu zapytaj: wszystko / wybrane / stop | sekcja w `corpus.md` | przetwarzaj źródło po źródle w podagentach, do głównego wątku wracają tylko indeksy |
| 2 | **Odczyt tablic** (zdjęcia/eksporty) | `02-domain/boards/<nazwa>.es.md` | `references/board-reading.md` |
| 3 | **Bank dowodów** | `02-domain/corpus.md` | `references/corpus.md` |
| 4 | **Sprzeczności** — osobny agent-krytyk, tylko wykrywa | `02-domain/contradictions.md` | `references/contradictions.md` |
| 5 | **Pytania strategiczne** — PRZED grupowaniem, bo odpowiedzi ważą obszary | `02-domain/strategic-gaps.md` | `references/strategic-questions.md` |
| 6 | **Rozmowa** — pytania o luki i sprzeczności; odpowiedzi człowieka trafiają do banku jako nowe źródło | `02-domain/user-answers.md` | ddd-facilitation → bramki |
| 7 | **Obszary** — grupowanie cytatów, progi, zatwierdzenie i zamrożenie | `02-domain/areas.md` | niżej |

## Krok 0 — ocena wstępna
Trzy pytania zadawane zawsze (materiały mogą tylko podpowiedzieć odpowiedź, rozstrzyga człowiek):
1. **Cykl życia** — czy to prototyp / rozwiązanie jednorazowe?
2. **Zakres** — czy zakres jest z góry jednym modułem?
3. **Złożoność** — czy są reguły, konkurencja o zasoby, integracje, czy tylko przechowywanie danych?
Kolejność ważności przy odmowie: jednorazowe > z góry jeden moduł > brak złożoności. Odmowa to też wynik:
zaproponuj pracę taktyczną w jednym module lub prosty CRUD (ddd-deep-modeling). Zapisz werdykt z uzasadnieniem i sekcją
„jeśli się nie zgadzasz”. Nic więcej nie zapisuj przed zatwierdzeniem werdyktu.

## Krok 7 — obszary
- **Próg obszaru:** co najmniej **3 mocne cytaty z co najmniej 2 różnych źródeł** (odpowiedzi człowieka to jedno źródło).
  Mocny cytat niesie regułę, liczbę, próg, decyzję, krok procesu, problem, termin albo odpowiedzialność; samo wymienienie nazwy — nie.
- Grupy poniżej progu → sekcja **„Kandydaci poniżej progu”** (z brakującymi dowodami), nie wyrzucaj ich.
- **Nazwa obszaru** — słowami biznesu, w języku źródła; nie nazwą techniczną.
- **Długość opisu proporcjonalna do liczby różnych faktów**: 3–4 cytaty → jedno zdanie; 5–9 → dwa–trzy; 10+ → akapit.
  Nie dopisuj treści ponad dowody.
- Każdy obszar: id, nazwa, opis, powiązanie z pytaniami strategicznymi, lista dowodów (id cytatów), liczba cytatów/źródeł,
  flaga „wskazany przez człowieka”.
- Bramka: przy każdym obszarze decyzja człowieka — przyjmij / zmień nazwę / połącz / rozdziel / odrzuć; potem osobne
  pytanie o **zamrożenie**. Zamrożony `areas.md` ma status `accepted` (ustawia człowiek) i zmienia się tylko nową wersją.
- Czego intake NIE robi: nie klasyfikuje Cynefin, nie wyznacza kontekstów, nie projektuje. To następne kroki (ddd-strategic-analysis,
  ddd-algorithm-recognition, ddd-deep-modeling).

## Badania z użytkownikami
Gdy dowodów od ekspertów jest za mało albo chodzi o użytkowników końcowych: plan badania, rekrutacja, scenariusz
wywiadu i synteza — `references/badania-uzytkownikow.md`.

## Koszt i stabilność
- Krok 0–1 i odczyt tablic: tani model; bank i grupowanie: std; krytyk sprzeczności: osobny agent std (świeży kontekst = niezależność).
- Wyniki są niedeterministyczne — dlatego: pamięć podręczna po skrócie treści źródła (zmiana źródła unieważnia tylko jego wynik),
  zamrażanie artefaktów przez człowieka, weryfikacja cytatów i progów skryptem: `python3 .claude/hooks/project_record.py evidence` (zero tokenów).
- Materiały z symulacji lub z wyobraźni agenta nigdy nie trafiają do banku jako dowód.

## Checklista
- [ ] werdykt oceny wstępnej zatwierdzony przez człowieka
- [ ] każdy cytat dosłowny, w języku źródła, z `źródło + miejsce`; `project_record.py evidence` przechodzi
- [ ] sprzeczności wykryte przez osobnego krytyka; każda ma pytanie diagnostyczne i status
- [ ] każdy obszar spełnia próg albo jest w „poniżej progu”
- [ ] `areas.md` zamrożony decyzją człowieka; przekazanie do ddd-strategic-analysis
