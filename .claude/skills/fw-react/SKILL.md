---
name: fw-react
description: Użyj przy kodzie Reacta 18–19.3 — czyste komponenty, stan, kiedy nie efekt, Actions i formularze, React Compiler, testy.
metadata:
  katalog: "Użyj przy kodzie Reacta (18–19.3) bez względu na framework — komponenty i hooki, struktura stanu, efekty i ich zamienniki (wyliczenie w renderze, key, useEffectEvent), Actions i formularze (useActionState, useOptimistic, use), React Compiler zamiast ręcznego memo, granice Suspense i błędów, testy z Testing Library, aktualizacja 18→19 — oraz przy decyzji, gdzie w aplikacji React umieścić pojęcia domenowe. Nie do routingu, cache i Server Actions Next.js (fw-nextjs), składni TypeScript (lang-typescript) ani ogólnej architektury frontu (fe-architecture)."
  slowa: "React, komponent Reacta, hook, useEffect, useState, useMemo, useCallback, memo, re-render, useActionState, useOptimistic, useEffectEvent, React Compiler, JSX, tsx, Vite"
---

# React

**Najpierw sprawdź wersję** (`detect_stack.py` / `package.json`). Zasady poniżej opisują React 19.x; w starszym
projekcie bierz odpowiedniki z sekcji „Zależne od wersji”. Nową aplikację React zaleca zaczynać od frameworka
(Next.js App Router, React Router v7, Expo); bez frameworka — Vite. Create React App jest wycofane (luty 2025).

## Zasady
1. **Komponent jest czysty:** te same props, stan i kontekst → ten sam JSX. Nie modyfikuj props, stanu, kontekstu ani
   obiektów utworzonych przed renderem. Efekty uboczne idą do handlerów zdarzeń, a efekt to ostatnia możliwość.
2. **Stan minimalny:**
   - grupuj wartości zmieniane razem;
   - nie trzymaj stanu sprzecznego (dwie flagi zamiast jednego `status`);
   - nie kopiuj props do stanu;
   - trzymaj ID wybranego elementu, nie jego kopię;
   - zagnieżdżone dane spłaszczaj;
   - stan wspólny podnoś do najbliższego wspólnego rodzica.
3. **Kiedy nie efekt** (react.dev, „You Might Not Need an Effect”):
   - wartość, którą da się **wyliczyć podczas renderowania**, liczysz w ciele komponentu, bez stanu i efektu;
     kosztowne wyliczenie memoizuje kompilator albo `useMemo`;
   - reset całego stanu przy zmianie tożsamości (np. `userId`) → inny **`key`** na komponencie;
   - reakcja na akcję użytkownika (wysłanie, zakup, powiadomienie) → handler zdarzenia, nie efekt na stanie;
   - efekt jest do synchronizacji z systemem zewnętrznym (połączenie, subskrypcja, widget spoza Reacta)
     i zawsze ma sprzątanie.
4. **Efekt czyta aktualną wartość, ale nie ma na nią reagować** → `useEffectEvent` (19.2+). Funkcja z niego nie trafia
   do zależności i nie wywołuje ponownej synchronizacji. Reguł lintera nie wyłączaj (`eslint-disable`) — to ukrywa błąd.
5. **Pobieranie danych:**
   - w aplikacji z frameworkiem — mechanizm frameworka (w Next.js Server Components, fw-nextjs);
   - poza nim — biblioteka z cache (np. TanStack Query) albo `use(promise)` z promisem utworzonym poza renderem;
   - ręczne pobieranie w efekcie wymaga sprzątania, które ignoruje spóźnioną odpowiedź (wyścig) albo przerywa
     żądanie przez `AbortController`.
6. **Mutacje i formularze (19):**
   - `<form action={fn}>` i Actions (funkcje asynchroniczne w `startTransition`);
   - `useActionState` daje wynik i flagę oczekiwania;
   - `useFormStatus` daje stan formularza w komponencie potomnym;
   - `useOptimistic` pokazuje wynik przed odpowiedzią serwera.
   Odrzucenie biznesowe zwracaj jako stan akcji, nie wyjątek.
7. **Memoizacja:** w nowym kodzie włącz **React Compiler** (`babel-plugin-react-compiler` 1.x, plugin uruchamiany
   jako pierwszy; w Next.js `reactCompiler: true`) i reguły kompilatora z presetu `recommended`
   w **`eslint-plugin-react-hooks`** 7+. Ręczne `memo`/`useMemo`/`useCallback` tylko tam, gdzie pomiar lub
   tożsamość wartości tego wymaga. Wyłączenie dla jednego komponentu: dyrektywa `"use no memo"`.
8. **Reguły hooków:**
   - wywołuj hooki tylko na najwyższym poziomie komponentu lub własnego hooka;
   - nie wywołuj ich w warunku, pętli, po wczesnym `return`, w handlerze, w `try/catch`;
   - własny hook zaczyna się od `use` i współdzieli logikę, nie stan.
9. **Listy:** stabilny `key` z danych (ID), nigdy indeks przy listach zmieniających kolejność.
10. **Granice:**
    - `<Suspense>` wokół części, które czekają na dane;
    - granica błędu (komponent klasowy albo biblioteka `react-error-boundary`) na poziomie funkcji;
    - `<Activity mode="hidden">` (19.2) ukrywa część UI, zachowując jej stan.
11. **Testy:** Testing Library (`@testing-library/react`) — zapytania wg ról i tekstu, interakcje przez `user-event`;
    `act` importujesz z `react` (nie z `react-dom/test-utils`). Logikę domeny testuj jako czyste funkcje, bez renderu.
    Runner: tool-vitest albo tool-jest.

Przykłady (efekt → wyliczenie, reset przez `key`, `useEffectEvent`, formularz z `useActionState`, wyścig przy
pobieraniu) i odpowiedniki dla React 18: `references/wzorce.md`.

## Pojęcia domenowe w React — gdzie co mieszka
| Pojęcie (słownik) | Miejsce w aplikacji React |
|---|---|
| **obiekt wartości** | czysty TS w `domain/` (lang-typescript); w UI komponent prezentacyjny lub funkcja formatująca (np. `<Money>`), kontrolka formularza dla pola powtarzanego w wielu formularzach |
| **encja** | typ domenowy w `domain/`; komponent dostaje ją w props i jej nie modyfikuje |
| **warianty** | unia dyskryminowana i `switch` po `kind` w komponencie (wyczerpujący, z `never`); osobne komponenty dla mocno różnych wariantów |
| **wynik operacji** | stan akcji z `useActionState` (`ok` / `rejected` z powodem); odrzucenie 409/422 jako komunikat, nie wyjątek |
| **agregat** | zwykle **na backendzie**; we froncie tylko przy pracy offline — klasa lub moduł w `domain/`, wołany z reducera |
| **maszyna stanów** | `useReducer` z unią stanów i zdarzeń; reducer jako czysta funkcja testowana bez renderu |
| **zdarzenie** | zdarzenia UI przez props-callbacki (`onReserve`); zdarzenia domenowe z serwera (SSE/WebSocket) przez `useSyncExternalStore` lub efekt z subskrypcją |
| **polityka** | czysta funkcja w `domain/`; wariant zależny od konfiguracji przez kontekst (`createContext`) |
| **specyfikacja / reguły** | czyste funkcje w `domain/`, używane w walidacji formularza i w `disabled` przycisków |
| **repozytorium / port** | moduł danych (`api/`) mapujący DTO ↔ typy domenowe; w Next.js warstwa dostępu do danych na serwerze (fw-nextjs) |
| **read model** | dane z cache biblioteki zapytań lub Server Component; widoki tylko czytają |
| **moduł** | katalog funkcji (`features/<nazwa>/`) z publicznym `index.ts`; `domain/` bez importów z `react` |

## Zależne od wersji
| Wersja | Zmiany istotne dla tego skilla |
|---|---|
| 18 | `createRoot`, automatyczne grupowanie aktualizacji, `useTransition`, `useDeferredValue`, `useId`, `useSyncExternalStore`; Suspense przy SSR strumieniowym. 18.3 ostrzega o API usuniętych w 19 |
| 19.0 | Actions (asynchroniczne `startTransition`), `useActionState`, `useOptimistic`, `use`, `useFormStatus`, `<form action>`; **`ref` jako zwykły prop** (bez `forwardRef`); `<Context>` jako provider; metadane dokumentu i arkusze stylów w komponentach; dyrektywy `'use client'`/`'use server'` stabilne. **Usunięte:** `propTypes`, `defaultProps` w komponentach funkcyjnych, stary kontekst, string refs, `ReactDOM.render`/`hydrate`, `react-dom/test-utils` (`act` z `react`); `useRef` wymaga argumentu w typach |
| 19.1 | Owner Stacks (`captureOwnerStack`, tylko dev) |
| 19.2 | `<Activity>`, `useEffectEvent`, `cacheSignal` (RSC), ścieżki wydajności w DevTools, częściowy prerender w `react-dom` |
| 19.3 | `<ViewTransition>` i `addTransitionType` stabilne, `<Fragment ref>` stabilne, `use(browser())` dla poddrzew tylko w przeglądarce, integracja Trusted Types, ostrzeżenie dev przy warunkowym `use()` |

Aktualizacja 18 → 19: najpierw 18.3 (ostrzeżenia), potem `npx codemod@latest react/19/migration-recipe` oraz
`npx types-react-codemod@latest preset-19 ./src`. Zależności podnosisz tylko na prośbę człowieka (core-stack-sync).

**Bezpieczeństwo RSC:** pakiety `react-server-dom-*` 19.0–19.2.0 miały krytyczną lukę RCE (CVE-2025-55182, grudzień
2025), a późniejsze wydania poprawiały DoS i wyciek kodu. Aplikacja z Server Components musi mieć najnowszą łatkę
swojej linii (19.0.x / 19.1.x / 19.2.x); zgłoś to człowiekowi, jeśli wersja jest starsza.

## Checklista
- [ ] wersja Reacta sprawdzona; użyte API dostępne w tej wersji
- [ ] brak stanu wyliczalnego z props/stanu i efektów „na zmianę stanu”
- [ ] każdy efekt synchronizuje z czymś zewnętrznym i ma sprzątanie
- [ ] lint `eslint-plugin-react-hooks` bez wyłączeń; kompilator włączony albo świadomie pominięty
- [ ] `domain/` bez importów z `react`; odrzucenia jako stan akcji

## Źródła
- react.dev/reference/react, react.dev/learn (m.in. „You Might Not Need an Effect”, „Keeping Components Pure”,
  „Choosing the State Structure”), react.dev/versions — dostęp 2026-10-03
- react.dev/blog: React 19 Upgrade Guide (2024-04-25), React 19.2 (2025-10-01), React Compiler v1.0 (2025-10-07),
  React 19.3 (2026-09-09), komunikaty bezpieczeństwa RSC (2025-12-03, 2025-12-11)
- rejestr npm: `react` 19.3.0 (2026-09-09), `babel-plugin-react-compiler` 1.0.0, `eslint-plugin-react-hooks` 7.1.1
