# Ataki, modele analizy i polowanie na zagrożenia

Ten plik jest dla obrony: rozpoznanie mechanizmu ataku, sygnały w logach i kontrola, która go zatrzymuje. Bez
instrukcji przeprowadzania ataków.

## Katalog ataków → sygnał → kontrola
| Atak | Mechanizm | Sygnał | Kontrola (gdzie w fabryce) |
|---|---|---|---|
| **phishing** i odmiany: SMS (smishing), telefon (vishing), na zarząd (whaling), podszywanie się pod znaną osobę | wyłudzenie danych logowania, zgody OAuth lub przelewu | logowanie z nowego miejsca zaraz po kliknięciu, nowa zgoda aplikacji, reguły przekazywania poczty | MFA odporne na phishing (klucze, passkeys), DMARC (ops-linux-networking), zgody admina dla zakresów (be-auth-security), szkolenia z ćwiczeniami |
| **zgadywanie haseł**: siłowe (wiele haseł na jedno konto), rozpylanie (jedno popularne hasło na wiele kont), wypychanie poświadczeń z wycieków | odgadnięcie lub ponowne użycie hasła | wiele nieudanych logowań per konto (siłowe) lub per IP i hasło na wielu kontach (rozpylanie), logowania z list proxy | limity per konto i per IP, sprawdzanie haseł z wycieków, MFA, logowanie bez hasła |
| **przejęcie sesji lub tokenu** (kradzież ciasteczek, odtworzenie) | ominięcie MFA skradzioną sesją | ta sama sesja z dwóch krajów, nowy odcisk urządzenia | krótkie tokeny, wiązanie z urządzeniem, unieważnianie (be-auth-security, `tokeny-sesje-oauth.md`) |
| **przechwycenie ruchu** (MITM, podszycie ARP lub DNS, fałszywy punkt Wi-Fi) | podsłuch lub modyfikacja ruchu | ostrzeżenia certyfikatu, nieoczekiwane zmiany ARP/DNS | TLS wszędzie z HSTS, mTLS między usługami, DNSSEC dla własnych stref, 802.1X i segmentacja (`siec-i-chmura.md`) |
| **powtórzenie żądania** (replay) | ponowne wysłanie ważnego żądania | duplikaty identyfikatorów, stare znaczniki czasu | znacznik czasu i nonce w podpisie, idempotencja (be-api-design) |
| **wstrzyknięcia i błędy webowe**: SQL, XSS, CSRF, przechodzenie po ścieżkach (`../`), SSRF | dane wejściowe wykonane jako kod lub ścieżka | błędy SQL w logach, nietypowe znaki w parametrach, żądania do adresów wewnętrznych | zapytania parametryzowane, kodowanie wyjścia i CSP, tokeny CSRF i `SameSite`, normalizacja ścieżek i allowlista, allowlista hostów (be-auth-security, fe-architecture) |
| **błędy pamięci** (przepełnienie bufora) | zapis poza buforem w kodzie natywnym | awarie procesu, nietypowe dane wejściowe | języki z bezpieczną pamięcią, aktualne biblioteki natywne, utwardzenie systemu (ops-docker) |
| **podniesienie uprawnień** | z konta zwykłego na administratora (błędna konfiguracja, podatność, sudo, SUID) | nowe uprawnienia, procesy root z kontenera aplikacji | najmniejsze uprawnienia, kontenery bez roota, łatki (ops-kubernetes, ops-docker) |
| **życie z zasobów systemu** (LOLBAS w Windows, GTFOBins w Uniksie) | napastnik używa wbudowanych narzędzi (PowerShell, `curl`, `certutil`) zamiast własnego malware | procesy potomne aplikacji (powłoka z serwera WWW), pobieranie i wykonanie w jednej linii | EDR, allowlista procesów, brak narzędzi w obrazach (distroless); hooki fabryki blokują m.in. `curl \| sh`, `irm \| iex`, `mshta` (core-agent-security) | <!-- audit-ok: opis ataku, nie polecenie -->
| **ruch boczny w Windows/AD** (np. przekazanie skrótu hasła — pass-the-hash, ataki na Kerberos) | użycie skrótu lub biletu zamiast hasła | logowania kontem z nietypowego hosta, wiele hostów w krótkim czasie | konta admina tylko na stacjach uprzywilejowanych, LAPS, ograniczenie NTLM, segmentacja, długie losowe hasła kont usług |
| **odmowa usługi** (DoS, DDoS) | wyczerpanie zasobów | skok ruchu, kosztu, błędów 429/503 | `siec-i-chmura.md` (DDoS), limity (be-api-design) |
| **zatrucie łańcucha dostaw**, literówki w nazwach pakietów i domen | złośliwa zależność, podobna domena | nowa zależność przechodnia, skrypt instalacyjny | ops-supply-chain-security |
| **wodopój i ataki z przeglądarki** (drive-by) | zainfekowana strona odwiedzana przez cel | EDR, ruch do nowych domen | aktualne przeglądarki, izolacja, filtr DNS |
| **zero-day** | podatność bez łatki | anomalie zachowania, nie sygnatury | obrona w głąb, segmentacja, szybkie łatanie po publikacji, wykrywanie zachowań |
| **socjotechnika fizyczna** (wejście za kimś, podglądanie ekranu, przeszukanie śmieci) | ominięcie zabezpieczeń przez ludzi | — | kontrola dostępu, blokada ekranu, niszczenie dokumentów, szkolenia |

## Modele analizy
- **Cyber Kill Chain** (Lockheed Martin): rozpoznanie → uzbrojenie → dostarczenie → wykorzystanie → instalacja →
  dowodzenie i kontrola → działania na celu. Przerwanie dowolnego etapu przerywa atak — mapuj kontrole na etapy
  i szukaj etapów bez kontroli.
- **MITRE ATT&CK**: szczegółowa baza taktyk (cel napastnika) i technik (sposób), z wykrywaniem i ograniczaniem dla
  każdej. Służy do mapowania pokrycia reguł wykrywania (SKILL.md: reguły jako kod) i opisu incydentu wspólnym językiem.
- **Model diamentu**: każde zdarzenie wiąże **napastnika**, **zdolność** (narzędzie, technika), **infrastrukturę**
  (domeny, adresy) i **ofiarę**. Ze znanego wierzchołka szukasz pozostałych (np. z domeny C2 — innych ofiar).
- **Klasyfikacja alertów**: prawdziwie pozytywny (atak wykryty), fałszywie pozytywny (alarm bez ataku — koszt uwagi),
  prawdziwie negatywny, fałszywie negatywny (atak niewykryty — najgroźniejszy, widać go dopiero w testach,
  ćwiczeniach i polowaniu). Reguła strojona tylko pod mniej fałszywych alarmów zwiększa liczbę przeoczeń.

## Polowanie na zagrożenia
Zakłada, że napastnik już jest i ominął automaty. Pętla: **hipoteza** (z ATT&CK, wywiadu o zagrożeniach albo
anomalii — „ktoś używa konta usługi interaktywnie”) → **zapytanie** w logach i EDR → **wynik**: znalezisko
(incydent) albo nic, ale wtedy **nowa reguła wykrywania**, żeby kolejnym razem zrobił to automat.

## Wywiad o zagrożeniach i OSINT
- Źródła: biuletyny dostawców i CERT, CISA KEV, raporty branżowe, kanały IoC (formaty STIX/TAXII). Wartość mają
  te, które dotyczą Twojej technologii i branży.
- Sprawdzanie podejrzanych domen, adresów i plików w publicznych serwisach (VirusTotal, urlscan.io, ANY.RUN,
  Joe Sandbox, Whois): **nie przesyłaj plików ani adresów zawierających dane firmy lub klientów** — w wielu z tych
  serwisów przesłane próbki i wyniki widzą inni użytkownicy. Najpierw wyszukaj po skrócie pliku; analiza
  dynamiczna w prywatnej piaskownicy organizacji.
- Wabiki: honeypoty (fałszywe systemy), honeytokeny i tokeny-pułapki (fałszywe klucze API, rekordy w bazie, pliki),
  których każde użycie jest alarmem o wysokiej pewności; DNS sinkhole kieruje znane złośliwe domeny na serwer
  kontrolowany przez obronę.

## Źródła
- [Lockheed Martin — Cyber Kill Chain](https://www.lockheedmartin.com/en-us/capabilities/cyber/cyber-kill-chain.html);
  [MITRE ATT&CK](https://attack.mitre.org/); S. Caltagirone i in. — The Diamond Model of Intrusion Analysis (2013)
- [LOLBAS Project](https://lolbas-project.github.io/); GTFOBins; [roadmap.sh — Cyber Security](https://roadmap.sh/cyber-security)
  (attacks, threat hunting, threat intel, OSINT, honeypots, sinkholes, false/true positives, malware, sandboxing)
Opisane własnymi słowami.
