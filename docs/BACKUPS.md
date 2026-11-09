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

### Krok 1. Klucz kopii
1. Wygeneruj klucz: `openssl rand -hex 32`.
2. **Najpierw zapisz go w menedżerze haseł** (wpis „Quorum produkcja”, pole `BACKUP_ENCRYPTION_KEY`). Bez niego
   żadnej kopii nie da się otworzyć — nie ma obejścia. Trzymaj go osobno od danych dostępowych do B2.
3. W menedżerze haseł musi być też `CI_ENCRYPTION_KEY` (`DEPLOYMENT.md`, krok 2): bez niego zaszyfrowane dokumenty
   z kopii są nie do odczytania.

### Krok 2. Konto i bucket w Backblaze B2
1. Załóż konto na backblaze.com i przy zakładaniu wybierz region **EU Central**. Regionu nie da się potem zmienić;
   jeśli konto już istnieje w innym regionie, potrzebne jest nowe.
2. Włącz **2FA** (My Settings → Security).
3. *Buckets → Create a Bucket*: nazwa np. `quorum-backups-<coś-losowego>` (nazwy są globalne), **Private**,
   szyfrowanie po stronie B2 włączone (dodatkowe; kopia i tak jest szyfrowana), **Object Lock: Enable**.
   Object Lock trzeba włączyć tutaj — zadanie wysyła każdy plik z blokadą i bez niej B2 odrzuci zapis.
4. Zapisz **Endpoint** bucketa (np. `s3.eu-central-003.backblazeb2.com`) — to `B2_ENDPOINT`.
5. *Lifecycle Settings* bucketa → *Use custom lifecycle rules*: dla prefiksu `daily/` ukrywanie po 36 dniach, dla
   `monthly/` po 101 dniach, usuwanie ukrytych po 1 dniu. Bez tego pliki zostają na zawsze (blokada tylko
   chroni przed usunięciem, nie usuwa).
6. *Application Keys → Add a New Application Key*: dostęp **tylko do tego bucketa**, *Read and Write*. Zapisz
   `keyID` (`B2_KEY_ID`) i `applicationKey` (`B2_APPLICATION_KEY`, pokazuje się raz) w menedżerze haseł.
   Blokada *compliance* sprawia, że nawet ten klucz nie usunie zablokowanej kopii. Węższy klucz (tylko zapis plików
   i ich blokad) da się utworzyć narzędziem `b2` z uprawnieniami `writeFiles,writeFileRetentions` — nie
   sprawdzałem tego w panelu; wtedy do próby odtworzenia potrzebny jest osobny klucz tylko do odczytu
   (`listFiles,readFiles`).

### Krok 3. Render
1. Po merge'u tego PR-a Render pokaże w Blueprincie nową usługę `quorum-backup` (*Cron Job*, Frankfurt). Zatwierdź
   ją (*Blueprint → Sync*) i wpisz zmienne `sync: false`:

   | Zmienna | Wartość |
   |---|---|
   | `BACKUP_ENCRYPTION_KEY` | z kroku 1 |
   | `B2_ENDPOINT` | Endpoint bucketa, np. `https://s3.eu-central-003.backblazeb2.com` |
   | `B2_BUCKET` | nazwa bucketa |
   | `B2_KEY_ID`, `B2_APPLICATION_KEY` | z kroku 2.6 |

2. Uruchom zadanie raz ręcznie: `quorum-backup` → *Trigger Run*. W logu ma być `"msg":"backup uploaded"`, a w B2
   plik `daily/<dzisiaj>.qbk` z blokadą (*Browse Files* → plik → *Object Lock: Compliance, retain until …*).
3. W Render → *Notifications* sprawdź, że powiadomienia o nieudanych przebiegach idą na Twój e-mail.
4. Dopisz B2 do listy podprzetwarzających w DPA (`BETA-PLAN.md` §5): kopia zawiera dane osobowe (e-maile kont,
   zgłoszenia do bety), choć zaszyfrowane.

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
