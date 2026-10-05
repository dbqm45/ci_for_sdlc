---
name: eng-codebase-mapping
description: Użyj przy nieznanym kodzie i ocenie wpływu zmiany — punkty wejścia, warstwy z importów, węzły centralne, cykle.
metadata:
  katalog: "Użyj, gdy trzeba zrozumieć nieznany kod lub ocenić wpływ zmiany — punkty wejścia, warstwy z grafu importów, węzły centralne i cykle, trasa czytania dla nowej osoby, wpływ diffu (1 krok w górę i w dół, warstwy, ryzyko), pewność krawędzi. Nie do oceny długu (eng-tech-debt-audit) ani projektowania granic (ddd-strategic-analysis)."
---

# Mapa kodu

Najpierw mapa, potem czytanie. Agent, który zaczyna od losowych plików, zużywa kontekst i myli peryferie z rdzeniem.
Mapę budujesz z narzędzi deterministycznych, a model językowy tylko nazywa i opisuje to, co narzędzia pokazały.

## Procedura
1. **Inwentarz:** liczba plików i linii per katalog/projekt, języki, frameworki. README i manifesty traktujesz jako
   wskazówki, nie prawdę — kod jest źródłem. Przy dużym repo (> ~100 plików w zakresie) uzgodnij zakres z człowiekiem.
2. **Graf zależności z narzędzi**, nie z czytania:
   - Nx: `nx graph --file=graph.json` (projekty i zależności), granice modułów z tagów (tool-nx);
   - TS/JS: `madge --json` / `madge --circular`; Java: `jdeps`, ArchUnit, moduły Maven/Gradle.
3. **Punkty wejścia** — punktacja kandydatów:
   konwencjonalna nazwa (`main.ts`, `app.config.ts`, `*.routes.ts`, `Application.java`) +3 · w korzeniu lub poziom niżej +1 ·
   górne 10% liczby importów wychodzących +1 · dolne 25% importów przychodzących +1. Do tego trasy (routing), endpointy
   (kontrolery), handlery kolejek, zadania cykliczne.
4. **Warstwy (3–10):** grupa plików gęsto importujących się nawzajem (gęstość importów wewnątrz > ~0,3) to spójna
   warstwa; grupa często importowana, a sama mało importująca, jest fundamentem; zależności powinny płynąć
   UI/API → usługi → dane/narzędzia. Strzałka pod prąd to ustalenie.
5. **Węzły centralne i cykle:** pliki/klasy o największej liczbie połączeń (po odfiltrowaniu barreli `index.ts`,
   typów i stałych) — tu zmiana ma największy zasięg; cykle importów wypisz zawsze.
6. **Trasa czytania (5–15 kroków):** od najlepszego punktu wejścia w głąb po grafie (najpierw szerzej, potem w dół);
   ściśle powiązane 2–5 plików to jeden krok. Każdy krok: co tu jest i dlaczego czytać to teraz.
7. **Zapis:** `docs/project/04-architecture/codebase-map.md` z datą i commitem, z którego powstała mapa.

## Pewność krawędzi
Każde połączenie na mapie ma etykietę: **WYCIĄGNIĘTE** (z narzędzia/AST), **WYWNIOSKOWANE** (z nazw, konwencji,
konfiguracji DI) albo **NIEPEWNE**. Połączeń nie zmyślasz; niepewne pokazujesz, a nie pomijasz.

## Wpływ zmiany (diff)
1. Zmienione pliki: `git diff --name-only <baza>...HEAD`.
2. **Świeżość mapy w monorepo:** `git diff --name-only <commit-mapy> HEAD -- <ścieżka-projektu>` — zmiany w innych
   projektach nie unieważniają mapy tego projektu. W Nx szybciej: `nx show projects --affected`.
3. Dla każdego pliku: zależności 1 krok w górę (kto go używa) i 1 krok w dół (czego używa), warstwy, które dotyka.
4. Ryzyko: złożoność pliku, liczba krawędzi między warstwami, zasięg (ile projektów/modułów) → niskie/średnie/wysokie.
5. Wynik do opisu PR: lista dotkniętych modułów, ryzyko, co przetestować (qa-regression).

## Przykład
**Sytuacja:** „Gdzie zacząć czytać repo `shop` (Nx, Angular + NestJS)?”
**Wynik:** `nx graph` + `madge`; punkty wejścia `apps/api/src/main.ts` i `app.config.ts` (po 6 pkt), `app.routes.ts`
(4 pkt); warstwy kontroler → `order.service.ts` → repozytorium → `libs/db`; ustalenie: `libs/db/src/audit.ts`
importuje usługę (pod prąd, cykl — WYCIĄGNIĘTE); węzeł centralny `order.service.ts` (23 połączenia); krawędź przez
token DI — WYWNIOSKOWANE. Trasa 7 kroków, mapa z datą i commitem.
Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] graf z narzędzi, nie z domysłów; zakres uzgodniony przy dużym repo
- [ ] punkty wejścia z punktacją, warstwy z kierunkiem zależności, cykle wypisane
- [ ] krawędzie z etykietą pewności
- [ ] trasa czytania 5–15 kroków; mapa z datą i commitem

## Źródła inspiracji
[Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) (punktacja punktów wejścia, heurystyki warstw,
trasa czytania, wpływ diffu ze świeżością per ścieżka w monorepo) i [graphify](https://github.com/Graphify-Labs/graphify)
(węzły centralne, cykle, etykiety pewności krawędzi, „najpierw graf, potem grep”) — opisane własnymi słowami; zamiast
ich narzędzi fabryka używa `nx graph`, madge i jdeps.
