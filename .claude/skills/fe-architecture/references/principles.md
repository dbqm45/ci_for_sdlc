# Fundamenty i zasady architektury frontendowej

> **Spis treści:** Sześć fundamentów (frontendpatterns.dev) · Ogólne zasady architektoniczne (Hrynkevych) · Model mentalny „trzech odpowiedzialności”… · Przewodniki frontendpatterns.dev do decyzji…

Źródła: frontendpatterns.dev/foundations („Core Principles — core principles that shape how we
build for the web”), artykuł Mykhaila Hrynkevycha „Frontend Architecture”, dev.to/playfulprogramming
„The Grand Unifying Architecture of Frontend”.

## Sześć fundamentów (frontendpatterns.dev)

1. **Accessibility as a Foundation** — dostępność nie jest dodatkiem na końcu, jest fundamentem, na
   którym stoi resztę decyzji UI (semantyka, focus management, ARIA, klawiatura) — fe-web-platform
   (`references/accessibility/`).
2. **Component-Driven Architecture** — UI budowane z izolowanych, reużywalnych komponentów jako
   podstawowa jednostka organizacji kodu, niezależnie od konkretnego frameworka.
3. **Logical Separation of Concerns** — rozdzielenie prezentacji, logiki biznesowej i dostępu do
   danych na wyraźne, niezależnie testowalne warstwy.
4. **Performance as a Foundation** — wydajność projektowana od początku (code splitting, lazy
   loading, memoization), nie optymalizowana post-hoc jako „naprawa” na końcu.
5. **Resilience by Design** — aplikacja z założenia radzi sobie z błędami sieci, wolnym backendem,
   częściową awarią (error boundaries, retry, loading states), nie zakłada happy path.
6. **The Progressive Enhancement Mindset** — podstawowa funkcjonalność działa bez JS/przy
   ograniczeniach; JS/CSS *wzbogacają* doświadczenie, nie są warunkiem, żeby cokolwiek działało.

**Reguła stosowania:** te sześć fundamentów **nie są opcjonalne przy dużych projektach** — dotyczą
każdej decyzji niezależnie od wybranego stylu architektury (`architecture-styles.md`) czy skali
projektu. Mały, prosty frontend (np. bezframeworkowy skrypt) wciąż powinien mieć dostępne
formularze, wciąż powinien obsłużyć błąd `fetch()`, wciąż powinien mieć sensowny `loading state` —
„prosty” nie znaczy „bez fundamentów”.

## Ogólne zasady architektoniczne (Hrynkevych)

- **Separation of Concerns (SoC)** — izolacja prezentacji od logiki, reguł biznesowych od
  infrastruktury; zwiększa testowalność i czytelność.
- **Wysoka spójność (cohesion), niskie powiązanie (coupling)** — spójność: logika, która razem się
  zmienia, powinna mieszkać razem; powiązanie: minimalna liczba zależności między niezależnymi
  częściami.
- **Enkapsulacja** — ukrywanie szczegółów implementacji za dobrze zdefiniowanym interfejsem,
  zwłaszcza w komponentach wielokrotnego użytku i hookach — konsument nie powinien znać wnętrza.
- **DRY / KISS / YAGNI** — definicje, granice (kiedy DRY szkodzi) i rozstrzyganie konfliktów między nimi są w
  eng-design-principles; tu tylko przypomnienie, że w UI YAGNI najczęściej łamie się przedwczesną memoizacją,
  podziałem kodu „na zapas” i abstrakcją komponentu przed drugim użyciem.
- **Skalowalność horyzontalna, nie wertykalna** — architektura powinna rosnąć po
  feature/module/zespole (dodanie nowego modułu = dodanie nowego katalogu, nie rozrost jednego
  istniejącego pliku), nie przez ciągłe dokładanie kodu do tych samych, coraz większych plików.

**Cele architektury frontendowej wg tego samego artykułu:** wyraźne rozgraniczenie domeny
biznesowej, skalowalność kodu, ułatwienie współpracy zespołowej, wsparcie dla wydajności/
dostępności/odporności, umożliwienie bezpiecznej ewolucji oprogramowania bez tarcia.

## Model mentalny „trzech odpowiedzialności” (framework-agnostyczny)

Z artykułu „The Grand Unifying Architecture of Frontend” — teza: niezależnie od filozofii
implementacji (SPA, MPA, HTMX, LiveView, Server Components, Sync Engines), **każde** rozwiązanie
frontendowe adresuje te same trzy, trwałe odpowiedzialności:

1. **Navigation (klient)** — przeglądarka zarządza orkiestracją na podstawie URL; JavaScript daje
   kontrolę na poziomie root'a, niezależnie od tego, czy to SPA czy wymiana fragmentów HTML.
2. **Content (serwer)** — serwer jest autorytatywnym źródłem markupu albo danych JSON, uruchamianym
   przez żądania nawigacyjne zainicjowane przez klienta.
3. **Affordances (klient)** — lokalny stan UI, praca w toku (in-progress), optimistic updates —
   szybki feedback dla użytkownika bez czekania na round-trip do serwera.

**Wzorzec przepływu:** navigation (klient) → content (serwer) → affordances (klient). Zapis
(write) „podróżuje w górę” jako navigation; odczyt (read) „płynie w dół” jako content. **Ta
asymetria zapobiega konfliktującym, stateful systemom** po obu stronach — jeśli klient i serwer są
oba „właścicielami” tego samego stanu bez jasnego podziału ról, to jest źródło błędów
synchronizacji, nie tylko niewygoda.

**Gdzie w spektrum leżą różne podejścia:**
- **HTMX** — minimalna logika klienta, serwer odpowiada ciężkim HTML-em.
- **LiveView** — rozszerzone możliwości serwera z trwałymi (persistent) sesjami.
- **React SPA** — dominacja logiki klienckiej, komunikacja przez JSON API.
- **Server Components** — jawne, trójwarstwowe rozdzielenie (osobno navigation/content/affordances).
- **Sync Engines** — replikowane lokalne magazyny danych z optimistic overlay.

**Wniosek praktyczny:** różnice między konkurencyjnymi podejściami to głównie **wybór transportu i
trade-off efektywności**, nie fundamentalna różnica w tym, co system musi zrobić. Przy ocenie
nowego frameworka/podejścia — zapytaj, jak konkretnie rozdziela te trzy odpowiedzialności, zamiast
oceniać go w oderwaniu od tego modelu.

**Uwaga techniczna z artykułu (Solid 2.0, jako ilustracja, nie jako wymóg ogólny):** unikanie
hydration mismatch poprzez „single hydration” — treść jest kluczowana przez wywołanie funkcji
serwerowej, która ją wyprodukowała; nieaktualne odpowiedzi failują walidację wersji; komponent
kliencki „claim'uje” węzeł wyrenderowany po stronie serwera tylko raz. To konkretny mechanizm
realizujący model trzech odpowiedzialności bez konfliktu klient/serwer o ten sam węzeł DOM.

## Przewodniki frontendpatterns.dev do decyzji wieloczynnikowych (zewnętrzne)

Indeks 11 przewodników z frontendpatterns.dev/guides (Den Odell) — punkty wejścia, gdy pytanie brzmi „które z kilku
podejść i dlaczego”, a nie „jak zaimplementować jedną rzecz”. Treść przewodników nie jest skopiowana — przy potrzebie
czytaj oryginał.

| Przewodnik (`/guides/…`) | Zakres decyzji | Lokalny odpowiednik |
|---|---|---|
| accessible-interaction-playbook | interakcje działające dla myszy, klawiatury, dotyku i czytnika ekranu | fe-web-platform `accessibility/` |
| building-with-progressive-enhancement | warstwowanie funkcji: baza bez JS, wzbogacenia stopniowo | fundament 6 wyżej |
| choosing-css-strategy | CSS Modules vs utility-first vs CSS-in-JS vs BEM | fe-css |
| choosing-a-frontend-framework | kryteria wyboru frameworka | arch-tech-selection |
| choosing-a-networking-style-for-realtime-apps | WebSocket vs SSE vs long polling | fe-web-platform |
| choosing-a-state-management-approach | stan lokalny / kontekst / store / stan serwera | fsd-screaming-architecture.md |
| designing-component-apis | przewidywalne, trudne do złego użycia API komponentów | components/props-and-attributes.md, components/compound-components.md |
| managing-ai-response-states | spójny przepływ stanów UI czatu AI | ai-chat-ui/ |
| managing-async-ux-states | idle/loading/error/success dla operacji asynchronicznych | resilience/loading-state.md |
| securing-frontend-data-flows | CSP, CSRF, tokeny, kodowanie jako jedna strategia | security/ |
| testing-confidence-ladder | poziom testów vs pewność vs koszt | eng-testing, testing/component-testing.md |
