# Cykl życia AI-native — pętla z artefaktami i bramkami

> **Spis treści:** 1. Co się zmienia · 2. Łańcuch artefaktów w fabryce · 3. Sześć etapów — co robi agent, co człowiek, co mierzyć · 4. Praktyki etapu Build i Test · 5. Ciągłe ewaluacje konfiguracji agenta · 6. Etap Deploy — agent do bramki produkcyjnej i ani kroku… · 7. Etap Maintain — pasma kontrolne zamiast ciągłego… · 8. Źródło prawdy przy istniejących narzędziach · 9. Ustawienia zarządzane w organizacjach regulowanych · 10. Kolejność wdrażania w zespole · 11. AI-DLC (AWS) — słownik i rytuały · 12. Antywzorce

Na podstawie „The AI-Native SDLC Playbook” (Anthropic, 21.08.2026) i kursu Anthropic Academy o tym samym tytule
oraz „AI-Driven Development Life Cycle” (AWS, 31.07.2025). Opisane własnymi słowami i odwzorowane na mechanizmy
fabryki.

## 1. Co się zmienia
- **Wąskie gardło się przesuwa.** Gdy agenci piszą kod w godziny, najwolniejsze stają się etapy obok budowania:
  planowanie, przegląd i testy, wdrożenie, utrzymanie. Usprawniasz je, a nie samo pisanie kodu.
- **Kontrole budowane pod ludzi przestają pasować.** Ręczny przegląd każdej linii nie nadąża za diffem pisanym przez
  agentów. Cele kontroli zostają, zmienia się sposób ich egzekwowania: warstwy przeglądu przez agentów, hooki
  i reguły działające w chwili, gdy agent działa, a człowiek przy kodzie krytycznym i regulowanym.
- **Z linii robi się pętla.** Każdy etap kończy się **artefaktem zapisanym w repozytorium**, a następny zaczyna od
  jego przeczytania. Ciąg commitów jest jednocześnie śladem audytowym: kto o co prosił, co agent wytworzył, kto
  zatwierdził.
- **Człowiek zostaje nad pętlą.** Odpowiada za każdą decyzję wymagającą osądu; jego uwaga przenosi się na bramki
  i na to, co agent oznaczył, zamiast zaczynać każdy etap od zera.

## 2. Łańcuch artefaktów w fabryce
| Etap (playbook) | Artefakt w playbooku | Odpowiednik w fabryce | Kto zatwierdza |
|---|---|---|---|
| Plan — zamiar | `intent.md`: co, po co, ograniczenia, kryteria sukcesu | `01-discovery/brief.md` (projekt) albo krótki brief zmiany; plan projektu `project-plan.md` | właściciel produktu (B1) |
| Design — wymagania i projekt razem | `spec.md` z zasadami organizacji jako skille; zastrzeżenia oznaczone dla właścicieli polityk | `03-requirements/requirements.md` + `04-architecture/` (ADR, model zagrożeń, `privacy.md`) | właściciel produktu, właściciele polityk (B2, B3) |
| Build — plan przed kodem | `plan.md`: pliki, kolejność, testy — przed kodem | `05-plan/plan.md` (cięcia) + sekcja **Plan kroku** w `06-delivery/NNN-*.md`, zatwierdzona przed kodem | inżynier / człowiek |
| Test — pętla weryfikacji | diff z testami, dowód w transkrypcie | TDD (`tdd_guard`), polecenia weryfikacji w rolach, raport kroku z wynikiem poleceń | automatycznie + przegląd |
| Deploy — przegląd i bramka | PR z ustaleniami przeglądu | PR, `/code-review`, security-reviewer, `07-review/` | człowiek (B4, B5) |
| Maintain — domknięcie pętli | zapis incydentu → nowy `intent.md` | `08-operations/` → nowy brief zmiany wraca do etapu Plan | właściciel usługi (B6) |

Zasada z playbooka: **nic nie jest implementowane bez zaakceptowanego planu.** Gdy realizacja odchodzi od planu,
plan aktualizujesz w tym samym commicie co kod.

## 3. Sześć etapów — co robi agent, co człowiek, co mierzyć
| Etap | Agent | Człowiek | Mechanizm fabryki | Miara wyprzedzająca | Miara opóźniona |
|---|---|---|---|---|---|
| Plan | dopytuje (zakres, użytkownicy, ograniczenia, kryteria sukcesu) i zapisuje zamiar | zatwierdza zamiar | core-plan-interview, core-problem-routing, proc-project-planning | czas od pierwszej rozmowy do zatwierdzonego briefu | odsetek briefów, które przeszły dalej bez przeróbki |
| Design | pisze wymagania i projekt z zasadami organizacji (skille), oznacza zastrzeżenia | rozstrzyga zastrzeżenia z właścicielami polityk | ddd-*, arch-*, arch-privacy-compliance, qa-spec-first-testing | czas od briefu do zatwierdzonych wymagań | zmiany wymagań po rozpoczęciu realizacji |
| Build | w trybie planowania czyta kod bez zmian, proponuje plan; po akceptacji realizuje; równoległe sesje w osobnych worktree | zatwierdza plan, steruje | `CLAUDE.md`, skille, hooki, wykonawcy (subagenci) | odsetek zmian scalonych po pierwszym podejściu; czas od planu do scalenia | liczba poprawek na zmianę; zgodność diffu z planem |
| Test | sam sprawdza swoją pracę (testy, build, zrzuty ekranu) i iteruje, aż przejdzie | ocenia zachowanie | `tdd_guard`, jedno polecenie weryfikacji, ewaluacje | odsetek zmian agenta zielonych w CI za pierwszym razem | czas przeglądu PR; wskaźnik nieudanych zmian |
| Deploy | przegląda PR wg `REVIEW.md`, poprawia uwagi na swoich PR; w CI zadania wymagające oceny (triaż porażki buildu, szkic changelogu) | zatwierdza scalenie i wdrożenie | core-git-workflow, ops-ci-cd, ops-release-engineering, ochrona gałęzi | czas do pierwszego przeglądu; uwagi rozwiązane bez ręcznej zmiany kodu | defekty i podatności, które przeszły na produkcję |
| Maintain | diagnozuje naruszenie pasma kontrolnego, pisze brief zmiany z dowodami | triaż i zatwierdzenie | `scripts/control_band.py`, ops-sre-incidents, proc-issue-triage | czas od naruszenia do briefu w kolejce | powtórzenia incydentów tej samej klasy |

Miary DORA (częstotliwość wdrożeń, czas realizacji zmiany, wskaźnik nieudanych zmian, czas przywrócenia): eng-continuous-delivery.

## 4. Praktyki etapu Build i Test
- **Tryb planowania jako start.** Agent czyta kod i proponuje plan bez zmian w plikach; plan ma być na tyle jasny,
  żeby wykonał go ktoś, kto nie zna kodu.
- **`CLAUDE.md` jako wiedza instytucjonalna.** Polecenia, konwencje, architektura, częste błędy. `/init` daje wersję
  startową, zespół ją utrzymuje jak kod. **Gdy agent popełni ten sam błąd drugi raz, poprawka trafia do `CLAUDE.md`**
  (za zgodą człowieka; lekcje projektu: core-project-record).
- **Skille i hooki.** Skille niosą zasady (bezpieczeństwo, konwencje API, marka) i działają w trakcie pisania. Hooki
  to warstwa deterministyczna: blokada chronionych ścieżek, formatowanie i lint po edycji, sekrety poza diffem.
- **Pętla weryfikacji.** Agent ma jedno polecenie sprawdzające (np. `make test`), iteruje, aż przejdzie, a dowód
  (dosłowny wynik testów, log buildu, różnica zrzutów) jest w transkrypcie przed przeglądem.
- **Poprawka błędu.** Najpierw czerwony test odtwarzający błąd, potem poprawka **bez zmieniania tego testu**. W fabryce
  pilnuje tego `tdd_guard`: reguły A–B (kod po czerwonym teście) i C (ostrzeżenie lub blokada przy osłabieniu testu:
  mniej asercji, usunięty test, dopisane pominięcie; `CLAUDE_TDD_WEAKEN=warn|ask|deny|off`).
- **Równoległe sesje i subagenci.** Niezależne zadania w osobnych worktree gita; powtarzalne zadania jako subagenci
  z własnym kontekstem (w fabryce wykonawcy person).

## 5. Ciągłe ewaluacje konfiguracji agenta
Zmiana modelu, `CLAUDE.md`, skilla albo hooka może pogorszyć pracę agenta tak samo jak zmiana kodu pogarsza aplikację.
- Zbierz **20–50 prawdziwych zadań** z oczekiwanym wynikiem i zapisz każde jako scenariusz: polecenie + sprawdzenia
  dopuszczalnego zachowania.
- Uruchamiaj zestaw bez interakcji według harmonogramu i przy każdej zmianie `CLAUDE.md`, skilli i hooków.
- **Każdy incydent produkcyjny staje się stałym scenariuszem** (obok testu regresyjnego w kodzie).
- Scenariusze, które przestały rozróżniać dobre i złe odpowiedzi (bo modele się poprawiły), wymieniasz.
- W fabryce: skille mają scenariusze w `tests/skill_evals/` (bramka `skill_gate.py`, płatny przebieg tylko za zgodą
  człowieka); workflow `team-factory` uruchamia testy bez modelu przy zmianach w `.claude/` i `factory/`.

## 6. Etap Deploy — agent do bramki produkcyjnej i ani kroku dalej
- **Przegląd PR przez AI** (core-git-workflow): zasady przeglądu w `REVIEW.md` w katalogu głównym repozytorium,
  przebiegi „błędy i logika”, „bezpieczeństwo”, „zgodność ze specyfikacją i planem”, waga każdego ustalenia,
  comiesięczne strojenie (ocena trafności, limit drobiazgów, wykluczenie kodu generowanego i tego, co sprawdza CI).
- **Rozdział obowiązków:** agent nie zatwierdza własnego kodu; scalenie do gałęzi głównej wymaga zatwierdzenia
  człowieka (ochrona gałęzi). Decyzje zostają w historii PR jako ślad audytowy.
- **Hooki jako bramki zatwierdzenia:** hook może zapytać człowieka i wstrzymać akcję (np. wdrożenie produkcyjne
  wymaga imiennego zatwierdzenia).
- **Agent w CI:** uruchamiany bez interakcji do zadań wymagających oceny, w piaskownicy, z poświadczeniami
  o najmniejszym zakresie (core-agent-security, ops-ci-cd).

## 7. Etap Maintain — pasma kontrolne zamiast ciągłego patrzenia
- **Wykrywanie deterministyczne:** skrypt liczy średnią i odchylenie standardowe metryki (np. odsetek porażek testów,
  odsetek 5xx, czas cyklu PR) i stosuje reguły Western Electric — `scripts/control_band.py`.
- **Poziomy reakcji w konfiguracji pod kontrolą wersji** (propozycja playbooka):

  | Poziom | Warunek (domyślnie w skrypcie) | Reakcja |
  |---|---|---|
  | log | 4 z 5 punktów poza 1σ albo 8 po jednej stronie średniej | tylko zapis |
  | diagnose | 2 z 3 punktów poza 2σ | agent diagnozuje **tylko do odczytu** |
  | act | punkt poza 3σ | agent może działać: otworzyć PR albo uruchomić wcześniej zatwierdzony runbook |

- Agent zapisuje **brief zmiany** z dowodami anomalii, proponowanym wynikiem, systemami, których dotyczy, i pytaniami.
  Brief przechodzi normalną pętlę od etapu Plan, a zmiana — normalny przegląd PR.
- Okresowe skany bezpieczeństwa: ustalenie wąskie → poprawka i PR; szerokie → brief zmiany. Każda wydana poprawka
  dodaje scenariusz ewaluacji.
- Uprawnienia i ustawienia zarządzane blokują agentowi nieautoryzowany dostęp do produkcji; wywołania, ustalenia
  i triaż mają znacznik czasu.

## 8. Źródło prawdy przy istniejących narzędziach
Gdy firma ma Jirę, ServiceNow albo narzędzie do wymagań, nazwij jedno źródło prawdy:
- **repozytorium** — artefakty markdown są wiążące, narzędzie zewnętrzne odwołuje się do commitów;
- **narzędzie zewnętrzne** — markdown to kopia robocza, a konektor (MCP) zapisuje ustalenia z powrotem;
- **minimum: powiązanie** — oba miejsca trzymają odnośniki do siebie (np. klucz zgłoszenia w nagłówku artefaktu).
Szczegóły dla dziennika projektu: core-project-record.

## 9. Ustawienia zarządzane w organizacjach regulowanych
Zespół platformowy wdraża nienegocjowalne kontrole przez ustawienia zarządzane Claude Code (`managed-settings.json`
przez plik, MDM albo konsolę; mają pierwszeństwo przed ustawieniami użytkownika i projektu, poza nielicznymi
wyjątkami bezpieczeństwa). Kategorie z playbooka:
- odmowy uprawnień (sekrety, dowolny ruch wychodzący);
- wymuszona piaskownica (izolacja systemu plików i sieci);
- zatwierdzenia tylko przez hooki dla chronionych akcji;
- zarządzane serwery MCP i lista dozwolonych wtyczek, skilli i agentów;
- minimalne wersje (odmowa startu na niezatwierdzonym modelu).
Nazwy kluczy sprawdzasz w dokumentacji (code.claude.com/docs/en/managed-settings) dla swojej wersji Claude Code —
nie zgadujesz ich (core-grounding). Fabryka instaluje się tylko lokalnie w projekcie i nie zmienia tych ustawień.

## 10. Kolejność wdrażania w zespole
Playbook dzieli zmianę na 12 modułowych „zagrań” w pięciu poziomach zależności. Zaczyna się od ręcznego
uruchamiania każdego etapu, a kończy pętlą, w której zaakceptowany artefakt uruchamia następną bramkę.

| Poziom | Zagranie | Stan w fabryce |
|---|---|---|
| 1 (bez zależności) | zapis zamiaru, `CLAUDE.md`, skille, pętla weryfikacji, hooki, tryb planowania | jest: brief, `CLAUDE.md`, 99 skilli, `tdd_guard` i hooki bezpieczeństwa, core-plan-interview |
| 2 | subagenci (wymaga `CLAUDE.md`), ewaluacje (wymaga `CLAUDE.md` i pętli weryfikacji) | jest: wykonawcy person; ewaluacje skilli; brak zestawu zadań projektu |
| 3 | wymagania i projekt (zamiar + skille), przegląd PR (ewaluacje + subagenci) | jest: fazy 2–4; przegląd PR — `REVIEW.md` do założenia w projekcie |
| 4 | CI/CD (przegląd PR + hooki) | częściowo: workflow `team-factory`, ops-ci-cd |
| 5 | domknięcie pętli (CI/CD + zamiar) | faza 9, `control_band.py`; automatyczne uruchamianie agenta — decyzja człowieka |

## 11. AI-DLC (AWS) — słownik i rytuały
- **Wzorzec:** agent tworzy plan → zadaje pytania → człowiek waliduje → dopiero wtedy agent realizuje; to samo przy
  każdej czynności cyklu. W fabryce: core-plan-interview i bramki.
- **Fazy:** Inception (zamiar → wymagania), Construction (architektura, model domeny, kod, testy), Operations
  (infrastruktura jako kod, wdrożenia pod nadzorem zespołu). Kontekst przechodzi z fazy do fazy przez artefakty
  w repozytorium.
- **Mob Elaboration / Mob Construction:** cały zespół w jednej sesji waliduje pytania i propozycje agenta —
  wymagania (Elaboration) albo decyzje techniczne (Construction). Dobre przy nowym produkcie i decyzjach
  trudnych do odwrócenia; w fabryce: warsztat z facylitacją (ddd-facilitation) i przegląd planu przez kilka osób.
- **Bolt** (cykl godzin lub dni zamiast sprintu) i **Unit of Work** (zamiast epiki) — przy pracy z agentami
  krótsze cykle i mniejsze partie (eng-continuous-delivery).

## 12. Antywzorce
- Etapy bez zapisanego artefaktu — informacja ginie między etapami.
- Słaba pętla weryfikacji — niesprawdzony kod trafia do przeglądu człowieka.
- Ewaluacje, które się zestarzały i nie rozróżniają już dobrych odpowiedzi.
- Bramki zatwierdzenia bez śladu audytowego.
- Sekrety w kontekście agenta (core-agent-security).
- Nienastrojony przegląd przez AI, który zasypuje zespół drobiazgami.

## Źródła
- Anthropic, L. Claxton, „The AI-Native SDLC Playbook”, 21.08.2026 — claude.com/blog/the-ai-native-sdlc-playbook
- Anthropic Academy, kurs „AI-Native SDLC Playbook” (14 lekcji) — academy.claude.com/courses/ai-native-sdlc-playbook
- AWS, Raja SP, „AI-Driven Development Life Cycle: Reimagining Software Engineering”, 31.07.2025 —
  aws.amazon.com/blogs/devops/ai-driven-development-life-cycle
- Claude Code: managed settings, Code Review (`REVIEW.md`), GitHub Actions, hooks — code.claude.com/docs (dostęp 2026-10-04)
