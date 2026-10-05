---
name: ops-security-operations
description: Użyj przy wykrywaniu i obsłudze incydentu bezpieczeństwa — SIEM, EDR, podatności i łatki, NIST 800-61, forensyka.
metadata:
  katalog: "Użyj przy wykrywaniu zagrożeń i reagowaniu na incydenty bezpieczeństwa — SIEM, alerty i reguły jako kod, EDR, IDS/IPS, SOAR z bramką człowieka, zarządzanie podatnościami i łatkami, cykl reagowania (NIST SP 800-61r3), ograniczanie skutków, zabezpieczanie dowodów, analiza przyczyn, zgłoszenia. Nie do awarii bez ataku (ops-sre-incidents) ani projektu zabezpieczeń (arch-threat-modeling)."
---

# Operacje bezpieczeństwa: wykrywanie i reagowanie

Zapobieganie kiedyś zawiedzie. Ten skill dotyczy tego, jak to zauważyć i co zrobić potem. Sieć, chmura, segmentacja,
DDoS i CSPM: `references/siec-i-chmura.md`. Katalog ataków z sygnałami
i kontrolami, modele analizy (Kill Chain, ATT&CK, model diamentu), polowanie na zagrożenia, wywiad i wabiki:
`references/ataki-i-analiza.md`. Forensyka (kolejność ulotności, łańcuch dowodowy) i testy penetracyjne z zasadami
zaangażowania: `references/forensyka-i-testy-penetracyjne.md`. Mapowanie na SOC 2, ISO 27001 i NIST CSF: `references/zgodnosc.md`.

## 1. Telemetria bezpieczeństwa
- Źródła (od najważniejszych): IdP i logowania (sukcesy, porażki, MFA, zmiany metod), logi audytowe chmury (API
  sterujące, IAM), logi aplikacji ze zdarzeniami bezpieczeństwa (odmowy autoryzacji, zmiany uprawnień, eksporty, użycie
  kluczy API), Kubernetes audit, CI/CD (kto uruchomił, co wdrożył), DNS i ruch wychodzący, EDR z maszyn i stacji
  roboczych, WAF i brama API.
- Logi **poza systemem, który opisują** (napastnik z rootem kasuje lokalne logi), z czasem UTC i synchronizacją
  zegarów, retencja ustalona z wymaganiami prawnymi i dochodzeniowymi (zwykle miesiące, nie dni). Bez danych
  wrażliwych (ops-observability).
- **SIEM** zbiera, normalizuje i koreluje. Wartość daje dopiero zestaw reguł i ich utrzymanie, nie samo wdrożenie.

## 2. Alerty i reguły jako kod
| Rodzaj | Przykład | Uwaga |
|---|---|---|
| sygnatura / reguła | logowanie z `alg: none`, znany IoC (hash, domena) | szybkie, łatwe do ominięcia |
| próg | > 20 nieudanych logowań na konto w 5 min | dobierz próg na danych, nie z głowy |
| anomalia | eksport 10× większy niż zwykle, logowanie z nowego kraju | wymaga linii bazowej; dużo fałszywych alarmów na starcie |
| korelacja | nowe MFA + reset hasła + nowy token API w 10 min | najcenniejsze; łączy słabe sygnały |
- Reguły w repozytorium (format niezależny od dostawcy, np. Sigma), przegląd w PR, test na nagranych zdarzeniach
  i mapowanie na techniki MITRE ATT&CK — wiadomo, czego jeszcze nie wykrywamy.
- Każdy alert: ważność, runbook, właściciel. Mierz trafność (odsetek fałszywych alarmów) i czas do reakcji; alert
  ignorowany przez miesiąc → popraw albo usuń (zmęczenie alertami to luka bezpieczeństwa).

## 3. EDR, IDS/IPS, WAF
- **EDR** na serwerach i laptopach (procesy, połączenia, pliki, izolacja hosta jednym poleceniem); w Kubernetesie
  wykrywanie w czasie działania (np. Falco: powłoka w kontenerze, nieoczekiwane połączenia, zapis do ścieżek systemowych).
- **IDS** wykrywa i alarmuje, **IPS** blokuje w linii (ryzyko blokowania ruchu prawidłowego — zacznij w trybie wykrywania).
- **WAF** przed aplikacjami publicznymi jako warstwa dodatkowa (reguły OWASP CRS, ochrona przed botami), nigdy zamiast
  walidacji i autoryzacji w kodzie.

## 4. SOAR — automatyzacja z bramką
- Automatyzuj w pełni: wzbogacanie alertu (kto, jaki host, reputacja IP, ostatnie zmiany), tworzenie zgłoszenia,
  zbieranie dowodów, powiadomienie dyżurnego.
- Z zatwierdzeniem człowieka: izolacja hosta produkcyjnego, wyłączenie konta, unieważnienie wszystkich sesji, blokada
  IP partnera — skutki uboczne bywają większe niż atak. Wyjątek z góry uzgodniony: np. automatyczne unieważnienie
  klucza wykrytego publicznie w repozytorium.
- Playbooki wersjonowane jak kod i ćwiczone. Agent AI może wzbogacać i proponować, nie wykonuje działań destrukcyjnych
  (ops-sre-incidents, poziomy autonomii; core-agent-security).

## 5. Podatności i łatki
1. **Inwentarz zasobów** (hosty, obrazy, funkcje, domeny, zależności — SBOM) — nie załatasz tego, czego nie znasz.
2. **Skanowanie** regularne: hosty i sieć (np. OpenVAS, Nessus, Qualys), obrazy i zależności (ops-supply-chain-security),
   konfiguracja chmury (CSPM), aplikacja (DAST na stagingu). Skan zewnętrzny z perspektywy internetu.
3. **Priorytet** nie z samego CVSS: podatność wykorzystywana w praktyce (np. lista CISA KEV), prawdopodobieństwo
   wykorzystania (EPSS), dostępność z internetu, wartość aktywa (ops-supply-chain-security: priorytety).
4. **Terminy naprawy** per poziom (np. wykorzystywana i publiczna: dni; krytyczna: 2 tygodnie; reszta: cykl) z wyjątkami
   zapisanymi i przeglądanymi.
   Podatność frameworka aplikacji (np. React Server Components, Next.js) to także decyzja architektoniczna: kod
   serwerowy komponentów, termin łatki w ciągu doby przy krytycznych CVE i ograniczenie skutków opisuje
   fe-architecture (bezpieczeństwo klienta i serwera komponentów).
5. **Automatyczne łatanie** w pierścieniach: środowisko testowe → canary → reszta, z testem po łatce i możliwością
   wycofania. W infrastrukturze niezmienialnej „łatka” to przebudowa obrazu i wdrożenie, nie logowanie na maszynę.

## 6. Reagowanie na incydent bezpieczeństwa
Zgodnie z NIST SP 800-61r3 (04.2025) reagowanie jest częścią zarządzania ryzykiem według sześciu funkcji CSF 2.0
(Govern, Identify, Protect, Detect, Respond, Recover). Przygotowanie i wnioski są ciągłe, nie są tylko pierwszą
i ostatnią fazą.
1. **Przygotowanie**: role (dowodzący, techniczny, komunikacja, prawny), kanał poza zaatakowanymi systemami,
   kontakty (dostawca chmury, CERT, ubezpieczyciel), playbooki dla typowych scenariuszy (przejęte konto, wyciek klucza,
   ransomware, złośliwa zależność — ops-supply-chain-security), ćwiczenia „na sucho”.
2. **Wykrycie i analiza**: potwierdź, zakres (które konta, hosty, dane), oś czasu w UTC, ważność. Zakładaj, że
   napastnik może czytać zwykłe kanały (e-mail, czat) — wrażliwe ustalenia przenieś na kanał awaryjny.
3. **Zabezpieczenie dowodów przed zmianami**: migawki dysków, zrzut pamięci, jeśli to możliwe, eksport logów, kopie
   tokenów i artefaktów do magazynu tylko do odczytu; łańcuch dowodowy (kto, kiedy, co, suma kontrolna). Nie wyłączaj
   maszyny bez potrzeby — tracisz pamięć.
4. **Ograniczenie skutków** (containment):
   - źródło — blokada adresów i kont napastnika;
   - technika i dostęp — unieważnienie poświadczeń, sesji i kluczy, rotacja sekretów;
   - cel — izolacja hosta grupą bezpieczeństwa lub EDR, odcięcie zasobu.
   Krótkoterminowo szybko, długoterminowo trwale; uważaj, żeby nie zdradzić napastnikowi wykrycia, zanim ustalisz zakres.
5. **Usunięcie** (eradication): przyczyna i wszystkie punkty utrwalenia (konta, klucze, zadania cron, obrazy, webhooki,
   aplikacje OAuth); odbudowa z zaufanych źródeł zamiast „czyszczenia” maszyny.
6. **Odtworzenie** (recovery) z kopii sprzed incydentu, wzmożone monitorowanie, stopniowy powrót ruchu.
7. **Wnioski**: analiza przyczyn bez szukania winnych (ops-sre-incidents) — przyczyna techniczna, czynniki sprzyjające,
   dlaczego wykrycie trwało tyle, ile trwało; działania z właścicielem; nowe reguły wykrywania z tego incydentu.
- **Zgłoszenia** — terminy liczone od stwierdzenia: RODO art. 33 — organ nadzorczy w 72 h (naruszenie danych osobowych);
  NIS2 — wczesne ostrzeżenie w 24 h, zgłoszenie w 72 h, raport końcowy w miesiąc (podmioty objęte). Decyzję
  i treść zgłoszenia przygotowuje człowiek z działem prawnym; agent dostarcza oś czasu i fakty.

## Checklista
- [ ] logi bezpieczeństwa poza hostem, UTC, retencja ustalona
- [ ] reguły wykrywania w repo, z testem, właścicielem i runbookiem; mierzona trafność
- [ ] inwentarz zasobów i terminy naprawy podatności; łatanie w pierścieniach
- [ ] playbooki incydentów przećwiczone; kanał awaryjny i kontakty gotowe
- [ ] automatyzacja destrukcyjna tylko z zatwierdzeniem człowieka

## Źródła
- [NIST SP 800-61 Rev. 3](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r3.pdf) (04.2025),
  [AWS Security Incident Response Guide — containment](https://docs.aws.amazon.com/whitepapers/latest/aws-security-incident-response-guide/containment.html)
- [roadmap.sh — DevSecOps](https://roadmap.sh/devsecops) (SIEM, SOAR, EDR, IDS/IPS, alert types, IR lifecycle,
  containment, forensics, RCA, automated patching)
Opisane własnymi słowami.
