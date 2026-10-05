# Separation of Concerns

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/separation-of-concerns.

Uwaga: ogólna definicja tego pojęcia jest już w `../principles.md` (fundament „Logical
Separation of Concerns” + zasada SoC z artykułu Hrynkevycha). Ten plik dodaje to, co konkretnie
wnosi strona frontendpatterns.dev: podział na warstwy (dane/logika/prezentacja/style) z pełnymi
przykładami before/after.

## Metadane

- **Kategoria:** Fundamentals
- **Poziom:** Beginner
- **Przykłady:** Native web
- **Data aktualizacji:** September 22, 2025
- **Autor:** Den Odell

## TLDR

„Organize code into layers (data, logic, presentation, styling) so changes in one area don't ripple through unrelated code.”

## Uwagi (stan 2026, poprawki względem źródła)

- Zasada jest agnostyczna (eng-design-principles); w Angularze warstwy to naturalnie serwis (dane) + czyste funkcje
  (reguły) + komponent (prezentacja) — fw-angular.
- W przykładach warstwy danych brakuje sprawdzenia `response.ok` (fe-web-platform) — dodaj je w realnym kodzie.
- Logika domenowa jako klasa niemutowalna (`Cart`) albo czyste funkcje — obie formy są dobre; ważne, by nie
  zależała od frameworka.

## Problem

Komponenty zawierające „500 lines of tangled spaghetti where API calls sit next to inline styles, business logic weaves through JSX, and validation rules hide between event handlers.” Efekt: trudności z ponownym użyciem kodu, testowaniem, pracą zespołową i utrzymaniem.

## Rozwiązanie

Podziel kod na warstwy: usługi API zwracające czyste dane, czyste funkcje dla reguł biznesowych, komponenty skupione wyłącznie na renderowaniu, i osobne pliki/moduły stylów.

## Przykłady kodu

### Podstawowy podział na warstwy

**❌ Wymieszane:**

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(data => {
        if (data.age >= 18) setUser(data);
      });
  }, [userId]);

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc' }}>
      {user && <h1>{user.name}</h1>}
    </div>
  );
}
```

**✅ Rozdzielone:**

```javascript
const userApi = {
  fetchUser: (id) => fetch(`/api/users/${id}`).then(r => r.json())
};

const userValidation = {
  canViewProfile: (user) => user.isActive && user.age >= 18
};

function UserProfile({ user }) {
  return (
    <div className="user-profile">
      <h1>{user.name}</h1>
    </div>
  );
}

function UserProfileContainer({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    userApi.fetchUser(userId).then(data => {
      if (userValidation.canViewProfile(data)) setUser(data);
    });
  }, [userId]);

  if (!user) return <div>Loading...</div>;
  return <UserProfile user={user} />;
}
```

### Rozdzielenie danych od prezentacji (pełny przykład z formularzem)

```javascript
// Data layer
class UserService {
  async getUser(id) {
    const response = await fetch(`/api/users/${id}`);
    const data = await response.json();
    return { id: data.user_id, name: data.full_name, email: data.email_address };
  }

  async updateUser(id, updates) {
    return fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  }
}

// Business logic
class UserValidator {
  static validate(user) {
    const errors = {};
    if (!user.name || user.name.length < 2) errors.name = 'Name must be at least 2 characters';
    if (!user.email?.includes('@')) errors.email = 'Valid email required';
    return { isValid: Object.keys(errors).length === 0, errors };
  }
}

// Presentation
function UserForm({ user, errors, onSubmit, onChange }) {
  return (
    <form onSubmit={onSubmit}>
      <input value={user.name} onChange={e => onChange('name', e.target.value)} />
      {errors.name && <span className="error">{errors.name}</span>}
      <input value={user.email} onChange={e => onChange('email', e.target.value)} />
      {errors.email && <span className="error">{errors.email}</span>}
      <button type="submit">Save</button>
    </form>
  );
}

// Container
function UserFormContainer({ userId }) {
  const [user, setUser] = useState({ name: '', email: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => { new UserService().getUser(userId).then(setUser); }, [userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = UserValidator.validate(user);
    if (!validation.isValid) { setErrors(validation.errors); return; }
    await new UserService().updateUser(userId, user);
  };

  return <UserForm user={user} errors={errors} onSubmit={handleSubmit}
    onChange={(field, value) => setUser(prev => ({ ...prev, [field]: value }))} />;
}
```

### Rozdzielenie logiki biznesowej od kodu frameworka

**❌ Wymieszane:**

```javascript
function useShoppingCart() {
  const [items, setItems] = useState([]);

  const addItem = (product) => {
    setItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id
          ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  return { items, addItem };
}
```

**✅ Rozdzielone — logika koszyka jako niezależna od Reacta klasa:**

```javascript
class Cart {
  constructor(items = []) { this.items = items; }

  addItem(product) {
    const existing = this.items.find(item => item.id === product.id);
    if (existing) {
      return new Cart(this.items.map(item => item.id === product.id
        ? { ...item, quantity: item.quantity + 1 } : item));
    }
    return new Cart([...this.items, { ...product, quantity: 1 }]);
  }

  getTotal() {
    return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}

function useShoppingCart() {
  const [cart, setCart] = useState(() => new Cart());
  return {
    items: cart.items,
    total: cart.getTotal(),
    addItem: (product) => setCart(prev => prev.addItem(product))
  };
}
```

### Rozdzielenie stylów od logiki komponentu

**❌ Wymieszane:**

```javascript
function Button({ onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white' }}>
      {children}
    </button>
  );
}
```

**✅ Rozdzielone (CSS Modules):**

```javascript
import styles from './Button.module.css';

function Button({ onClick, children }) {
  return <button onClick={onClick} className={styles.button}>{children}</button>;
}

/* Button.module.css */
.button { padding: 10px 20px; background-color: #007bff; color: white; }
.button:hover { background-color: #0056b3; }
```

## Zalety

- „When I open a file, I know exactly what I'm looking at—it's handling data, managing business rules, or rendering UI, not all three.”
- Testowanie staje się prostsze — każda warstwa testowalna niezależnie.
- Kod jest faktycznie wielokrotnie używalny (czysta funkcja walidacji działa w każdym kontekście).
- „Changes stop cascading. Update how data is fetched without touching components” — zmiana warstwy danych nie wymaga dotykania komponentów UI.
- Zespoły mogą pracować równolegle na różnych warstwach bez wchodzenia sobie w drogę.

## Wady / tradeoffs

- „More files means more cognitive overhead navigating between layers” — więcej plików do otworzenia, żeby zrozumieć jedną funkcjonalność.
- Zespół musi wspólnie uzgodnić, gdzie leżą granice warstw — inaczej podział będzie niekonsekwentny.
- Konflikt między separacją warstw a kolokacją kodu (trzymaniem powiązanych rzeczy blisko siebie) — to są przeciwstawne siły, nie da się zmaksymalizować obu naraz.
- „Debugging gets trickier when bugs span multiple layers” — błąd przechodzący przez trzy warstwy wymaga śledzenia go przez trzy pliki.
- Idealna separacja jest niemożliwa/nieopłacalna w praktyce — zawsze jest jakiś kompromis.
- Komponent-koordynator (container) może z czasem stać się mini God Objectem, jeśli koordynuje zbyt wiele warstw naraz.

## Powiązane wzorce

- [Single Responsibility](single-responsibility.md) — Fundamentals.
- [Presentational vs. Container](../components/presentational-vs-container.md) — Components.
- Separation of Concerns — Wikipedia.
- MVC Pattern — Wikipedia.
- SOLID — Wikipedia.

## Kiedy używać / kiedy NIE używać

Warstwuj kod (dane/logika/prezentacja/style) wtedy, gdy te warstwy realnie zmieniają się **z różną częstotliwością i z różnych powodów** — to jest sedno SoC, nie podział „dla porządku”. Jeśli logika walidacji zmienia się niezależnie od tego, jak wygląda formularz, rozdzielenie ich się opłaca.

Dla bardzo małego, jednorazowego komponentu (jeden plik, kilkanaście linii, bez planów rozwoju) pełne rozbicie na 4 warstwy jest przesadą — koszt indirekcji (więcej plików, więcej importów) przewyższa zysk. Znajdź poziom separacji proporcjonalny do realnej złożoności i przewidywanej zmienności kodu, nie maksymalny teoretycznie możliwy.
