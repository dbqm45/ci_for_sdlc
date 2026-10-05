---
name: tool-nx
description: Użyj przy monorepo Nx — projekty i biblioteki, tagi i granice modułów, generatory, cache, affected, release, migrate.
metadata:
  katalog: "Użyj w monorepo Nx — struktura projektów i bibliotek, tagi i granice modułów, generatory, zadania i cache, affected, nx release, migracje (nx migrate). Także przy odwzorowaniu granic kontekstów DDD na biblioteki Nx. Nie do konwencji frameworka (fw-*) ani języka (lang-*)."
---

# Nx (monorepo)

## Zasady
1. **Aplikacje są cienkie, logika w bibliotekach.** Aplikacja składa trasy i konfigurację; kod funkcji, domeny i UI żyje w `libs/`.
2. **Tagi i granice modułów są obowiązkowe.** Każdy projekt ma tagi co najmniej w dwóch osiach:
   `scope:<obszar>` (kontekst/domena) i `type:<rodzaj>` (feature, ui, data-access, domain, util). Reguła
   `@nx/enforce-module-boundaries` (ESLint) pilnuje dozwolonych zależności — nie wyłączaj jej komentarzem.
3. **Uruchamiaj tylko to, co zmienione:** `nx affected -t lint test build` lokalnie i w CI; `nx run-many` tylko świadomie.
4. **Cache jest kontraktem:** zadania deterministyczne, poprawne `inputs`/`outputs` w `targetDefaults` lub w pluginach;
   zadanie czytające niezadeklarowane pliki = błędny cache.
5. **Zadania wnioskowane przez pluginy** (`nx.json → plugins`) zamiast ręcznego kopiowania targetów do każdego `project.json`.
6. **Generatory zamiast kopiowania:** `nx g @nx/angular:library …` (albo generator własny w repo) — spójne tagi i struktura.
7. **Migracje przez `nx migrate`:** `npx nx migrate latest` → przegląd `migrations.json` → `npx nx migrate --run-migrations`;
   podnosi Nx i powiązane frameworki razem (np. Angular). Nie mieszaj ręcznych bumpów wersji z migracjami.
8. **Wydania:** `nx release` (wersjonowanie, changelog z Conventional Commits — core-conventional-commits, publikacja).
9. **Graf projektu** (`nx graph`) to pierwsze źródło prawdy o zależnościach przy analizie architektury.

## Pojęcia domenowe w Nx
| Pojęcie | Odwzorowanie w Nx |
|---|---|
| **moduł / bounded context** | grupa bibliotek z tagiem `scope:<kontekst>`; zależności między kontekstami tylko przez biblioteki publiczne (np. `type:api`) |
| **krawędź modułu (mały interfejs)** | biblioteka `type:api`/`feature` z wąskim `index.ts`; reszta kontekstu niedostępna dla innych `scope:` |
| **warstwa domeny** | biblioteka `type:domain` — bez zależności od frameworka i od `data-access` |
| **repozytorium / port** | interfejs w `type:domain`, implementacja w `type:data-access` |
| **read model / UI** | `type:data-access` (stan, zapytania) + `type:ui` (komponenty prezentacyjne) |
| **Shared Kernel** | biblioteka `scope:shared` — minimalna, z właścicielem, zmiany konsultowane |
| **ACL** | biblioteka `type:data-access` w kontekście odbiorcy tłumacząca kontrakt obcego kontekstu |

Przykładowe ograniczenia (`eslint.config.mjs`):
```js
depConstraints: [
  { sourceTag: 'type:feature',     onlyDependOnLibsWithTags: ['type:ui', 'type:data-access', 'type:domain', 'type:util'] },
  { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
  { sourceTag: 'type:domain',      onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
  { sourceTag: 'scope:booking',    onlyDependOnLibsWithTags: ['scope:booking', 'scope:shared'] },
]
```

## Zależne od wersji
| Wersja | Co się zmieniło |
|---|---|
| 21 | punkt odniesienia: zadania wnioskowane przez pluginy, `nx release`, Terminal UI |
| 22 | cache w bazie danych obowiązkowy (`NX_DISABLE_DB` usunięte); `createNodes` v1 wycofane na rzecz `createNodesV2`; usunięte stare wersjonowanie `nx release`; npm bez wymuszania `--legacy-peer-deps`; eksperymentalne wsparcie Maven, plugin `@nx/dotnet` |
| 23 | minimalny Node 22 LTS; operator `...` w targetach rozszerza odziedziczone `targetDefaults` zamiast je zastępować; migracje „agentowe” (generator, prompt lub hybryda); sandboxing zadań (weryfikacja odczytów/zapisów względem inputs/outputs); Vitest wydzielony do `@nx/vitest`; usunięte m.in. generatory Angular NgRx i `move`; `@nx/dotnet` stabilny |
| 23.1 | wsparcie Angular 22 (Angular 19 już niewspierany), TypeScript 6 (TS 7 obok TS 6, bo brak API programistycznego w TS 7); `targetDefaults` jako uporządkowana tablica z filtrami; ESLint 9 wymagany; raporty wydajności po każdym uruchomieniu |

## Checklista
- [ ] każdy projekt ma tagi `scope:` i `type:`; lint granic przechodzi
- [ ] CI używa `nx affected` i zdalnego cache
- [ ] aktualizacje przez `nx migrate`, nie ręczne bumpy
