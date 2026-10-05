---
name: core-git-workflow
description: Użyj przy pracy z gitem — gałęzie, commity, pull requesty i ich przegląd (także przez AI), konflikty, operacje niebezpieczne.
metadata:
  katalog: "Użyj przy pracy z gitem — gałęzie, przygotowanie commitów, pull requesty, przegląd PR (także przez AI: REVIEW.md, claude-code-action, rozdział obowiązków, ochrona gałęzi), konflikty, operacje niebezpieczne. Nie do formatu commit message (core-conventional-commits) ani pipeline'ów CI (ops-ci-cd)."
  slowa: "pull request, PR, code review, przegląd kodu, review przez AI, Claude przegląda PR, REVIEW.md, claude-code-action, ochrona gałęzi, branch protection, konflikt, rebase, merge"
---

# Git workflow

## Gałęzie
- Nazwa: `<typ>/<krótki-opis>` np. `feat/user-avatar`, `fix/login-redirect`, `chore/deps-bump`.
- Gałęzie krótko żyjące (godziny–dni) i częsta integracja z główną (trunk-based, zob. eng-continuous-delivery).
- Nigdy nie pracujesz bezpośrednio na `main`/`master`. Jeśli jesteś na nim — utwórz gałąź przed pierwszą zmianą.

## Commity
- Format commit message i tytułu PR: skill **core-conventional-commits** (tam też: jak poprawić zły typ commita —
  `--amend` tylko dla ostatniego, niewypchniętego commita i na wyraźną prośbę).
- Jeden commit = jedna logiczna zmiana; małe, częste commity (łatwy review i revert).

## Przed commitem
1. `git status` i `git diff --staged` — sprawdź, że commitujesz tylko zamierzone pliki.
2. Żadnych sekretów, plików `.env`, dumpów, artefaktów buildu.
3. Testy i lint przechodzą.
4. Dodawaj pliki po nazwie (`git add ścieżka`), nie `git add -A`, chyba że diff jest w pełni przejrzany.

## Zakazane bez wyraźnej zgody człowieka
- `git push --force` (dopuszczalne `--force-with-lease` na własnej gałęzi po zgodzie),
- `git reset --hard`, `git clean -fd`, przepisywanie historii opublikowanych gałęzi,
- push do `main`.

## Pull request
Tytuł jak commit. Opis: **Co** (1–3 punkty), **Dlaczego**, **Jak przetestowano**, **Ryzyka/rollback**.
Mały PR (jedna zmiana, kilkaset linii) przegląda się szybciej i dokładniej niż duży; duży dziel na kolejne PR-y.
Odwołaj się do planu kroku i wymagań (`docs/project/`), żeby przeglądający sprawdził zgodność z zamiarem.

## Przegląd PR — także przez AI
- **Pierwszy przegląd może robić agent**, drugi i decydujący — człowiek. Człowiek skupia się na zachowaniu
  („czy rozwiązuje zamiar?”) i ryzyku, a nie na stylu, który sprawdza lint i CI.
- **`REVIEW.md` w katalogu głównym repozytorium** opisuje zasady przeglądu (czyta go usługa Code Review w Claude Code;
  różni się od `CLAUDE.md`, który dotyczy całej pracy agenta). Szablon: `references/review-md.md`.
- **Narzędzia:** usługa Code Review albo `anthropics/claude-code-action@v1` w GitHub Actions — reaguje na wzmiankę
  `@claude` w komentarzu albo działa automatycznie z poleceniem w `prompt`; konfiguracja przez `/install-github-app`
  (tylko github.com), klucz w sekrecie repozytorium (`ANTHROPIC_API_KEY`). Instalację i sekrety wykonuje człowiek.
- **Rozdział obowiązków:** agent nie zatwierdza własnego kodu. Ochrona gałęzi głównej wymaga zatwierdzenia człowieka
  i zielonego CI; poprawki po uwagach agent może wypchnąć na gałąź PR, ale scala człowiek.
- **Strojenie raz w miesiącu:** oceń trafność ustaleń, ogranicz liczbę drobiazgów, wyklucz kod generowany i to, co
  sprawdza CI. Nienastrojony przegląd zasypuje zespół uwagami i przestaje być czytany.
- Przegląd bezpieczeństwa zmian w uwierzytelnianiu, IaC i CI: agent `security-reviewer` przed scaleniem.

## Konflikty
Rozwiązuj, rozumiejąc obie strony — nigdy „weź wszystko moje”. Po rozwiązaniu uruchom testy.
