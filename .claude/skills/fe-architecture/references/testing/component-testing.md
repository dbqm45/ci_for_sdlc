# Component Testing

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/component-testing.

## Metadane

- **Kategoria:** Testing
- **Poziom:** Intermediate
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 29 listopada 2025
- **Autor:** Den Odell

## TLDR

„Test components by rendering them, simulating user interactions, and asserting on the resulting
output rather than implementation details.”

## Uwagi (stan 2026, poprawki względem źródła)

- Strategia (trofeum testów, co testować, dublery) — eng-testing; wybór przypadków — qa-test-design; narzędzia —
  tool-vitest (także tryb przeglądarki), tool-jest, tool-playwright (e2e, migawki dostępności).
- Przykłady używają `jest.fn()`; w Vitest to `vi.fn()` / `vi.spyOn()` — API zgodne.
- Preferuj `userEvent` nad `fireEvent` (realistyczna sekwencja zdarzeń) i zapytania wg ról/etykiet
  (`getByRole`, `getByLabelText`) nad `getByText`/selektorami CSS.
- Mock `fetch` musi mieć `ok: true` (i `status`), jeśli komponent sprawdza `response.ok` — poprawiono. Lepiej
  mockować sieć na poziomie HTTP (MSW) niż `global.fetch`.
- Svelte 5: `component.$set` nie istnieje — użyj `rerender({ … })` z `@testing-library/svelte`. Poprawiono.
- Angular: `TestBed` + Angular Testing Library (`render(Component, { inputs })`), `provideHttpClientTesting()`;
  w zoneless — `await fixture.whenStable()` (fw-angular).
- Snapshoty całych drzew są kruche — jeśli już, to małe, celowane (`toMatchInlineSnapshot`) lub migawki ARIA
  (Playwright `toMatchAriaSnapshot`).

## Problem

Deweloperzy testują komponenty ręcznie, co prowadzi do przeoczenia stanów błędów, pustych stanów i
przypadków granicznych. Brak testów automatycznych czyni każdy refaktor ryzykownym — zmiana w
komponencie współdzielonym może zepsuć wiele stron bez wiedzy zespołu.

## Rozwiązanie

Testy renderują komponent, symulują interakcję użytkownika i sprawdzają wynik — ścieżkę szczęśliwą,
błędy, stany ładowania, przypadki graniczne. Kluczowa idea z Testing Library: testować komponent tak,
jak go faktycznie używa użytkownik — wyszukiwać elementy po dostępnych nazwach (role/label), symulować
kliknięcia i wpisywanie, sprawdzać widoczną treść, nie szczegóły implementacji. Mockowanie API
utrzymuje testy szybkimi i deterministycznymi.

## Przykłady kodu

### Basic Component Testing — React

```javascript
import { render, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('button calls onClick when clicked', () => {
  const handleClick = jest.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  fireEvent.click(screen.getByText('Click me'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('form submission with user input', async () => {
  const handleSubmit = jest.fn();
  const user = userEvent.setup();
  render(<LoginForm onSubmit={handleSubmit} />);

  await user.type(screen.getByLabelText('Email'), 'user@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: /log in/i }));

  expect(handleSubmit).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'password123'
  });
});
```

### Basic Component Testing — Vue

```javascript
import { mount } from '@vue/test-utils';
import Button from './Button.vue';

test('button calls onClick when clicked', async () => {
  const handleClick = jest.fn();
  const wrapper = mount(Button, {
    props: { onClick: handleClick },
    slots: { default: 'Click me' }
  });

  await wrapper.find('button').trigger('click');
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('form emits submit event with input data', async () => {
  const wrapper = mount(LoginForm);

  await wrapper.find('input[type="email"]').setValue('user@example.com');
  await wrapper.find('input[type="password"]').setValue('password123');
  await wrapper.find('form').trigger('submit.prevent');

  expect(wrapper.emitted('submit')[0]).toEqual([{
    email: 'user@example.com',
    password: 'password123'
  }]);
});
```

### Basic Component Testing — Svelte

```javascript
import { render, fireEvent, screen } from '@testing-library/svelte';
import Button from './Button.svelte';

test('button calls onClick when clicked', async () => {
  const handleClick = jest.fn();
  render(Button, { props: { onClick: handleClick } });

  await fireEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

test('reactive statement updates display', async () => {
  const { rerender } = render(Counter, { props: { count: 0 } });
  expect(screen.getByText('Count: 0')).toBeInTheDocument();

  await rerender({ count: 5 }); // Svelte 5: no component.$set
  expect(screen.getByText('Count: 5')).toBeInTheDocument();
});
```

### Basic Component Testing — Web Components

```javascript
describe('Button component', () => {
  let button;

  beforeEach(() => {
    button = document.createElement('custom-button');
    document.body.appendChild(button);
  });

  afterEach(() => {
    document.body.removeChild(button);
  });

  test('button calls onClick when clicked', () => {
    const handleClick = jest.fn();
    button.addEventListener('click', handleClick);
    button.click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('button updates text when attribute changes', () => {
    button.setAttribute('label', 'New Label');
    expect(button.shadowRoot.querySelector('button').textContent).toBe('New Label');
  });
});
```

### Testing Async Behavior

```javascript
test('displays user data after loading', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 1, name: 'John Doe' })
  });

  render(<UserProfile userId={1} />);
  expect(screen.getByText('Loading...')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
  global.fetch.mockRestore();
});

test('displays error message on failure', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Failed to fetch'));
  render(<UserProfile userId={1} />);

  await waitFor(() => {
    expect(screen.getByText('Failed to load user')).toBeInTheDocument();
  });
  global.fetch.mockRestore();
});
```

### Testing Component State Changes

```javascript
test('counter increments when button is clicked', () => {
  render(<Counter initialCount={0} />);
  const button = screen.getByRole('button', { name: /increment/i });

  fireEvent.click(button);
  expect(screen.getByText('Count: 1')).toBeInTheDocument();

  fireEvent.click(button);
  expect(screen.getByText('Count: 2')).toBeInTheDocument();
});
```

### Testing with Mock Providers

```javascript
test('component uses context value', () => {
  const mockContext = { user: { name: 'John' } };

  render(
    <UserContext.Provider value={mockContext}>
      <UserGreeting />
    </UserContext.Provider>
  );

  expect(screen.getByText('Hello, John')).toBeInTheDocument();
});
```

### Testing Error Boundaries

```javascript
test('error boundary catches component errors', () => {
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
  const ThrowError = () => { throw new Error('Test error'); };

  render(
    <ErrorBoundary fallback={<div>Error occurred</div>}>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText('Error occurred')).toBeInTheDocument();
  consoleSpy.mockRestore();
});
```

### Accessibility Testing

```javascript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('button has no accessibility violations', async () => {
  const { container } = render(<Button>Click me</Button>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('form labels are associated with inputs', () => {
  render(<LoginForm />);
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
});
```

### Snapshot Testing

```javascript
test('component renders correctly', () => {
  const { container } = render(<Card title="Test" content="Content" />);
  expect(container.firstChild).toMatchSnapshot();
});
```

### Testing Custom Hooks (React)

```javascript
import { renderHook, act } from '@testing-library/react';

test('useCounter increments count', () => {
  const { result } = renderHook(() => useCounter(0));
  expect(result.current.count).toBe(0);

  act(() => result.current.increment());
  expect(result.current.count).toBe(1);
});
```

## Zalety

- Regresje wychwytywane przed produkcją — błędy znalezione wcześniej kosztują mniej.
- Refaktoryzacja staje się bezpieczna, bo testy ją asekurują.
- Testy działają jako dokumentacja dla nowych osób w zespole.
- Skraca się czas ręcznej kontroli jakości.
- Pisanie testów wymusza myślenie o przypadkach granicznych z góry.
- Komponenty stają się lepiej zaprojektowane — te trudne do przetestowania zwykle mają problem
  projektowy, nie tylko testowy.

## Wady / tradeoffs

- Pisanie dokładnych testów potrafi podwoić wstępny czas rozwoju.
- Testowanie szczegółów implementacji (nie zachowania) tworzy kruche testy, które łamią się przy
  każdym refaktorze.
- Zielone testy nie oznaczają, że kod działa — nierealistyczne mocki dają fałszywą pewność.
- Mockowanie dodaje złożoność i może maskować problemy integracji.
- Wolne zestawy testów zabijają produktywność zespołu.
- Testy snapshot psują się przy nieszkodliwych zmianach formatowania.
- Testowanie asynchroniczności jest realnie trudne — `waitFor`/`act` mają subtelne zachowanie
  czasowe.
- Decyzja, co testować, wymaga osądu — zbyt wiele testów jednostkowych daje kruchość, zbyt mało
  przegapia ważne przypadki.
- Nieaktualne, niepilnowane testy są gorsze niż brak testów — dają fałszywe poczucie
  bezpieczeństwa.

## Powiązane wzorce

- Testing Library Documentation (React).
- Vue Test Utils.
- Svelte Testing Library.
- Component Testing — Cypress.

## Kiedy używać / kiedy NIE używać

Testuj zachowanie z perspektywy użytkownika (co widzi, co może kliknąć/wpisać) domyślnie dla każdego
komponentu z realną logiką (warunki, stany, interakcje) — to jest ta granica, gdzie ręczne testowanie
manualne systematycznie przeocza przypadki graniczne. **Nie** testuj szczegółów implementacji
(wewnętrzny stan, nazwy zmiennych, struktura wewnętrzna) — to dokładnie ten typ testu, który się
łamie przy każdym nieszkodliwym refaktorze i w efekcie zniechęca zespół do testowania, zamiast
budować zaufanie do niego.
