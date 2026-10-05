# Zgodność: mapowanie kontroli na ramy i audyty

Agent pomaga zbierać dowody i mapować kontrole. **Nie stwierdza zgodności** — to rola audytora i działu prawnego.

## Ramy, które spotkasz najczęściej
| Rama | Czym jest | Struktura |
|---|---|---|
| **NIST CSF 2.0** (2024) | dobrowolna rama zarządzania ryzykiem cyber | 6 funkcji: Govern, Identify, Protect, Detect, Respond, Recover → kategorie → podkategorie |
| **ISO/IEC 27001:2022** | certyfikowany system zarządzania bezpieczeństwem informacji (ISMS) | klauzule 4–10 (zarządzanie, ryzyko, audyt wewnętrzny, doskonalenie) + Załącznik A: 93 kontrole w 4 grupach (organizacyjne, ludzkie, fizyczne, technologiczne); deklaracja stosowania (SoA) |
| **SOC 2** (AICPA) | raport audytora dla klientów usługi | kryteria Trust Services: bezpieczeństwo (obowiązkowe) + opcjonalnie dostępność, integralność przetwarzania, poufność, prywatność. Typ I — projekt kontroli w dniu; typ II — działanie przez okres (zwykle 6–12 mies.) |
| **PCI DSS 4.0** | wymagania dla danych kart płatniczych | zakres zmniejszasz tokenizacją u dostawcy płatności |
| **RODO**, **NIS2**, **DORA** (UE) | prawo: dane osobowe; cyberbezpieczeństwo podmiotów kluczowych i ważnych; odporność cyfrowa sektora finansowego | obowiązki zgłaszania incydentów i zarządzania ryzykiem — interpretuje dział prawny |

## Procedura mapowania
1. **Rejestr kontroli** (jedna lista dla organizacji): ID, opis, właściciel, jak działa, dowód, częstotliwość.
2. **Mapowanie wiele-do-wielu**: jedna kontrola (np. „MFA odporne na phishing dla wszystkich kont administracyjnych”)
   spełnia wymagania w kilku ramach naraz — nie prowadź osobnych list per audyt.
3. **Dowody automatyczne**, gdzie się da: polityki jako kod i ich wyniki w CI, eksport konfiguracji IAM, wyniki CSPM,
   historia PR z przeglądami (ochrona gałęzi), logi wdrożeń, raporty skanów, zapisy przeglądów dostępu. Dowód ma datę
   i źródło; zrzuty ekranu tylko tam, gdzie nie ma innej drogi.
4. **Luki** jako zadania z właścicielem i terminem; wyjątki z akceptacją ryzyka (arch-threat-modeling) i datą przeglądu.
5. **Ciągłość**: kontrola, która działa tylko przed audytem, nie przejdzie SOC 2 typu II.

## Gdzie fabryka już dostarcza dowody
Ochrona gałęzi i review (ops-ci-cd), skany zależności i SBOM (ops-supply-chain-security), inwentarz tożsamości
i rotacja (ops-secrets-identities), IaC z planem w PR i wykrywaniem dryfu (ops-iac-terraform), postmortemy
i ćwiczenia odtwarzania (ops-sre-incidents), modele zagrożeń (arch-threat-modeling), dziennik decyzji i ADR
(core-project-record).

## Źródła
- NIST Cybersecurity Framework 2.0 (02.2024); ISO/IEC 27001:2022; AICPA Trust Services Criteria
- [roadmap.sh — DevSecOps](https://roadmap.sh/devsecops) (audit & compliance mapping, SOC 2, ISO 27001, NIST)
Opisane własnymi słowami.
