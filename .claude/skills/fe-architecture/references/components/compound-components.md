# Compound Components

Źródło: dawny `fe-architecture/references/patterns.md` (wzorzec własny repo), rozszerzony o odpowiedniki
w innych frameworkach.

## TLDR

Zamiast jednego komponentu z dziesiątkami propsów konfiguracyjnych — rodzina komponentów, które razem tworzą
całość i współdzielą stan niejawnie (kontekst / DI), a użytkownik składa je jak natywny HTML (`<select>` + `<option>`).

## Problem

`<Tabs items={[...]} renderTab={...} renderPanel={...} tabClassName="..." showIcons />` — każdy nowy przypadek
użycia dokłada prop; API rośnie kombinatorycznie, a układ (np. ikona między zakładkami) jest niemożliwy bez
kolejnego propa.

## Rozwiązanie

```tsx
<Tabs defaultValue="a">
  <Tabs.List>
    <Tabs.Trigger value="a">A</Tabs.Trigger>
    <Tabs.Trigger value="b">B</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="a">…</Tabs.Panel>
  <Tabs.Panel value="b">…</Tabs.Panel>
</Tabs>
```

Stan (aktywna zakładka) żyje w korzeniu i jest udostępniany częściom wewnętrznie:

| Framework | Mechanizm współdzielenia | Składanie części |
|---|---|---|
| React | `createContext` + `use(Context)` (React 19) / `useContext` | `children` |
| Vue | `provide` / `inject` | sloty |
| Svelte 5 | `setContext` / `getContext` | snippety (`{@render children()}`) |
| Angular (fw-angular) | serwis wstrzyknięty w komponent-rodzica (`providers`) lub `inject(ParentComponent)` | projekcja treści (`<ng-content select>`), `contentChildren()` |
| Web Components | zdarzenia + wyszukiwanie przodka (`closest`) lub Context Protocol | `<slot>` |

## Zasady

- Część użyta poza rodzicem ma rzucić czytelny błąd („`Tabs.Trigger` musi być wewnątrz `Tabs`”).
- Wspieraj tryb kontrolowany i niekontrolowany (`value` + `onValueChange` vs `defaultValue`).
- Semantyka i klawiatura należą do biblioteki części: role `tablist`/`tab`/`tabpanel`, roving tabindex, strzałki
  (fe-web-platform, `.claude/skills/fe-web-platform/references/accessibility/keyboard-navigation.md`). Rozważ gotowe prymitywy headless
  (Radix, React Aria, Angular Aria/CDK, Ark UI) zamiast pisania od zera.

## Kiedy używać / kiedy NIE

Używaj, gdy komponent ma **kilka części konfigurowanych przez użytkownika** (zakładki, akordeon, menu, select,
dialog z nagłówkiem/stopką). Nie używaj dla prostego komponentu z 2–3 propsami — kontekst i kilka eksportów to
narzut bez zysku (YAGNI — eng-design-principles).

## Powiązane

- [Props and Attributes](props-and-attributes.md) — kiedy propsów robi się za dużo.
- [Presentational vs. Container](presentational-vs-container.md).
