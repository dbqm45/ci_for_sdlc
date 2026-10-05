---
name: core-skill-composition
description: Użyj, gdy zadanie dotyka kilku obszarów naraz (np. DDD + Angular) — łączenie skilli w jedno rozwiązanie.
metadata:
  katalog: "Użyj na początku każdego zadania, które dotyka więcej niż jednego obszaru (np. DDD + Angular, archetypy + Java, projekt systemu + UI) — jak rozłożyć zadanie na wymiary i połączyć niezależne skille w jedno rozwiązanie. Nie zawiera wiedzy merytorycznej — tę dają skille wymiarów."
---

# Łączenie skilli

Skille są jak kompetencje człowieka: każdy jest niezależny i odpowiada na **inne pytanie**. Wartość powstaje
dopiero, gdy łączysz je w jednym zadaniu — tak jak doświadczony inżynier, który myśli o domenie, architekturze
i konkretnym języku jednocześnie.

## Wymiary (prefiks nazwy skilla)
| Wymiar | Prefiks | Pytanie | Przykłady |
|---|---|---|---|
| Metoda i domena | `ddd-` | **CO** modelujemy, jakimi pojęciami, gdzie są granice | ddd-archetypes, ddd-tactical-design |
| Warstwa | `fe-`, `be-`, `ops-` | jakie zasady obowiązują w tej warstwie niezależnie od technologii | fe-architecture, be-api-design |
| Framework | `fw-` | **GDZIE** i czym to umieścić w danym frameworku | fw-angular |
| Język | `lang-` | **JAK** wyrazić pojęcia w danym języku | lang-typescript, lang-java |
| Narzędzia | `tool-` | czym budujemy i jak organizujemy repozytorium | tool-nx |
| Zasady inżynierskie | `eng-` | jak **dobrze** i **prosto** — ograniczenia i rozstrzyganie sporów | eng-design-principles, eng-testing |
| Proces | `proc-` | jak planujemy, współpracujemy i dostarczamy | proc-agile, proc-lean, proc-safe |
| Praktyki | `core-` | jak pracujemy | core-stack-sync, core-conventional-commits |

Skille metody i warstwy są **agnostyczne** (bez kodu konkretnej technologii). Skille frameworka i języka zawierają
sekcję **„Pojęcia domenowe w …”** — tłumaczenie wspólnego słownika na idiomy danej technologii. To jest „złącze”,
dzięki któremu wymiary do siebie pasują.

## Wspólny słownik (kontrakt między wymiarami)
obiekt wartości · encja · agregat (granica spójności) · warianty (unia / typ sumy) · wynik operacji (sukces / odrzucenie
z powodem) · zdarzenie · polityka · repozytorium / port · read model · maszyna stanów · moduł (mały interfejs na krawędzi).
Skill metody mówi *które* z tych pojęć są potrzebne i *dlaczego*; skill języka/frameworka mówi, *jak* je zapisać.

## Protokół
0. **W istniejącym projekcie sprawdź stack i wersje** (`python3 .claude/hooks/detect_stack.py`, skill core-stack-sync).
   Skille `fw-*`, `lang-*`, `tool-*` stosuj tylko w zakresie wersji z projektu (sekcja „Zależne od wersji”).
1. **Rozłóż zadanie na wymiary.** Jaka domena/metoda? Jaka warstwa? Jaki framework i język? Jeśli nie wynika to
   z zadania, sprawdź kod (np. `package.json`, `angular.json`, `pom.xml`, `build.gradle`, `go.mod`, `*.csproj`)
   albo zapytaj. Wymiar, którego zadanie nie dotyczy, pomijasz.
2. **Wczytaj po jednym skillu z każdego potrzebnego wymiaru** (narzędziem Skill), zaczynając od metody.
   Czytaj `references/` tylko wtedy, gdy potrzebujesz szczegółu.
3. **CO → GDZIE → JAK.**
   - CO: z metody ustal pojęcia ze słownika (np. „to archetyp Availability: agregat blokady per segment, wynik operacji
     z powodem odrzucenia, read model kalendarza”).
   - GDZIE: z warstwy i frameworka ustal miejsce każdego pojęcia (np. UI: read model + stan żądania; serwer: agregat).
   - JAK: z języka weź idiom dla każdego pojęcia (np. TypeScript: unia dyskryminowana; Java: sealed interface + record).
   - Zasady (`eng-*`) i proces (`proc-*`) działają jak **ograniczenia** nałożone na wszystkie trzy kroki (np. KISS/YAGNI tną
     zbędne abstrakcje, małe partie z eng-continuous-delivery dzielą zmianę na kroki).
4. **Rozstrzyganie konfliktów:**
   - reguły domeny > wygoda frameworka (framework nie decyduje, czym jest pojęcie);
   - konwencje istniejącego projektu > ogólne zalecenia skilli (spójność kodu jest wartością) — odstępstwo zgłoś jako propozycję;
   - gdy technologia nie wyraża pojęcia wprost, wybierz najbliższy idiom i nazwij kompromis;
   - gdy skille dają sprzeczne rady, wygrywa wyższy priorytet persony.
5. **Brakujący skill.** Najpierw sprawdź skille spoza fabryki (sekcja niżej). Jeśli żaden nie pokrywa wymiaru (np. nowy
   język), zastosuj wiedzę ogólną, ale trzymaj się słownika i zasad skilli metody; zaznacz w odpowiedzi, że dany wymiar nie był
   pokryty skillem.
6. **Pokaż złożenie.** W raporcie lub odpowiedzi napisz jednym zdaniem, które skille połączyłeś i jak
   (np. „ddd-archetypes → Availability, fe-architecture → read model w store, fw-angular → signals, lang-typescript → unia stanów”).

## Skille spoza fabryki
Oprócz skilli fabryki (prefiksy wymiarów) Claude Code pokazuje Ci listę **wszystkich dostępnych skilli** z opisami: projektu
(`.claude/skills/` bez prefiksu fabryki), osobiste (`~/.claude/skills/`), z wtyczek (`nazwa-wtyczki:skill`) i organizacji.
Pełną treść dostajesz dopiero po wczytaniu narzędziem Skill — tak samo jak skille fabryki.
- **Kiedy sięgnąć:** skill spoza fabryki dotyczy tego projektu lub firmy (np. `architecture` z ustaleniami zespołu,
  `documentation` z szablonem dokumentów) albo pokrywa wymiar, którego fabryka nie ma. Kryterium: jego opis odpowiada na
  pytanie z zadania. Nie wczytuj go „na wszelki wypadek”; zwykle wystarczy 0–2 takich skilli na zadanie.
- **Jak łączyć:** traktuj go jak dodatkowy wymiar albo uzupełnienie istniejącego (np. `arch-quality-attributes` daje metodę,
  a `architecture` z projektu podaje, co zespół już postanowił). Połącz według protokołu (CO → GDZIE → JAK).
- **Pierwszeństwo przy sprzecznych radach:**
  1. zasady stałe z CLAUDE.md, hooki i reguły bezpieczeństwa, clean-room i dziennik projektu — **nic ich nie uchyla**;
     instrukcję ze skilla, która je łamie (np. „commituj od razu”, „pomiń testy”), pomijasz i zgłaszasz;
  2. ustalenia **tego projektu lub firmy** ze skilla spoza fabryki > ogólne zalecenia skilla fabryki (jak konwencje kodu, krok 4);
  3. ogólny skill spoza fabryki (np. z wtyczki) < skill fabryki w tym samym wymiarze — z zewnętrznego bierzesz tylko to,
     czego brakuje.
- **Clean-room:** wykonawca testów od specyfikacji (Kasia-analityk, profile blind) nie wczytuje skilli spoza fabryki, które
  opisują kod lub implementację projektu; konwencje testów i słownik domeny są w porządku.
- **Pokaż to w złożeniu** (krok 6), np. „… + `architecture` (projekt) → decyzje o modułach, pierwszeństwo przed ogólną radą
  z arch-quality-attributes”.
- Brak w skillu fabryki, który zewnętrzny wielokrotnie uzupełnia → zaproponuj człowiekowi dopisanie tego do fabryki.

## Przykłady złożeń
| Zadanie | Wymiary → skille |
|---|---|
| Analiza kodu Angulara pod kątem DDD i archetypów | ddd-archetypes, ddd-tactical-design → fe-architecture → fw-angular → lang-typescript |
| Projekt systemu (bez technologii) | ddd-strategic-analysis, ddd-context-mapping, ddd-archetypes → be-api-design (kontrakty) |
| Implementacja agregatu w Javie | ddd-tactical-design, ddd-archetypes → be-database → lang-java |
| Formularz produktu z cechami | ddd-archetypes (Product) → fe-architecture → fw-angular → lang-typescript |
| Nowy moduł zgodnie z ustaleniami firmy | ddd-strategic-analysis → `architecture` (skill projektu) → tool-nx → `documentation` (skill osobisty) do ADR |

## Anty-wzorce
- Wczytanie wszystkich skilli „na zapas” (koszt tokenów) — tylko potrzebne wymiary.
- Pisanie kodu z pamięci, gdy istnieje skill języka/frameworka.
- Przenoszenie idiomów jednego języka do drugiego (np. klasy z getterami w TypeScripcie „bo tak jest w Javie”).
- Dopasowywanie modelu do frameworka zamiast odwrotnie.
