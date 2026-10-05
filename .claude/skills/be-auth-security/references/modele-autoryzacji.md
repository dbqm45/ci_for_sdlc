# Modele autoryzacji — który wybrać

| Model | Decyzja na podstawie | Dobry dla | Ograniczenia |
|---|---|---|---|
| **RBAC** (role) | rola użytkownika → uprawnienia | większość aplikacji biznesowych, mało ról | eksplozja ról („kierownik oddziału Kraków”); nie wyraża „tylko swoje dokumenty” |
| **ABAC** (atrybuty) | atrybuty użytkownika, zasobu, akcji i kontekstu (dział, region, poziom poufności, godzina) | reguły typu „lekarz widzi pacjentów swojego oddziału” | reguły trudne do przeglądu i testów bez narzędzia |
| **ReBAC** (relacje) | graf relacji: właściciel, członek zespołu, udostępnione przez | współdzielenie dokumentów, organizacje i zespoły, hierarchie folderów | potrzebny magazyn relacji (np. w stylu Google Zanzibar: OpenFGA, SpiceDB) |
| **PBAC** (polityki) | polityki zapisane jako kod poza aplikacją, oceniane przez silnik | wiele usług z jednymi zasadami, audyt | dodatkowy komponent (np. OPA/Rego, Cedar), opóźnienie decyzji |
| **DAC** (uznaniowa) | właściciel zasobu decyduje, komu go udostępnia | udostępnianie plików między użytkownikami | trudno o centralną kontrolę i odebranie dostępu |
| **MAC** (obowiązkowa) | etykiety poufności nadawane centralnie, użytkownik ich nie zmienia | systemy rządowe i wojskowe, dane ściśle niejawne | sztywna; rzadko w aplikacjach biznesowych |

## Zasady niezależne od modelu
- Zacznij od RBAC z kontrolą własności zasobu w kodzie; dodaj atrybuty lub relacje, gdy pojawi się konkretny przypadek.
- Decyzja w jednym module lub usłudze (punkt decyzyjny), wywoływana przy **każdym** dostępie do obiektu — BOLA
  i IDOR to najczęstsze błędy API (be-api-design, `cykl-zycia-i-bezpieczenstwo.md`).
- **Zakresy OAuth** (scopes) ograniczają, co *aplikacja* może robić w imieniu użytkownika; nie zastępują sprawdzenia,
  co *użytkownik* może zrobić z konkretnym obiektem.
- Testy autoryzacji jako macierz: role lub relacje × akcje × „swój / cudzy obiekt”; zmiana uprawnień = PR z testami.
- Decyzje odmowy logowane (sygnał ataku), bez ujawniania w odpowiedzi, czy obiekt istnieje (404 zamiast 403, gdy to
  ważne).

## Źródła
- [roadmap.sh — API Design](https://roadmap.sh/api-design) (RBAC, ABAC, ReBAC, PBAC, DAC, MAC, scopes)
- [AWS IAM: ABAC](https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction_attribute-based-access-control.html),
  [Auth0: permissions, privileges and scopes](https://auth0.com/blog/permissions-privileges-and-scopes/)
Opisane własnymi słowami.
