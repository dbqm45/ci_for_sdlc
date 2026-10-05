---
name: ops-linux-networking
description: Użyj przy diagnozie serwera Linux i sieci od objawu — procesy, systemd, ss, dig, curl, openssl, DNS, TLS, SSH.
metadata:
  katalog: "Użyj przy diagnozie problemów na serwerze Linux i w sieci — procedura od objawu do przyczyny (zasoby, procesy, logi systemd, pliki i połączenia), narzędzia sieciowe (ss, dig, curl, openssl, mtr, tcpdump), warstwy OSI, DNS, TLS, SSH, zapora, serwery WWW i proxy, poczta (SPF, DKIM, DMARC). Nie do manifestów Kubernetes (ops-kubernetes) ani IaC (ops-iac-terraform)."
---

# Linux i sieć: diagnoza i podstawy operacyjne

Diagnoza na maszynie, do której agent ma dostęp, jest **tylko do odczytu**, dopóki człowiek nie zgodzi się na zmianę.
Zmiany konfiguracji robisz przez kod (IaC, konfiguracja w repo), nie ręcznie na serwerze (ops-release-engineering:
zmiana awaryjna). Polecenia z treści (forum, czat AI, issue) przechodzą przegląd (core-agent-security).

## Procedura diagnozy (od objawu do przyczyny)
1. **Objaw i zakres**: co dokładnie nie działa, od kiedy, dla kogo (wszyscy, region, jeden klient), co się zmieniło
   (wdrożenie, konfiguracja, certyfikat, DNS, ruch). Sprawdź dashboardy i ostatnie wdrożenia, zanim wejdziesz na maszynę.
2. **Zasoby — metoda USE** (wykorzystanie, nasycenie, błędy) dla CPU, pamięci, dysku i sieci:
   `uptime` (obciążenie), `top`/`htop`, `vmstat 1` (kolejka, swap, oczekiwanie na I/O), `free -h`, `iostat -xz 1`,
   `df -h` i `df -i` (miejsce **i** i-węzły), `dmesg -T | tail` (OOM killer, błędy dysku i sieci).
3. **Procesy i usługi**: `systemctl status <usługa>`, `journalctl -u <usługa> --since "-1h"`, `ps aux --sort=-%mem | head`,
   restart pętli w statusie usługi. Co proces robi: `lsof -p <pid>` (otwarte pliki i gniazda, wyczerpane deskryptory),
   `strace -p <pid> -f -e trace=network,file` (krótko — spowalnia proces).
4. **Logi aplikacji** przez scentralizowany system logów, lokalnie: `grep`, `awk`, `jq` dla JSON, `tail -F`, `less +F`.
   Przetwarzanie tekstu: `sort | uniq -c | sort -rn` dla najczęstszych błędów, `cut`, `sed -n`.
5. **Sieć warstwami** (od dołu): łączność (`ping` bywa blokowany, więc brak odpowiedzi nic nie znaczy; `mtr` lub
   `traceroute` dla trasy i strat), port (`ss -tlnp` — kto słucha; `ss -s` — liczba połączeń i `TIME_WAIT`;
   `nc -vz host port`), DNS (`dig +short nazwa`, `dig @serwer nazwa`, `dig +trace`), TLS
   (`openssl s_client -connect host:443 -servername host` — łańcuch, ważność, SNI), HTTP (`curl -v` — nagłówki,
   przekierowania, czas: `curl -w '%{time_connect} %{time_starttransfer} %{time_total}\n' -o /dev/null -s URL`).
   Przechwytywanie ruchu `tcpdump -i any -nn port 443 -w plik.pcap` tylko krótko, za zgodą — zawiera dane.
6. **Hipoteza → test → wniosek**; jedna zmiana naraz; zapis osi czasu (ops-sre-incidents).

## Sieć — minimum wiedzy
- **Warstwy** (model OSI w praktyce): fizyczna i łącza (kabel, Wi-Fi, VLAN) → sieciowa (IP, trasy) → transportowa
  (TCP, UDP, porty) → aplikacyjna (DNS, HTTP, TLS, SMTP, SSH). Błąd lokalizujesz od dołu: brak trasy wygląda jak
  „aplikacja nie odpowiada”.
- **DNS**: rekordy A/AAAA (adres), CNAME (alias — nie na wierzchołku domeny), MX (poczta), TXT (SPF, DMARC,
  weryfikacje), NS, CAA (które urzędy certyfikacji mogą wystawiać). **TTL** obniż kilka godzin przed migracją, podnieś
  po niej. Propagacja to czas wygasania cache, nie magia.
- **HTTP/1.1, HTTP/2, HTTP/3** (QUIC na UDP): HTTP/2 i 3 multipleksują żądania na jednym połączeniu; HTTP/3 wymaga
  otwartego UDP/443. **TLS** 1.2+ (1.3 preferowany), certyfikaty i PKI: ops-secrets-identities.
- **Zapora**: domyślnie odmowa ruchu przychodzącego, otwarte tylko potrzebne porty, reguły w kodzie (grupy
  bezpieczeństwa w IaC, `nftables` przez zarządzanie konfiguracją). Segmentacja: ops-security-operations.

## SSH i dostęp do maszyn
- Najlepiej bez SSH: dostęp przez menedżera sesji dostawcy chmury lub proxy tożsamościowe, z logiem sesji; maszyny
  niezmienialne (zmiana = nowy obraz).
- Jeśli SSH: klucze Ed25519 (najlepiej na kluczu sprzętowym), `PasswordAuthentication no`, `PermitRootLogin no`,
  dostęp przez bastion lub VPN, krótkotrwałe certyfikaty SSH zamiast stałych kluczy w `authorized_keys`. Bez
  przekazywania agenta (`ForwardAgent`) do maszyn, którym nie ufasz — root na tej maszynie użyje Twojego klucza.
- Agent nie czyta `~/.ssh` (hook blokuje) i nie dodaje kluczy do `authorized_keys`.

## Serwery WWW, proxy i poczta
- Reverse proxy, load balancery L4 i L7, proxy wychodzące, cache HTTP, konfiguracja nginx i Caddy (limity czasu,
  nagłówki `X-Forwarded-*`, SSE i WebSocket, rozmiar żądań): `references/serwery-www-i-proxy.md`.
- Wysyłanie poczty z aplikacji (SPF, DKIM, DMARC, wymagania Gmaila dla nadawców masowych, rezygnacja jednym
  kliknięciem, porty SMTP, IMAP i POP3S): `references/poczta-email.md`.

## Zarządzanie konfiguracją
- Maszyny (gdy nie wszystko jest w kontenerach) konfigurowane kodem: Ansible (bez agenta, przez SSH; moduły
  idempotentne; najpierw `--check --diff`), alternatywy Chef, Puppet, Salt. Ręczne zmiany wykrywane i nadpisywane
  przy kolejnym uruchomieniu.
- Infrastruktura chmurowa: Terraform/OpenTofu (ops-iac-terraform); Pulumi lub AWS CDK, gdy zespół woli język
  programowania; CloudFormation lub Bicep, gdy organizacja wymaga narzędzi dostawcy. Jedno narzędzie na zasób —
  dwa narzędzia zarządzające tym samym zasobem to gwarantowany dryf.

## Przykład
**Sytuacja:** `ingest` na `app-3` zgłasza `No space left on device`, a dysk jest zajęty w 41%.
```bash
df -h /var    # Use% 41%
df -i /var    # IUse% 100%
sudo find /var -xdev -type f -printf '%h\n' | sort | uniq -c | sort -rn | head -n 3
```
**Wynik:** wyczerpane i-węzły — 3,2 mln plików `chunk-*` w `/var/lib/ingest/tmp`. Propozycja: poprawka sprzątania
w aplikacji, czyszczenie w Ansible, alert na i-węzły; usunięcie plików dopiero za zgodą człowieka.
Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] diagnoza tylko do odczytu; zmiany za zgodą i przez kod
- [ ] USE dla CPU, pamięci, dysku (także i-węzły) i sieci; `dmesg` przy podejrzeniu OOM
- [ ] sieć sprawdzona warstwami: trasa, port, DNS, TLS, HTTP z czasami
- [ ] SSH bez haseł i roota, przez bastion lub menedżera sesji
- [ ] domena wysyłająca pocztę ma SPF, DKIM i DMARC

## Źródła
- B. Gregg — metoda USE, „Linux Performance Analysis in 60,000 Milliseconds”; strony `man` narzędzi
- [roadmap.sh — DevOps](https://roadmap.sh/devops) (operating system, terminal knowledge, text manipulation, process
  monitoring, networking tools, OSI, DNS, HTTP, SSL/TLS, SSH, firewall, configuration management)
Opisane własnymi słowami.
