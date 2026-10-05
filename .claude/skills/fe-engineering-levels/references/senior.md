# Senior Frontend Engineer

Poziom: właściciel jednej funkcjonalności/jednego repo od pomysłu do produkcji, wzorzec techniczny dla młodszych
w zespole. Soczewka: **jeden zespół, jedna aplikacja**.

Treść techniczna z pierwotnej wersji tego pliku (Critical Rendering Path, Virtual DOM, SSR/hydratacja/RSC, Core Web
Vitals, Service Workers) została przeniesiona do skilli technicznych — tu zostaje **czego oczekujemy** od Seniora.

## Kompetencje techniczne — oczekiwane zachowania

| Obszar | Senior potrafi… | Wiedza w |
|---|---|---|
| Event loop, pamięć | **wyjaśnić**, dlaczego operacja blokuje główny wątek, i **zdiagnozować** wyciek (heap snapshot, detached nodes) — nie tylko zdefiniować pętlę zdarzeń | fe-web-platform `.claude/skills/fe-web-platform/references/rendering-pipeline.md` |
| Renderowanie przeglądarki | wskazać, która faza CRP jest wąskim gardłem (render-blocking CSS/JS, layout thrashing) i czemu animujemy `transform`/`opacity` | fe-web-platform `.claude/skills/fe-web-platform/references/rendering-pipeline.md` |
| Wydajność | ustalić, która metryka (LCP/INP/CLS) jest zła, znaleźć przyczynę na danych polowych i zweryfikować poprawkę pomiarem | fe-web-platform `.claude/skills/fe-web-platform/references/core-web-vitals.md` |
| Model renderowania | dobrać CSR/SSR/SSG/ISR/RSC per trasa, rozpoznać i naprawić hydration mismatch, rozumieć koszt reconciliation vs sygnałów | fe-architecture `.claude/skills/fe-architecture/references/rendering-models.md` |
| Offline/PWA | ocenić, czy service worker jest potrzebny, dobrać strategię cache i bezpieczną aktualizację | fe-web-platform `.claude/skills/fe-web-platform/references/service-workers.md` |
| Język i typy | swobodnie czytać/pisać typy średniej złożoności; rozpoznać, kiedy typ jest bardziej skomplikowany niż wart (nadmiar generyków to zapach, nie cel) | lang-typescript, lang-javascript |
| Framework | znać model zmian swojego frameworka i jego pułapki (klucze list, czystość renderu, efekty, signals/OnPush) | fw-angular, fe-architecture |
| Architektura aplikacji | **zastosować** wzorzec do nazwanego problemu i **rozpoznać nadużycie** wzorca | fe-architecture, eng-design-principles, eng-design-patterns |
| Dostępność i bezpieczeństwo | dostarczać funkcje zgodne z WCAG AA i bez XSS domyślnie, nie „po audycie” | fe-web-platform, fe-architecture `references/security/` |
| Testy | pisać testy zachowania (nie implementacji) i dobrać poziom testu do ryzyka | eng-testing, fe-architecture `references/testing/` |

## Mentoring i code review

Na poziomie Senior rozwój innych staje się realną, ocenianą częścią pracy, nie efektem pobocznym.

- **Code review** jest skuteczny, gdy:
  - komentarz wskazuje **konkretny** problem i **konkretną** alternatywę (nie „to jest źle”);
  - odróżnia **blokujące** od **nice-to-have** (oznaczaj np. `nit:`), a spory stylistyczne rozstrzyga
    formatter/linter, nie dyskusja w PR;
  - pyta „dlaczego”, zamiast zakładać złą intencję — autor mógł mieć kontekst, którego recenzent nie widzi;
  - dotyczy małych zmian (małe PR-y to decyzja procesu — eng-continuous-delivery).
- **Mentoring** jest skuteczny, gdy prowadzi mentee do **samodzielnego** rozwiązania (pytania naprowadzające, pair
  programming), a nie do najszybszego rozwiązania przez mentora — inaczej problem wraca bez wzrostu kompetencji.
- **Własność funkcji**: Senior doprowadza funkcję do produkcji razem z obserwowalnością (błędy, metryki) i
  sprzątaniem (feature flag usunięty, dług zapisany).

## Senior a Staff

Senior optymalizuje, naprawia i projektuje **w granicach jednej aplikacji/zespołu** i jest lokalnym wzorcem jakości.
Gdy decyzja dotyczy **wielu zespołów naraz** (współdzielony design system, standard bezpieczeństwa dla domeny, tooling
wielu repo) — to już soczewka Staff (`staff.md`).
