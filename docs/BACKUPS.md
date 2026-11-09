# Kopie bazy poza Render (T5) — konfiguracja i odtwarzanie

Stan: 2026-11-09. Decyzja właściciela: **Backblaze B2, region EU Central (Amsterdam)**. Render sam odtwarza bazę do
punktu w czasie, ale tylko z ostatnich 3 dni (Hobby) i tylko u siebie. Ta kopia chroni przed tym, czego tamto nie
obejmuje: błędem zauważonym później, usuniętą bazą albo utraconym kontem Render.
Wdrożenie: [`DEPLOYMENT.md`](DEPLOYMENT.md); plan: [`BETA-PLAN.md`](BETA-PLAN.md) §4, T5.

## 1. Jak to działa

- **Codziennie o 02:17 UTC** zadanie cykliczne `quorum-backup` w Render (`render.yaml`, ten sam obraz co aplikacja)
  uruchamia `packages/server/src/backup-cli.ts`.
- **Co trafia do kopii:** `default`, `_platform` (konta, organizacje, zgłoszenia do bety, pomiar użycia) i każda
  przestrzeń z listy `workspaces.json`, każdy dokument i każdy log. Przestrzenie usunięte (zarchiwizowane jako
  `deleted:<id>-<czas>`) nie trafiają do kopii.
- **Dlaczego nie `pg_dump`:** tabele mają wymuszone zabezpieczenie na poziomie wierszy (`FORCE ROW LEVEL SECURITY`),
  więc rola aplikacji bez ustawionej przestrzeni nie widzi żadnego wiersza i `pg_dump` zrobiłby pustą kopię. Kopia
  czyta więc każdą przestrzeń w jej własnym zakresie, tą samą rolą co aplikacja — nie potrzeba roli z `BYPASSRLS`.
- **Szyfrowanie:** dokumenty zaszyfrowane kluczem `CI_ENCRYPTION_KEY` zostają w kopii zaszyfrowane. Całość jest
  kompresowana i szyfrowana (AES-256-GCM) kluczem `BACKUP_ENCRYPTION_KEY` **przed** wysłaniem; B2 dostaje tylko
  zaszyfrowany plik. Przed wysłaniem zadanie sprawdza, że zaszyfrowaną kopię da się otworzyć.
- **Gdzie:** `daily/<data>.qbk` co dzień, a pierwszego dnia miesiąca także `monthly/<miesiąc>.qbk`.
- **Blokada:** każdy plik jest zablokowany w trybie *compliance* — dzienne na 35 dni, miesięczne na 100 dni
  (`BACKUP_DAILY_DAYS`, `BACKUP_MONTHLY_DAYS`). Do tego czasu nikt, także właściciel klucza ani konta, nie usunie
  ani nie nadpisze pliku.
- **Błąd:** zadanie kończy się kodem 1, Render oznacza przebieg jako nieudany i wysyła powiadomienie. W logu jest
  jedna linia JSON z liczbami (przestrzenie, dokumenty, wpisy), nigdy treść ani klucz.
- **Koszt:** zadanie trwa kilka sekund dziennie (Render liczy cron za minutę, ok. $0,00016). Kopia jednego czy kilku
  zespołów to kilobajty do kilkudziesięciu MB, więc 35 dziennych i kilka miesięcznych mieści się w darmowych 10 GB B2.

## 2. Konfiguracja (raz)

Krok po kroku w [`DEPLOYMENT.md`](DEPLOYMENT.md): klucz kopii (krok 0.3), konto i bucket B2 z Object Lock, reguły
czyszczenia i klucz dostępu (krok 4), zmienne usługi `quorum-backup` (krok 6), pierwszy przebieg i próba odtworzenia
(krok 10). Dopisz B2 do listy podprzetwarzających w DPA: kopia zawiera dane osobowe (e-maile kont, zgłoszenia do bety),
choć zaszyfrowane.

## 3. Próba odtworzenia (przed pierwszym zespołem i raz w trakcie bety)

Kopia, której nikt nie odtworzył, nie jest kopią. Próba odtwarza kopię do **pustej, tymczasowej** bazy na Twoim
komputerze, czyta ją z powrotem i porównuje z kopią dokument po dokumencie. Produkcyjnej bazy nie dotyka: adres
równy `CI_DATABASE_URL` jest odrzucany, a baza z jakimikolwiek danymi też.

```bash
# 1. Pusta baza (Docker), wyrzucana po próbie:
docker run --rm -d --name quorum-restore -p 54330:5432 -e POSTGRES_PASSWORD=restore-throwaway postgres:17

# 2. Klucze z menedżera haseł do zmiennych tej sesji terminala (nie do plików):
export BACKUP_ENCRYPTION_KEY=…  B2_ENDPOINT=https://s3.eu-central-003.backblazeb2.com  B2_BUCKET=…
export B2_KEY_ID=…  B2_APPLICATION_KEY=…
export RESTORE_DATABASE_URL=postgres://postgres:restore-throwaway@localhost:54330/postgres

# 3. Najnowsza dzienna kopia (albo podaj klucz, np. monthly/2026-12.qbk, albo ścieżkę pobranego pliku):
npm run restore-check --prefix packages/server
```

Wynik `OK: daily/<data>.qbk (made …) restored: N spaces, N documents, N log entries, all as in the backup.`
oznacza, że kopia się otwiera i odtwarza w całości. Ostatni krok sprawdza zaszyfrowane dokumenty — uruchom
aplikację na odtworzonej bazie z kluczem produkcyjnym (bez `NODE_ENV=production`, bo baza z Dockera używa
superużytkownika):

```bash
CI_DATABASE_URL=$RESTORE_DATABASE_URL CI_ENCRYPTION_KEY=… npm start
```

i otwórz `http://localhost:4317`: przestrzenie, decyzje i ustawienia mają być widoczne. Potem `docker stop
quorum-restore` i zapisz datę próby w tabeli niżej.

| Data próby | Kopia | Wynik | Kto |
|---|---|---|---|
| _do uzupełnienia przed pierwszym zespołem_ | | | |

## 4. Odtworzenie produkcji po awarii

1. Najpierw spróbuj odtwarzania do punktu w czasie w Render (baza → *Recovery*), jeśli błąd jest z ostatnich 3 dni.
2. W przeciwnym razie: nowa, pusta baza w Render (albo nowa usługa z Blueprintu), zatrzymana aplikacja
   (*Suspend*), a potem `restore-check` z `RESTORE_DATABASE_URL` = **zewnętrzny** adres nowej bazy (tymczasowo
   dopuść swój adres w *Access Control*, potem usuń wpis). Następnie przełącz `CI_DATABASE_URL` aplikacji na nową
   bazę i wznów ją.
3. Zapisz, co się stało i z której kopii odtworzono (incydent — `BETA-PLAN.md` §5).
