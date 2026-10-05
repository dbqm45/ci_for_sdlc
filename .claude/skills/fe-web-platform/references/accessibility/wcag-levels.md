# WCAG — poziomy zgodności i wymogi prawne

Przeniesione z importu frontend-developer (`staff.md`, „WCAG — poziomy zgodności”), zaktualizowane do WCAG 2.2 i
stanu prawnego 2026.

## Wersja

- Aktualna rekomendacja W3C: **WCAG 2.2** (październik 2023). WCAG 3.0 jest
  szkicem roboczym — nie projektuj pod nią zgodności.
- WCAG 2.2 dodało m.in.: **2.4.11 Focus Not Obscured (AA)** — fokus nie może być całkiem zasłonięty (sticky header,
  baner cookies); **2.5.7 Dragging Movements (AA)** — alternatywa dla przeciągania; **2.5.8 Target Size Minimum (AA)** —
  cele ≥ 24×24 CSS px (lub odstęp); **3.2.6 Consistent Help (A)**; **3.3.7 Redundant Entry (A)** — nie każ wpisywać
  tego samego drugi raz; **3.3.8 Accessible Authentication (AA)** — bez testów poznawczych (pozwól wklejać hasła,
  menedżery haseł, passkeys). Usunięto 4.1.1 Parsing (przestarzałe).

## Poziomy

- **A (minimum)** — bariery, które całkowicie blokują dostęp (brak tekstu alternatywnego, treść niedostępna z
  klawiatury). Poniżej tego poziomu produkt jest dla części ludzi nieużywalny, nie „niewygodny”.
- **AA (standard prawny)** — poziom referencyjny regulacji: kontrast tekstu **4.5:1** (duży tekst **3:1**), kontrast
  elementów UI i wskaźnika fokusu **3:1** (1.4.11), powiększenie do 200% i reflow od 320 px bez utraty funkcji,
  widoczny fokus, cele dotykowe ≥ 24×24 px (wewnętrzny standard często 44×44 — fe-css). **Domyślny wymóg dla
  każdego nowego komponentu i design systemu**, nie cel aspiracyjny.
- **AAA** — np. kontrast **7:1**, 2.4.13 Focus Appearance; części kryteriów nie da się spełnić dla niektórych treści
  (np. język migowy do wszystkich nagrań) — stosuj selektywnie na krytycznych ścieżkach, nie globalnie.

## Prawo (2026)

- **UE — European Accessibility Act** stosowany od **28 czerwca 2025** (w Polsce: ustawa o zapewnianiu spełniania
  wymagań dostępności niektórych produktów i usług): e-commerce, bankowość, transport, e-booki, komunikacja.
  Punkt odniesienia: norma **EN 301 549** (odwołuje się do WCAG 2.1 AA; kolejna wersja — do 2.2). Sektor publiczny:
  dyrektywa 2016/2102 (w PL ustawa o dostępności cyfrowej).
- **USA** — ADA Title II (reguła DOJ z 2024: WCAG 2.1 AA dla administracji stanowej/lokalnej, terminy 2026–2027);
  Section 508; dla podmiotów prywatnych — orzecznictwo ADA Title III.

## Jak weryfikować

- Automaty (axe, Lighthouse, Playwright `toMatchAriaSnapshot` — tool-playwright) łapią ok. 30–40% problemów.
- Reszta ręcznie: sama klawiatura, czytnik ekranu (NVDA/JAWS, VoiceOver, TalkBack), powiększenie 200–400%,
  `prefers-reduced-motion`, tryb wysokiego kontrastu (`forced-colors`).
- Na poziomie organizacji: AA jako kryterium „definition of done” komponentu, lint (np. `eslint-plugin-jsx-a11y`,
  `@angular-eslint/template` accessibility rules), testy a11y w CI — fe-engineering-levels (Staff).
