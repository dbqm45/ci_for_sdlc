# Single Responsibility

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/single-responsibility.

Uwaga: ogólna definicja jest już w `../principles.md`. Ten plik dodaje to, co konkretnie
wnosi strona frontendpatterns.dev: pełny przykład „before/after” rozbicia komponentu na jednostki
o jednej odpowiedzialności.

## Metadane

- **Kategoria:** Fundamentals
- **Poziom:** Beginner
- **Przykłady:** React
- **Data aktualizacji:** September 22, 2025
- **Autor:** Den Odell

## TLDR

„Give each function, component, and module one job describable in a single sentence without using 'and'.”

## Uwagi (stan 2026, poprawki względem źródła)

- Test „jednego zdania bez «i»” jest agnostyczny; ogólne SRP — eng-design-principles, nazewnictwo — eng-clean-code.
- Kopiowanie danych z serwera do lokalnego stanu formularza przez `useEffect` (przykład „Po”) to znany antywzorzec
  React — lepiej zainicjować formularz kluczem (`key={user.id}`) albo osobnym komponentem formularza.

## Problem

„Kitchen sink components” — komponenty łączące naraz pobieranie danych, walidację, formatowanie dat, logikę autoryzacji i renderowanie wielu sekcji UI. Utrudnia to testowanie, współpracę zespołową i debugowanie — zmiana jednej odpowiedzialności wymaga przebrnięcia przez wszystkie inne.

## Rozwiązanie

Każdy element kodu (funkcja, komponent, moduł) powinien mieć jedną odpowiedzialność, opisywalną w jednym zdaniu bez słowa „i”. Rozdziel pobieranie danych od walidacji, formatowania i logiki dostępu — każda z tych rzeczy zmienia się z innego powodu i w innym czasie.

## Przykłady kodu

### Przed: wiele odpowiedzialności naraz

```javascript
// ❌ Everything crammed into one component
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  // Data fetching
  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(data => { setUser(data); setLoading(false); });
  }, [userId]);

  // Validation
  const validateForm = (data) => {
    const errs = {};
    if (!data.email.includes('@')) errs.email = 'Invalid email';
    if (data.age < 18) errs.age = 'Must be 18+';
    return errs;
  };

  // Formatting
  const formatDate = (date) => new Date(date).toLocaleDateString('en-US');

  // Auth logic
  const canEdit = () => user.role === 'admin' || user.id === currentUserId;

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateForm(user);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await fetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(user) });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="profile">
      <h1>{user.name}</h1>
      <p>Joined: {formatDate(user.createdAt)}</p>
      {canEdit() && (
        <form onSubmit={handleSubmit}>
          <input value={user.email} onChange={e => setUser({...user, email: e.target.value})} />
          {errors.email && <span>{errors.email}</span>}
          <button>Save</button>
        </form>
      )}
    </div>
  );
}
```

### Po: jedna odpowiedzialność na jednostkę kodu

```javascript
// ✅ Hook: data fetching only
function useUser(userId) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(data => { setUser(data); setLoading(false); });
  }, [userId]);

  return { user, loading };
}

// ✅ Pure functions: one job each
const validateUserForm = (data) => {
  const errors = {};
  if (!data.email?.includes('@')) errors.email = 'Invalid email';
  if (data.age < 18) errors.age = 'Must be 18+';
  return errors;
};

const formatDate = (date) => new Date(date).toLocaleDateString('en-US');
const canEditProfile = (user, currentUserId) => user.role === 'admin' || user.id === currentUserId;
const updateUser = (userId, data) => fetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) });

// ✅ Component: display only
function UserInfo({ user }) {
  return (
    <div>
      <h1>{user.name}</h1>
      <p>Joined: {formatDate(user.createdAt)}</p>
    </div>
  );
}

// ✅ Component: form only
function UserEditForm({ user, errors, onSubmit, onChange }) {
  return (
    <form onSubmit={onSubmit}>
      <input value={user.email} onChange={e => onChange('email', e.target.value)} />
      {errors.email && <span>{errors.email}</span>}
      <button type="submit">Save</button>
    </form>
  );
}

// ✅ Container: coordinates the pieces
function UserProfile({ userId, currentUserId }) {
  const { user, loading } = useUser(userId);
  const [editedUser, setEditedUser] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => { if (user) setEditedUser(user); }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateUserForm(editedUser);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    await updateUser(userId, editedUser);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="profile">
      <UserInfo user={user} />
      {canEditProfile(user, currentUserId) && (
        <UserEditForm
          user={editedUser}
          errors={errors}
          onSubmit={handleSubmit}
          onChange={(field, val) => setEditedUser(prev => ({ ...prev, [field]: val }))}
        />
      )}
    </div>
  );
}
```

### Na poziomie funkcji

```javascript
// ❌ Fetching AND transforming
async function getUserData(userId) {
  const response = await fetch(`/api/users/${userId}`);
  const data = await response.json();
  return {
    ...data,
    fullName: `${data.firstName} ${data.lastName}`,
    age: new Date().getFullYear() - new Date(data.birthDate).getFullYear()
  };
}

// ✅ Separate concerns
async function fetchUser(userId) {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

function transformUser(userData) {
  return {
    ...userData,
    fullName: `${userData.firstName} ${userData.lastName}`,
    age: new Date().getFullYear() - new Date(userData.birthDate).getFullYear()
  };
}

// Usage
const rawUser = await fetchUser(userId);
const user = transformUser(rawUser);
```

## Zalety

- Natychmiastowa przejrzystość — zrozumienie celu każdego pliku zajmuje sekundy.
- Proste testowanie — pojedyncza odpowiedzialność, bez złożonego setupu mocków.
- Zawarte (nierozprzestrzeniające się) zmiany — modyfikacja walidacji nie wpływa na resztę kodu.
- Faktyczne ponowne użycie — funkcja formatująca datę działa wszędzie, niezależnie od kontekstu.
- Szybsze debugowanie — błąd formatowania daty oznacza sprawdzenie jednego, konkretnego pliku.
- Praca równoległa — zespoły mogą pracować na różnych odpowiedzialnościach bez konfliktów w tych samych plikach.

## Wady / tradeoffs

- Więcej plików — zwiększona nawigacja i liczba importów do zarządzania.
- Trudniejszy do śledzenia przepływ — zrozumienie „co się dzieje” wymaga przejścia przez więcej miejsc.
- Subiektywne granice — co dokładnie znaczy „jedna odpowiedzialność” bywa dyskusyjne w praktyce.
- Łatwo przesadzić — ryzyko „trójliniowej funkcji w osobnym pliku” (nadmierne rozdrobnienie bez realnego zysku).
- Koszt onboardingu — nowe osoby w zespole muszą nauczyć się konwencji podziału, zanim się w niej odnajdą.
- Wymaga wyrównania zespołu — bez ustalonych, spisanych granic, podział będzie niekonsekwentny między różnymi osobami.

## Powiązane wzorce

- [Separation of Concerns](separation-of-concerns.md) — Fundamentals.
- [Presentational vs. Container](../components/presentational-vs-container.md) — Components.
- Single Responsibility Principle — Wikipedia.
- SOLID Principles — Wikipedia.
- Clean Code Principles — freeCodeCamp.

## Kiedy używać / kiedy NIE używać

Stosuj ten test wprost: jeśli opis funkcji/komponentu potrzebuje słowa „i” („pobiera dane **i** je formatuje **i** waliduje”), to jest sygnał do rozbicia — dokładnie tak, jak formułuje to TLDR tej strony.

Nie doprowadzaj tego do granicy absurdu — funkcja trzyliniowa nie musi mieć własnego pliku/modułu, jeśli nigdzie indziej nie jest reużywana i nie ma osobnego powodu do zmiany. Rozbijaj tam, gdzie odpowiedzialności realnie zmieniają się w różnym czasie/z różnych przyczyn, nie mechanicznie przy każdej okazji (patrz też krytyka nadużywania rozdrobnienia w eng-design-principles).
