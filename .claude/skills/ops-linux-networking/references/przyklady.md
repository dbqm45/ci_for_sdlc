# Przykłady diagnozy Linux i sieci

Wszystkie polecenia są tylko do odczytu. Nazwy hostów, adresy (z puli dokumentacyjnej) i wyniki są ilustracyjne.

## 1. „No space left on device” przy wolnym miejscu
**Sytuacja:** Od rana usługa `ingest` na `app-3` nie zapisuje plików: w logu `No space left on device`, a dashboard
pokazuje dysk zajęty w 41%.

**Jak:**
1. Zakres: jeden host, od 6:10, bez wdrożenia — więc coś rosło, a nie zmieniło się.
2. USE dla dysku: `df -h` **i** `df -i` — miejsce to nie jedyny zasób systemu plików.
3. Znajdź katalog z milionami małych plików i proces, który je tworzy.
4. Wniosek i propozycja zmiany przez kod; usuwanie plików dopiero po zgodzie człowieka.

**Wynik:**
```bash
journalctl -u ingest --since "-2h" | tail -n 5
df -h /var
df -i /var
sudo find /var -xdev -type f -printf '%h\n' | sort | uniq -c | sort -rn | head -n 3
```
```text
paź 05 06:10:02 app-3 ingest[2211]: write /var/lib/ingest/tmp/chunk-8812: no space left on device
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme1n1     50G   21G   30G  41% /var
Filesystem      Inodes   IUsed IFree IUse% Mounted on
/dev/nvme1n1   3276800 3276800     0  100% /var
3194022 /var/lib/ingest/tmp
   8121 /var/log/journal/4f2c
   2210 /var/lib/apt/lists
```
Wniosek: wyczerpane i-węzły, nie miejsce. `ingest` nie sprząta plików `chunk-*` (3,2 mln). Propozycja: poprawka
sprzątania w aplikacji, zadanie czyszczące w konfiguracji maszyny (Ansible) i alert na `node_filesystem_files_free`
(ops-observability). Usunięcie starych plików — po akceptacji człowieka.

## 2. Po migracji część klientów widzi błąd certyfikatu
**Sytuacja:** Wczoraj `shop.acme.example` przeniesiono na nowy serwer. Część klientów zgłasza „certyfikat wygasł”,
reszta działa.

**Jak:**
1. „Część klientów” po zmianie DNS sugeruje cache: porównaj odpowiedź serwera autorytatywnego i resolvera publicznego.
2. Sprawdź TTL rekordu — czy obniżono go przed migracją.
3. Sprawdź certyfikat na **obu** adresach z poprawnym SNI.

**Wynik:**
```bash
dig +short NS acme.example
dig @ns1.acme.example shop.acme.example A +noall +answer
dig @1.1.1.1 shop.acme.example A +noall +answer
for ip in 203.0.113.20 198.51.100.7; do
  echo | openssl s_client -connect "$ip:443" -servername shop.acme.example 2>/dev/null \
    | openssl x509 -noout -enddate
done
```
```text
ns1.acme.example.
ns2.acme.example.
shop.acme.example.  86400 IN A 198.51.100.7     # autorytatywny: nowy serwer
shop.acme.example.  61200 IN A 203.0.113.20     # resolver: stary adres jeszcze w cache
notAfter=Oct  4 23:59:59 2026 GMT               # 203.0.113.20 (stary)
notAfter=Jan  2 23:59:59 2027 GMT               # 198.51.100.7 (nowy)
```
Wniosek: TTL 86 400 s nie został obniżony przed migracją, resolvery trzymają stary adres do doby, a na starym serwerze
certyfikat wygasł. Doraźnie (za zgodą): odnowić certyfikat na starym serwerze albo przekierować z niego ruch do nowego,
aż cache wygaśnie. Na przyszłość: TTL obniżony kilka godzin przed migracją, podniesiony po niej.

## 3. Raporty kończą się błędem 504 po 60 s
**Sytuacja:** Generowanie raportu miesięcznego w `reports.acme.example` zwraca 504 Gateway Timeout, zawsze po około
minucie. Mniejsze raporty działają.

**Jak:**
1. Zmierz czasy żądania `curl -w` — stały czas zerwania wskazuje na limit, nie na przeciążenie.
2. Sprawdź log proxy i aplikacji z tej samej minuty — czy aplikacja kończy pracę po zerwaniu.
3. Porównaj limity czasu w łańcuchu: load balancer → nginx → aplikacja (`references/serwery-www-i-proxy.md`).

**Wynik:**
```bash
curl -s -o /dev/null -w '%{http_code} %{time_connect} %{time_starttransfer} %{time_total}\n' \
  "https://reports.acme.example/api/reports/monthly?month=2026-09"
sudo grep 'upstream timed out' /var/log/nginx/error.log | tail -n 1
journalctl -u reports-api --since "-10min" | grep monthly
sudo nginx -T 2>/dev/null | grep -E 'proxy_(read|connect)_timeout'
```
```text
504 0.012 60.031 60.031
upstream timed out (110: Connection timed out) while reading response header from upstream, request: "GET /api/reports/monthly?month=2026-09"
paź 05 10:14:52 web-1 reports-api[901]: report monthly 2026-09 done in 83.4s
    proxy_read_timeout 60s;
```
Wniosek: nginx zrywa po 60 s, a aplikacja kończy raport po 83 s i pracuje na próżno. Limit wyższego poziomu musi być
dłuższy niż niższego, ale lepiej nie wydłużać żądania synchronicznego: raport jako zadanie w tle z odpytywaniem
o status. Doraźnie (zmiana w repozytorium konfiguracji, za zgodą): `proxy_read_timeout 120s` tylko dla tej ścieżki.
