# Wiele organizacji na jednej instalacji

Stan: 2026-11-09, zrobione (ten PR). Warunek T10 z `docs/BETA-PLAN.md` (zapisy do bety): zespoły bety pracują na
jednej instalacji, a żaden nie widzi przestrzeni, ludzi ani audytu innego. Wcześniej instalacja miała jedną
organizację (`docs/ACCOUNTS-PLAN.md`), a rola obowiązywała we wszystkich przestrzeniach.

## Model
- **Organizacja** (`orgs` w `_platform`): `id`, `name`, `createdAt`. Pierwsza (`homeOrgId`, powstaje przy pierwszym
  Ownerze) obejmuje przestrzenie bez własnej organizacji, w tym `default`, oraz połączenie z pdi.
- **Przestrzeń** ma `orgId` (w `workspaces.json`); brak = pierwsza organizacja, więc istniejące dane nie wymagają
  migracji. Przestrzeń założona przez osobę należy do jej organizacji.
- **Osoba** należy do jednej organizacji (członkostwo `userId`, `orgId`, `role`). Zaproszenie ma `orgId`; osoba,
  która już jest w organizacji, po otwarciu zaproszenia do innej zostaje w swojej.
- **Operator instalacji**: konto, którego e-mail jest w `CI_OPERATOR_EMAILS` (albo maszyna z `CI_ADMIN_TOKEN`). To nie
  rola w organizacji: operator może otwierać organizacje i widzieć ich listę.

## API
- `GET /api/orgs` (operator): organizacje z przestrzeniami, liczbą osób i otwartych zaproszeń.
- `POST /api/orgs` (operator) `{ name, workspace: { id, name? }, ownerEmail }`: nowa organizacja, jej pierwsza
  przestrzeń (tryb demo, jak świeża instalacja) i jednorazowe zaproszenie jako Owner na podany e-mail, ważne 7 dni.
  Link jest w odpowiedzi tylko raz. Zajęty `id` przestrzeni → 409. W trybie `token` trasa nie istnieje (404).
- `GET /api/auth/me` podaje też `user.operator`, `org` i `home` (przestrzeń, w której otwiera się aplikacja:
  `default`, gdy osoba ją widzi, inaczej pierwsza przestrzeń jej organizacji). UI przełącza się na `home`, gdy adres
  nie wskazuje przestrzeni.

## Widoczność (tryb `accounts`)
- Osoba widzi tylko przestrzenie swojej organizacji: `/api/workspaces` je filtruje, a trasy przestrzeni innej
  organizacji (`/api/w/:ws/…`, a dla `default` także `/api/…`) odpowiadają 404, jak nieznana przestrzeń.
- Osoby, zaproszenia, zmiana roli i usunięcie dotyczą tylko organizacji osoby; każda organizacja ma co najmniej
  jednego Ownera.
- Audyt zdarzeń organizacji (osoby, zaproszenia, przestrzenie) trafia do jej pierwszej przestrzeni; otwarcie
  organizacji jest też w audycie pierwszej organizacji (kto otworzył, dla kogo zaproszenie).
- Maszyny z tokenem (MCP, CLI, pdi) widzą wszystko, jak dotąd. Tryb `token` bez zmian.

## Ograniczenia
- **pdi należy do pierwszej organizacji:** gotowość zmian `CHG-n`, `gate.requested` i `gate.decided` liczą się tylko
  z jej przestrzeni; `/api/pdi`, `/api/changes` i prośba o zatwierdzenie odpowiadają 404 osobom innych organizacji.
  pdi per organizacja (własny adres i sekret) — gdy zespół spoza pierwszej organizacji będzie go potrzebował.
- Osoba w jednej organizacji; przejście do innej = usunięcie i nowe zaproszenie.
- Brak zmiany nazwy i usuwania organizacji (usunięcie danych klienta to T7).
- Identyfikatory przestrzeni są wspólne dla całej instalacji (zajęty `id` w innej organizacji też daje 409).

## Testy
`packages/server/test/organizations.test.ts` (ORG-01–11): otwarcie przez operatora i odmowa dla innych, dołączenie
Ownera i `home`, izolacja tras przestrzeni, przestrzeń tworzona w organizacji osoby, osoby i zaproszenia per
organizacja, ostatni Owner, audyt, pdi tylko w pierwszej organizacji, osoba zostaje w swojej organizacji, tryb
`token`. `packages/web/test/account.test.ts`: wybór przestrzeni startowej.
