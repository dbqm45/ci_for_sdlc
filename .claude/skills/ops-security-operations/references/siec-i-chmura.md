# Sieć, chmura i tożsamość w skali — bezpieczeństwo infrastruktury

## Zasady podstawowe
- **Triada CIA**: poufność, integralność, dostępność. Każda kontrola chroni którąś z nich; DDoS i ransomware atakują
  dostępność, wyciek — poufność, manipulacja — integralność.
- **Obrona w głąb**: kilka niezależnych warstw (tożsamość, sieć, host, aplikacja, dane, wykrywanie), żeby błąd jednej
  nie oznaczał włamania.
- **Najmniejsze uprawnienia** i **domyślna odmowa** wszędzie: IAM, reguły sieciowe, RBAC Kubernetes, bazy.

## Segmentacja i strefy
- Strefy z jasną polityką ruchu między nimi: publiczna (CDN, load balancer) → aplikacji → danych; osobno zarządzanie
  (bastion lub dostęp tożsamościowy) i CI/CD. Ruch między strefami domyślnie zabroniony, dozwolony regułą z opisem.
- Ruch wschód–zachód (między usługami) też filtrowany — to nim napastnik porusza się po włamaniu: grupy bezpieczeństwa
  per usługa, NetworkPolicy w Kubernetesie (ops-kubernetes), VLAN-y lub podsieci w centrach danych.
- Bazy i kolejki bez publicznych adresów; ruch wychodzący z allowlistą (utrudnia wyprowadzanie danych i kontakt
  z serwerem napastnika).

## Zero trust (NIST SP 800-207)
Lokalizacja w sieci nie daje zaufania. Każde żądanie: uwierzytelnione (użytkownik **i** urządzenie lub usługa),
autoryzowane według polityki (kontekst: stan urządzenia, ryzyko, czas), szyfrowane. W praktyce: dostęp do narzędzi
wewnętrznych przez proxy tożsamościowe zamiast VPN do całej sieci, mTLS lub tożsamość obciążenia między usługami,
krótkotrwałe poświadczenia.

## DDoS
- Warstwy 3/4 (zalanie pakietami): ochrona dostawcy chmury lub CDN z anycastem i oczyszczaniem ruchu — sama aplikacja
  tego nie zatrzyma.
- Warstwa 7 (drogie żądania HTTP): CDN i cache, WAF z ochroną przed botami, limity żądań (be-api-design), kolejki dla
  ciężkich operacji, wyzwanie dla podejrzanych klientów.
- Autoskalowanie z **górnym limitem i alertem kosztowym** — atak może celować w rachunek (ops-finops).
- Plan: kontakt do dostawcy ochrony, przełączenie DNS lub trybu „pod atakiem”, komunikacja z klientami.

## Chmura: postura i tożsamość
- **CSPM**: ciągłe sprawdzanie konfiguracji (publiczne zasobniki, otwarte porty, brak szyfrowania, za szerokie role)
  z benchmarkami CIS — narzędzia dostawcy (AWS Security Hub, Microsoft Defender for Cloud, Google Security Command
  Center) albo otwarte (np. Prowler). Wyniki jako zadania z właścicielem; nowe naruszenia blokowane wcześniej w IaC
  (ops-iac-terraform, polityki jako kod).
- **IAM**: logowanie ludzi przez SSO z MFA odpornym na phishing, bez długotrwałych kluczy użytkowników; uprawnienia
  administracyjne nadawane na czas; granice uprawnień na poziomie organizacji (np. SCP) blokujące wyłączenie logów
  audytowych i użycie nieużywanych regionów; konta usług — ops-secrets-identities.
- **Tożsamość w dużej organizacji** (IGA): przyjście, zmiana roli, odejście (joiner–mover–leaver) zautomatyzowane
  z systemu kadrowego; provisioning przez SCIM; okresowe przeglądy dostępu z akceptacją przełożonego; wykrywanie kont
  osieroconych i nadmiarowych uprawnień.

## Tożsamość i sieć w firmie (on-premises i hybrydowo)
- **Katalog i protokoły**: Active Directory lub inny katalog LDAP — połączenia tylko przez LDAPS lub StartTLS,
  konta usług z długimi losowymi hasłami lub zarządzanymi tożsamościami (gMSA), osobne konta administracyjne;
  Kerberos z nowoczesnym szyfrowaniem (bez RC4), ograniczanie NTLM; zasady grup (Group Policy) jako kod i z przeglądem
  zmian. Logowanie do aplikacji przez SSO (SAML lub OIDC) zamiast własnych haseł.
- **Dostęp do sieci**: 802.1X z RADIUS (EAP-TLS z certyfikatami urządzeń zamiast haseł), kontrola dostępu do sieci
  (NAC) sprawdzająca stan urządzenia, VPN (IPsec lub WireGuard) albo lepiej dostęp tożsamościowy (zero trust).
  Wi-Fi: WPA3 (Enterprise dla firmy), wykrywanie fałszywych punktów dostępowych, osobna sieć dla gości.
- **Przełączniki i VLAN-y**: wyłączone automatyczne negocjowanie trunków na portach dostępowych (ochrona przed
  przeskakiwaniem VLAN), nieużywane porty wyłączone, ochrona przed podszyciem ARP i DHCP (DHCP snooping, dynamiczna
  inspekcja ARP) tam, gdzie sprzęt na to pozwala.
- **DNS**: DNSSEC dla własnych stref, filtr DNS z listami złośliwych domen, logi zapytań w SIEM.
- **Ochrona przed wyciekiem danych (DLP)**: klasyfikacja danych, reguły dla poczty, chmury i stacji roboczych;
  zacznij od trybu monitorowania, bo reguły blokujące bez strojenia zatrzymują pracę.
- **Stacje robocze programistów**: szyfrowanie dysku, EDR, aktualizacje automatyczne, konto bez stałych uprawnień
  administratora, menedżer haseł, sekrety poza plikami w katalogu domowym (core-agent-security, ops-secrets-identities).

## Wiele regionów
- Wymogi lokalizacji danych (RODO, umowy, sektor) decydują, które dane mogą opuścić region — zapisane w ADR.
- Te same polityki we wszystkich regionach z jednego kodu (IaC, polityki); regiony nieużywane zablokowane.
- Klucze KMS per region (dane szyfrowane kluczem z regionu, w którym leżą); kopie zapasowe w innym regionie tylko
  zgodnie z wymogami lokalizacji.
- Centralne zbieranie logów bezpieczeństwa i wyników CSPM ze wszystkich regionów — atak często zaczyna się tam, gdzie
  nikt nie patrzy.

## Źródła
- NIST SP 800-207 *Zero Trust Architecture* (2020); CIS Benchmarks; [Cloudflare: how to prevent DDoS attacks](https://www.cloudflare.com/en-gb/learning/ddos/how-to-prevent-ddos-attacks/)
- [roadmap.sh — DevSecOps](https://roadmap.sh/devsecops) (CIA, defense in depth, segmentation, zoning, zero trust,
  DDoS, CSPM, IAM, large-scale identity, multi-region)
Opisane własnymi słowami.
