# Refinement ciągły — pytania od ludzi i wynik per historyjka (plan)

Stan: 2026-11-21, plan do decyzji; nic z niego nie jest zbudowane. Źródło: koncepcja „Refinement Intelligence”
właściciela (dwa dokumenty z 2026-11-21: *Business concept* i *Implementation plan*, wersje 1.0) oraz rozmowa o jej
miejscu w Delivery Intelligence Suite (dbqm45/pdi `docs/plan-program-ai-wg-aplikacji.md`). Wniosek z tej rozmowy:
koncepcja nie jest osobnym produktem, tylko brakującą częścią tej aplikacji (pytania od ludzi i wynik refinementu)
oraz widoku „Discuss with team” planowanego w DI Team (dbqm45/pdi `TODO.md`).

Cel: refinement nie zaczyna się na spotkaniu. Zespół zgłasza pytania wtedy, gdy się pojawiają, aplikacja łączy je
z tym, co sama wykryła, a spotkanie rozstrzyga tylko to, co zostało. Po spotkaniu każda historyjka ma zapisany wynik.

## Stan dziś

- Pytania istnieją, ale **wszystkie pochodzą z reguł, AI albo driftu** (`Finding.origin: 'rule' | 'ai' | 'drift'`,
  `Finding.question`, `packages/core/src/model.ts`). Człowiek może na pytanie odpowiedzieć, nie może go zadać.
- Odpowiedź zamyka ustalenie, trafia do logu decyzji i staje się źródłem claims; „accept risk” ma termin przeglądu.
- Odpowiedź znaleziona w źródle jest proponowana z dosłownym cytatem (A2a, `docs/AUTO-CLOSE-A2A-PLAN.md`).
- Gotowość historyjki: `ready` / `needs_attention` / `not_ready` z listą braków.
- Recenzent AI cytuje źródła, dane osobowe są redagowane przed wysyłką, audyt zapisuje, co poszło do modelu.
- Jira jest tylko czytana; plan bramki Forge (`docs/JIRA-GATE-PLAN.md`) sam wymienia „wyniku nie widać w Jirze”.
- Slack i Teams są w `docs/ROADMAP.md` jako źródło wiedzy w fazie 2–3; integracji nie ma.

## Co z koncepcji tu wchodzi, a co nie

| Faza koncepcji | Tutaj | Gdzie indziej |
|---|---|---|
| Understand (analiza historyjki, luki) | już jest | — |
| Collect (pytania zespołu przed spotkaniem) | **kroki R1–R4** | — |
| Refine (spotkanie) | **R5**: zestaw historyjek ułożony pod rozmowę | prowadzenie spotkania (timeboxing, parking lot, lista na żywo): DI Team |
| Commit (wynik, zapis zwrotny) | **R6**, potem R7 | rejestr decyzji bramek: pdi, jak dziś |

Poza zakresem tej aplikacji: planowanie i prowadzenie spotkań, transkrypcja i nagrywanie, Miro, głosowanie zespołu.
Głosowanie zostaje w sprintdecku: od decyzji D-E1 (pdi, 2026-10-25) jego rola to konsensus co do zrozumienia i ryzyka,
a klasyczna estymacja pracy jest tam trybem do wyboru.

## Zasady (z koncepcji, zgodne z dzisiejszymi)

- Sugestia AI jest zawsze oznaczona i nigdy nie jest faktem; decyzję, gotowość, właściciela i zapis zatwierdza człowiek.
- Oryginał pytania zostaje na zawsze; połączenie pytań da się obejrzeć, rozdzielić i cofnąć.
- AI nie wymyśla właścicieli ani terminów: brak wartości to „TBD”.
- Miary tylko na poziomie zespołu i procesu, bez ocen osób.
- Zgłoszenie pytania ma kosztować kilka sekund; pełny ekran jest dla PO i prowadzącego.

## Kroki

Każdy krok osobnym PR, z testami przed kodem, jak dotychczas.

### Pierwsza część — sprawdza hipotezę „ludzie zgłaszają pytania przed spotkaniem”

- [ ] **R1 — pytanie od człowieka przy elemencie.** Pole „dodaj pytanie albo myśl” na stronie historyjki (tekst,
  link, zrzut ekranu). Model: ustalenie z `origin: 'human'`, autorem z konta (`docs/ACCOUNTS-PLAN.md`), oryginalnym
  tekstem i pytaniem; zamykane tak samo jak pozostałe (decyzja, akceptacja ryzyka, nie dotyczy). Do rozstrzygnięcia
  w planie kroku: czy pytanie człowieka wpływa na gotowość (propozycja: dopiero po przyjęciu przez PO), jaki ma
  wymiar i wagę, kto widzi autora.
- [ ] **R2 — przeredagowanie przez AI.** Z surowej myśli jasne pytanie refinementowe; autor przyjmuje, poprawia albo
  odrzuca. Idzie przez istniejącą warstwę AI (redakcja, limit znaków, audyt źródeł); działa też bez AI — wtedy pytanie
  zostaje w brzmieniu autora. Ewaluacja: zachowanie sensu, brak dopisanych założeń (zestaw z `docs/AI-QUALITY-PLAN.md`).
- [ ] **R3 — łączenie podobnych pytań.** Grupa pytań ludzi oraz pytań silnika o to samo, z uzasadnieniem, listą
  oryginałów i autorów, rozdzieleniem i cofnięciem. Pytanie, na które odpowiada już źródło albo wcześniejsza decyzja,
  dostaje propozycję z cytatem tym samym mechanizmem co A2a. Ewaluacja: trafność połączeń, fałszywe połączenia.
- [ ] **R4 — stany i ważność.** Dochodzi „odłożone” z terminem powrotu (obok decyzji, akceptacji ryzyka i „nie
  dotyczy”) oraz „to też moje pytanie” jako licznik osób, nie ranking.

### Druga część — po potwierdzeniu hipotezy

- [ ] **R5 — widok refinementu.** Zapisany zestaw historyjek (np. z filtra Jiry albo sprintu) ułożony według tego, co
  wymaga rozmowy: otwarte pytania ludzi i silnika, ustalenia blokujące, liczba osób przy pytaniu. PO może zmienić
  kolejność. Ten sam zestaw przez API jako źródło agendy dla DI Team; tu bez licznika czasu i bez trybu spotkania.
- [ ] **R6 — wynik per historyjka.** Po rozstrzygnięciu pytań: decyzje (już zapisywane), szkic zaktualizowanych
  kryteriów akceptacji złożony z tych decyzji i sprawdzony regułami AC, lista spraw nierozstrzygniętych z właścicielem
  albo „TBD”, przeliczona gotowość. Wynik zatwierdza PO; do tego „kopiuj jako komentarz” (Markdown).

### Później — każde wymaga osobnej decyzji właściciela

- [ ] **R7 — zapis zwrotny do Jiry.** Zatwierdzony wynik jako komentarz, w drugim kroku propozycja zmiany kryteriów.
  To nowa klasa uprawnień (dziś tylko odczyt), więc razem z bramką Forge albo po niej; każdy zapis w audycie.
- [ ] **R8 — Slack albo Teams, jedna platforma.** Akcja „dodaj pytanie” z rozmowy, która trafia na właściwą
  historyjkę, oraz zbiorcze przypomnienie przed refinementem z limitem częstotliwości. Ta sama integracja co źródło
  wiedzy z `docs/ROADMAP.md` (faza 2–3).
- [ ] **R9 — miary zespołu.** Odsetek historyjek z wkładem ludzi przed spotkaniem, odsetek grup pytań przyjętych bez
  poprawek (wzorem `/api/decisions/acceptance`), odsetek pytań rozstrzygniętych przed spotkaniem.

## Jak sprawdzić, czy warto iść dalej

Po R1–R4, na 2–3 cyklach refinementu jednego albo dwóch zespołów (naturalnie: zespoły zamkniętej bety,
`docs/BETA-PLAN.md`). Progi z koncepcji są propozycją do skorygowania po pomiarze stanu wyjściowego:

- co najmniej 60% historyjek ma wkład człowieka przed spotkaniem;
- co najmniej 80% grup pytań przyjętych bez istotnej poprawki;
- prowadzący i PO oceniają, że spotkanie zaczyna się od listy spraw do rozstrzygnięcia, a nie od czytania historyjek.

Stop albo zmiana kierunku, gdy zgłaszanie pytań jest odbierane jako dodatkowa praca i nikt go nie używa, albo gdy
sugestie AI wymagają więcej sprzątania, niż oszczędzają.

## Decyzje właściciela przed startem

1. Czy pytanie człowieka od razu obniża gotowość, czy dopiero po przyjęciu przez PO (R1).
2. Kto widzi autora pytania: cały zespół, tylko PO i prowadzący, czy nikt (R1, R3).
3. Zapis zwrotny do Jiry: czy w ogóle, i czy przed bramką Forge, czy razem z nią (R7).
4. Slack czy Teams jako pierwsza platforma (R8) — zależy od zespołów pilotażu.
5. Gdzie mieszka prowadzenie spotkania, dopóki DI Team nie istnieje: nigdzie (zostaje dzisiejszy sposób zespołu) czy
   prosty tryb w R5. Rekomendacja: nigdzie, żeby nie budować tego dwa razy.
6. Czy sprzedawać to jako osobny pakiet (np. „DI Refinement”) na silniku tej aplikacji. Nie blokuje R1–R6.
