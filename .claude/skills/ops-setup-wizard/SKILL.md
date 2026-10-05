---
name: ops-setup-wizard
description: Użyj, gdy człowiek musi ręcznie skonfigurować klucze w panelach lub sekrety CI — interaktywny skrypt bash.
metadata:
  katalog: "Użyj, gdy człowiek musi ręcznie przejść procedurę, której agent nie może lub nie powinien wykonać — klucze i konta w panelach usług zewnętrznych, sekrety CI, jednorazowa migracja lub przełączenie. Agent pisze interaktywny skrypt bash (kreator), człowiek go uruchamia, sekrety omijają kontekst modelu. Nie do kroków, które agent zrobi sam, ani decyzji architektonicznych."
---

# Kreator konfiguracji (skrypt dla człowieka)

Kreator to skrypt bash, który prowadzi człowieka krok po kroku: otwiera właściwą stronę, mówi, co kliknąć i skopiować,
przyjmuje wartość, zapisuje ją tam, gdzie trzeba (`.env`, sekret lub zmienna GitHub Actions), pyta o potwierdzenie przed
nieodwracalnym krokiem i pokazuje postęp. **Agent go pisze, ale nigdy nie uruchamia** — klucze wpisuje człowiek, bez echa,
więc nie trafiają do kontekstu modelu (o ile nikt nie wklei ich do rozmowy — ostrzeż przed tym).

Szablon: `scripts/kreator.template.sh` (postęp z szacunkiem czasu, potwierdzenia, otwieranie URL także w WSL, ukryty wpis
sekretów, idempotentny zapis do `.env` z prawami 600, `gh secret`/`gh variable` przez stdin, podsumowanie z listą rzeczy
do zrobienia ręcznie). Bibliotekę nad znacznikiem `### ETAPY ###` zostawiasz bez zmian — piszesz tylko etapy.

## Procedura
1. **Zakres z repozytorium, nie z pytań.** Przeczytaj `.env.example`, nazwy kluczy w `.env*` (bez wartości — zasada
   stała), `docker-compose*`, konfigurację frameworka, `.github/workflows/*` (każde `secrets.X` i `vars.X` to wartość, którą
   kreator musi wytworzyć). Przy migracji: stan obecny, stan docelowy i nieodwracalne kroki między nimi.
2. **Lista etapów do zatwierdzenia** — w kolejności zależności. Dla każdej wartości: skąd człowiek ją weźmie, dokąd trafi,
   czy jest tajna:
   | Kto potrzebuje | Cel |
   |---|---|
   | tylko lokalny development | `.env` |
   | CI, wartość tajna | sekret GitHub |
   | CI, wartość jawna | zmienna GitHub |
   | development i CI | `.env` + sekret |
   | nic (sama czynność: przełącznik, zmiana planu) | nigdzie |
   Człowiek może dodać, usunąć lub przestawić etapy.
3. **Ścieżka w każdym etapie**: URL i dokładna droga („Panel → Developers → API keys → Reveal → skopiuj”). Nie znasz
   aktualnego wyglądu panelu lub polecenia → sprawdź dokumentację (`researcher`) albo zapytaj; **nie wymyślaj kroków**.
4. **Napisz kreator**: skopiuj szablon do `scripts/` (jednorazowy) albo w miejsce wskazane przez człowieka. Jeden etap =
   jedna czynność mieszcząca się na ekranie. Najpierw `open_url`, potem `ask`/`ask_secret`; `ask_secret` dla wszystkiego,
   co tajne; `write_env` dla każdej zapisywanej wartości; `set_secret` tylko dla tego, czego CI naprawdę używa; `confirm`
   przed każdym nieodwracalnym krokiem. Ustaw `TOTAL_STAGES`.
5. **Sprawdź statycznie**: `bash -n`, `shellcheck` (jeśli jest), `chmod +x`. Prześledź: każda wartość z kroku 2 jest
   pobierana i trafia tam, gdzie miała; każda nazwa w `set_secret` zgadza się z `secrets.*` w workflow. Nie uruchamiasz
   (otwiera przeglądarkę i czeka na człowieka).
6. **Przekaż**: jak uruchomić; `.env` jest w `.gitignore`. Kreator jednorazowy usuwa się po użyciu; powtarzalny (wdrożenie
   nowej osoby) — commit i link w README, zamiast instrukcji do przeklejania.

## Zasady bezpieczeństwa
- Hook i tak blokuje agentowi odczyt `.env*`; kreator nie wypisuje sekretów na ekran ani do logów.
- Wartości do `gh` idą przez stdin, nie w argumentach (argumenty widać w liście procesów).
- Żadnych `curl | sh` ani pobierania skryptów w kreatorze; instalację narzędzi opisujesz jako krok ręczny. <!-- audit-ok: opis ataku, nie polecenie -->
- Kreator zna tylko stan repozytorium, nie stan usługi zewnętrznej: etap, który mógł już zostać zrobiony (konto, klucz),
  pyta „masz już?” i pozwala pominąć; podsumowanie wymienia rzeczy pominięte i do zrobienia ręcznie.
- Ponowne uruchomienie podstawia zapisane wartości jako domyślne; nie ma „cofnij” — przerwij (Ctrl-C) i uruchom ponownie.

## Źródło
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), skill `wizard`; opis:
[aihero.dev](https://www.aihero.dev/skills-wizard). Procedura opisana własnymi słowami, szablon napisany od nowa.
