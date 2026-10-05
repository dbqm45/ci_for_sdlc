---
name: fe-engineering-levels
description: Użyj przy ocenie poziomu rozwiązania frontendu (Senior, Staff, Principal) — standardy wielu zespołów, DevEx, ROI.
metadata:
  katalog: "Użyj, gdy trzeba ocenić, na jakim poziomie (Senior → Staff → Principal) rozwiązać problem frontendowy, i przy pracy „ponad kodem” — review i mentoring, design system i standardy wielu zespołów, DevEx (FLOW, tight-loose), ROI i komunikacja z biznesem, wizja techniczna, sponsoring. Nie do wiedzy o kodzie (fe-architecture, fe-web-platform, fe-css) ani metryk DORA (eng-continuous-delivery)."
  slowa: "tarcie programistów, wolny build, DevEx, standard dla wielu zespołów, koszt migracji, uzasadnienie dla biznesu"
---

# Poziomy inżyniera frontendu: Senior → Staff → Principal

Ten skill opisuje **zachowania i kompetencje** inżyniera, nie kod. To mapa pytań: czy problem dotyczy jednej
funkcji (soczewka Senior), wielu zespołów w firmie (Staff), czy całej firmy/branży (Principal). Wiedza techniczna
żyje w skillach technicznych — tu tylko odsyłacze i oczekiwania.

## Którą soczewkę zastosować

| Pytanie | Soczewka | Czytaj |
|---|---|---|
| Problem mieści się w jednej funkcji/jednym repo/zespole? | Senior | `references/senior.md` |
| Decyzja dotyczy wielu zespołów, wspólnego design systemu, standardu, toolingu wielu repo, budżetu? | Staff | `references/staff.md`, `references/devex.md` |
| Decyzja jest trudno odwracalna na skali firmy, dotyczy platformy, granicy frontend/infra albo branży? | Principal | `references/principal.md` |

- **Zaczynaj od najniższej soczewki**, idź wyżej tylko, gdy decyzja realnie wykracza poza zespół. Soczewka Principal
  na problemie lokalnym to ten sam błąd co nadużywanie wzorców (eng-design-principles).
- Rozróżniaj decyzje **odwracalne** (wybór biblioteki w module — decyduj szybko) i **nieodwracalne** (kontrakt
  design systemu, framework dla setek zespołów, model danych wspólnego API — rygor, ADR wg core-tech-docs).

## Oczekiwane zachowania (skrót)

**Senior** — dowozi funkcję od pomysłu do produkcji z obserwowalnością; tłumaczy i diagnozuje (event loop,
wycieki, CRP, LCP/INP/CLS, hydratacja) zamiast recytować definicje; stosuje wzorzec do nazwanego problemu i widzi
jego nadużycie; review z konkretną alternatywą i podziałem na blokujące/nit; mentoring przez pytania.

**Staff** — ustala standardy **wielu** zespołów i je wymusza automatyzacją (lint, CI, wspólny klient HTTP), nie
wiedzą indywidualną; prowadzi design system jako produkt (tokeny, governance, SLA kontrybucji, żywa dokumentacja);
liczy koszt migracji toolingu **przed** decyzją; zarządza długiem systemowo (strangler fig, codemody, jawny budżet);
diagnozuje tarcie DevEx przed wyborem narzędzia; tłumaczy decyzje na metryki biznesu (koszt, korzyść, horyzont zwrotu).

**Principal** — formułuje „north star” architektury, według której zespoły decydują same; traktuje frontend jako
platformę (roadmapa, wersjonowanie, ścieżki migracji, adopcja); rozmawia z infrastrukturą na równych prawach
(edge, CDN, serverless — gdzie leży granica); wpływa na standardy (open source, TC39, W3C); **sponsoruje** ludzi
(otwiera okazje), a nie tylko mentoruje; kształtuje kulturę (blameless postmortem, ADR, rozstrzyganie sporów).

## Komunikacja biznesowa — zasada wspólna dla Staff+
- Koszt techniczny wyrażaj metryką, którą biznes już śledzi (lead time, incydenty, konwersja, LCP → przychód), nie „kod jest brzydki”.
- Duża inwestycja = koszt (osobo-czas, ryzyko przestoju delivery) + mierzalna korzyść + horyzont zwrotu.
- Decyzje „loose” (lokalne dla zespołu) nie wymagają eskalacji; „tight” (wiele zespołów, budżet, harmonogram) — tak.

## Gdzie jest wiedza techniczna

| Temat | Skill |
|---|---|
| Event loop, CRP, Core Web Vitals, service workers, i18n, dostępność i WCAG | fe-web-platform |
| Style architektury, FSD, micro-frontends, modele renderowania (SSR/RSC), wzorce, bezpieczeństwo klienta | fe-architecture |
| Tokeny, motywy, izolacja stylów | fe-css |
| Język i framework | lang-typescript, lang-javascript, fw-angular |
| Wzorce GoF, zasady projektowe | eng-design-patterns, eng-design-principles |
| DORA, trunk-based, feature flags | eng-continuous-delivery |
| Granice zespołów, platform team | proc-team-topologies |
| Monorepo i build | tool-nx |

## Checklista
- [ ] Nazwana soczewka (Senior/Staff/Principal) i uzasadnienie, dlaczego nie niższa
- [ ] Decyzja oznaczona jako odwracalna/nieodwracalna; nieodwracalna ma ADR
- [ ] Standard dla wielu zespołów wymuszony automatycznie (lint/CI), nie tylko opisany
- [ ] Decyzja Staff+ ma koszt, korzyść i horyzont zwrotu w języku biznesu
- [ ] Zmiana DevEx poprzedzona diagnozą tarcia i zmierzona po wdrożeniu

Źródła: własna drabina kompetencji z importu „frontend-developer”; DevEx — networkperspective.io, conlea.pl, signadot (opisane własnymi słowami).
