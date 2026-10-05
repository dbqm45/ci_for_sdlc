# Style architektury całej aplikacji frontendowej

> **Spis treści:** Uwagi (stan 2026) · Style kompozycji frontendu (LogRocket) · Klasyczne style architektury oprogramowania zastosowane do… · Jak wybierać między tymi dwiema taksonomiami

Źródła: blog.logrocket.com „A guide to modern frontend architecture patterns” (5 stylów
kompozycyjnych + hybrydowy) i artykuł Hrynkevycha (klasyczne style architektury oprogramowania
zastosowane do frontendu). Te dwie taksonomie się uzupełniają — LogRocket opisuje, **jak fizycznie
skomponować** frontend, Hrynkevych opisuje **szersze wzorce systemowe**, w które frontend jest
osadzony (część z nich, jak Micro Frontends, pojawia się w obu, konsekwentnie).

## Uwagi (stan 2026)

- Wybór stylu całego systemu (modularny monolit, mikroserwisy, zdarzenia) i atrybuty jakości — arch-quality-attributes;
  wybór technologii — arch-tech-selection; zapis decyzji jako ADR — core-tech-docs.
- „Flux” to dziś rodzina rozwiązań (Redux Toolkit, NgRx, Pinia); równolegle rośnie model **sygnałów** (Angular,
  Solid, Svelte 5, Preact) — stan reaktywny bez centralnego dispatchera. Centralny store tylko dla prawdziwie
  globalnego stanu klienta (fsd-screaming-architecture.md).
- Micro-frontends 2026: Module Federation 2.0 (webpack/Rspack, wtyczki Vite), Native Federation (Angular, oparte na
  import maps), Single-SPA; często wystarczy **modularny monolit** w monorepo (Nx/Turborepo) z granicami
  wymuszanymi lintem — niezależne wdrożenia są jedynym mocnym argumentem za MFE.

## Style kompozycji frontendu (LogRocket)

### Architektura monolityczna

„Hosts the entire app frontend's interfaces, resources, and dependency module sources in just one
project codebase.”

- **Zalety:** najprostsza struktura dla małych projektów; łatwa do debugowania i testowania; szybkie
  wdrożenia.
- **Wady:** rosnąca złożoność kodu wpływa na utrzymywalność; ograniczenia skalowania; potencjalne
  konflikty przy scalaniu kodu (merge).
- **Kiedy używać:** małe i średnie projekty, gdzie priorytetem jest szybka dostawa produktu.

### Architektura modularna

Dzieli kod na „separate, maintainable, and installable modules” oparte na funkcjonalności.

- **Zalety:** zmniejsza złożoność głównego repozytorium; ułatwia pracę zespołową i równoległy
  rozwój; lepsze zarządzanie testami i wdrożeniami.
- **Wady:** trudność w przeglądaniu pełnego projektu z jednego repozytorium; potencjalnie wolniejsze
  wdrażanie (koordynacja między modułami).
- **Kiedy używać:** duże kodebase wymagające lepszej kolaboracji między zespołami.

### Architektura oparta na komponentach (component-based)

„Components host a template, UI logic, and styles” — reużywalne elementy interfejsu jako
podstawowa jednostka.

- **Zalety:** poprawia utrzymywalność i produktywność; konsystentny UI/UX; ułatwiona dekompozycja
  interfejsu na mniejsze części.
- **Wady:** trudności z zarządzaniem stanem w dużych drzewach komponentów; konieczność
  implementacji mock services do testów; wymaga znajomości best practices, inaczej łatwo o
  komponenty źle zaprojektowane.
- **Kiedy używać:** podstawa nowoczesnych bibliotek/frameworków (React, Vue, Angular, Svelte) — to
  jest dziś punkt wyjścia, nie alternatywa wobec innych stylów z tej listy.

### Architektura mikrofrontendów (Micro Frontends)

„Divide the app frontend into isolated, maintainable frontend projects” — z aplikacją host, która
ładuje poszczególne mikrofrontendy dostarczające funkcjonalność na żądanie.

- **Zalety:** doskonałe skalowanie i utrzymywalność; wdrażanie bez restartowania całej aplikacji;
  łatwe przydzielanie osobnych projektów do osobnych zespołów.
- **Wady:** komplikuje architekturę produktu; wolniejszy początkowy rozwój (setup); wymaga
  standaryzacji UI/UX między zespołami, inaczej produkt się rozjeżdża wizualnie/behawioralnie.
- **Kiedy używać:** duże, złożone projekty utrzymywane przez duże, autonomiczne zespoły.

### Architektura Flux

Wzorzec wprowadzony przez Meta: „centralized state stores and unidirectional data flow”.

- **Trzy elementy:** **Dispatcher** (wysyła akcje do store'u), **Store** (przechowuje stan i logikę),
  **View** (komponenty UI, czytają ze store'u).
- **Zalety:** zmniejsza złożoność zarządzania stanem; przewidywalny, jednokierunkowy przepływ danych;
  łatwa, replayowalna historia zmian stanu (przydatne do debugowania/time-travel).
- **Wady:** niełatwe dla początkujących; dodatkowy boilerplate; może niepotrzebnie skomplikować
  proste projekty bez realnie złożonego stanu.
- **Kiedy używać:** średnie i duże aplikacje komponentowe ze złożonym, współdzielonym stanem.

### Architektura hybrydowa/mieszana

Kombinacja wielu wzorców naraz — np. monolityczna + component-based, albo modularna + Flux +
component-based. **Kluczowy wniosek źródła:** „There is no strict rule telling you to follow just
one architecture pattern — you can adhere to multiple patterns” w zależności od potrzeb projektu i
preferencji zespołu — te style nie są wzajemnie wykluczające się kategorie.

### Tabela porównawcza (LogRocket)

| Czynnik | Monolit | Modularna | Component-based | Micro-frontends | Flux |
|---|---|---|---|---|---|
| Proste projekty | zalecana | nie | zalecana | nie | nie |
| Średnie projekty | częściowo | zalecana | zalecana | częściowo | zalecana |
| Duże projekty | nie | częściowo | zalecana | zalecana | zalecana |
| Dla początkujących | tak | może być | tak | nie | nie |

## Klasyczne style architektury oprogramowania zastosowane do frontendu (Hrynkevych)

### Architektura warstwowa (Layered)

Aplikacja podzielona na stosowane (stacked) warstwy:
- **Warstwa prezentacji** — UI, komponenty (np. React).
- **Warstwa logiki biznesowej** — domena, zarządzanie stanem (Redux, Zustand).
- **Warstwa dostępu do danych** — API, bazy danych, CMS.

Zalety: wyraźne rozdzielenie odpowiedzialności, modularność. Wady: sztywność, potencjalne
niepotrzebne związanie (coupling) między warstwami, jeśli granice nie są pilnowane.

### Architektura klient-serwer

Przeglądarka wysyła żądania do backendu, który odsyła odpowiedzi — standard dla nowoczesnych
aplikacji frontendowych; GraphQL i REST strukturyzują tę interakcję. Zalety: prostota, scentralizowana
obsługa danych. Wady: wąskie gardła po stronie serwera, opóźnienia sieciowe.

### Mikroserwisy i Micro Frontends

**Mikroserwisy** — backend podzielony po możliwościach biznesowych (business capabilities).
**Micro Frontends** — frontend podzielony analogicznie, każdy zespół zarządza swoim wycinkiem UI;
narzędzia: Webpack Module Federation, Turborepo, Single-Spa. Zalety: autonomia zespołów, niezależne
wdrażanie. Wady: złożoność integracji, większe obciążenie infrastrukturalne.

### Serverless (Functions as a Service)

Logika podzielona na funkcje uruchamiane w chmurze (AWS Lambda, Vercel Functions); w Next.js:
API routes, middleware edge'owe. Zalety: skalowalność, brak zarządzania serwerem. Wady: cold starts,
uzależnienie od dostawcy (vendor lock-in).

### Systemy rozproszone

Współczesny frontend komunikuje się z wieloma zewnętrznymi systemami naraz — bramami płatniczymi,
CMS-ami, systemami autentykacji stron trzecich. Wyzwania: opóźnienia, spójność danych, obsługa
awarii częściowych. Rozwiązania: cachowanie, logika retry, strategie CDN — patrz też katalog wzorców,
kategoria Resilience (`resilience/`).

## Jak wybierać między tymi dwiema taksonomiami

Nie są konkurencyjne — pytaj o różne osie:
- **„Jak fizycznie skomponować repo/deployment?”** → sekcja LogRocket (monolit/modularna/
  component-based/micro-frontends/Flux).
- **„Jak frontend komunikuje się z resztą systemu i jak jest zorganizowana logika wewnątrz warstw?”**
  → sekcja Hrynkevycha (warstwowa/klient-serwer/mikroserwisy/serverless/systemy rozproszone).

Realny projekt zwykle łączy jedną odpowiedź z każdej osi — np. „component-based + Flux” (LogRocket)
**i** „klient-serwer + serverless” (Hrynkevych) naraz, co jest częstą kombinacją dla współczesnej
aplikacji Next.js/React z API routes.
