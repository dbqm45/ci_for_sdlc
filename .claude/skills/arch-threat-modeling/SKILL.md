---
name: arch-threat-modeling
description: Użyj przy modelu zagrożeń funkcji lub integracji — DFD z granicami zaufania, STRIDE, PASTA, ocena ryzyka, OWASP Top 10.
metadata:
  katalog: "Użyj przy projektowaniu funkcji, usługi lub integracji i przy zmianie granic zaufania — model zagrożeń (DFD z granicami zaufania, powierzchnia ataku, STRIDE per element, PASTA dla krytycznych procesów), ocena i kwantyfikacja ryzyka, decyzje o ryzyku, OWASP Top 10:2025. Nie do przeglądu konkretnego diffu (security-reviewer) ani reagowania na incydent (ops-security-operations)."
  slowa: "wyciek danych, atak, zagrożenie, ryzyko, ryzyko rezydualne, czy ochrona się opłaca, koszt zabezpieczeń, FAIR, prawdopodobieństwo i strata"
---

# Modelowanie zagrożeń

Cztery pytania (A. Shostack): **Co budujemy? Co może pójść źle? Co z tym zrobimy? Czy dobrze to zrobiliśmy?**
Model zagrożeń robi się przy projekcie, nie po wdrożeniu, i aktualizuje przy zmianach. Wynik to plik
`docs/project/04-architecture/threat-model.md` (core-project-record), a nie rozmowa.

## Kiedy (wyzwalacze)
Nowa usługa lub integracja zewnętrzna; nowy punkt wejścia (endpoint publiczny, webhook, upload, kolejka od partnera);
zmiana uwierzytelniania, sesji, uprawnień lub kryptografii; nowa kategoria danych (osobowe, płatnicze, zdrowotne);
nowy agent AI z narzędziami (core-agent-security). Drobna zmiana bez nowych przepływów → aktualizacja istniejącego
modelu w review, bez nowego warsztatu.

## Procedura
1. **Zakres i cel.** Co jest w modelu, co poza nim; aktywa (dane, pieniądze, reputacja, dostępność) i kto je chroni.
   Wymagania bezpieczeństwa z `requirements.md` i atrybutów jakości (arch-quality-attributes).
2. **Diagram przepływu danych (DFD)** w Mermaid: byty zewnętrzne (użytkownik, partner, IdP), procesy (usługi, funkcje),
   magazyny danych, przepływy z etykietą (co płynie, protokół) i **granice zaufania** (internet | DMZ | sieć aplikacji |
   dane | konto chmurowe | przeglądarka). Każde przecięcie granicy to kandydat na zagrożenie.
3. **Powierzchnia ataku**: lista punktów wejścia i wyjścia (logowanie, panele admina, wyszukiwanie, formularze, API,
   pliki, integracje, kanały operacyjne i monitoringu), każdy z: kto ma dostęp (anonim / użytkownik / admin / usługa),
   jakie dane przyjmuje, jaka kontrola. Najpierw to, co dostępne z internetu, i kod krytyczny (auth, krypto, uprawnienia).
4. **STRIDE per element** — dla każdego elementu DFD pytania z tabeli niżej. Zapisz zagrożenie jako scenariusz:
   „Napastnik [kto] może [co] przez [jak], bo [brak kontroli], skutek: [aktywo]”.
5. **Ocena ryzyka** (sekcja niżej) i **decyzja** dla każdego zagrożenia: *ograniczyć* (kontrola + test), *wyeliminować*
   (usunąć funkcję lub przepływ), *przenieść* (dostawca, ubezpieczenie, umowa), *zaakceptować*. Akceptacja ryzyka
   i przeniesienie to decyzje człowieka z właścicielem i datą przeglądu — agent je proponuje, nie podejmuje.
6. **Kontrole do backlogu i testów**: każde ograniczenie ma zadanie i test nadużycia (abuse case), np. „użytkownik B
   pobiera fakturę użytkownika A → 404”. Trafiają do planu (core-project-record) i do qa-test-design.
7. **Weryfikacja**: czy każdy przepływ przez granicę zaufania ma zagrożenia S/T/I, czy każdy magazyn danych ma I/T/D,
   czy każda decyzja ma właściciela. Model `proposed` → akceptacja człowieka.

## STRIDE per element (wg Microsoft / Shostack)
| Element DFD | S podszycie | T manipulacja | R wyparcie | I ujawnienie | D odmowa usługi | E podniesienie uprawnień |
|---|---|---|---|---|---|---|
| byt zewnętrzny | ✓ | | ✓ | | | |
| proces | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| magazyn danych | | ✓ | (✓ logi audytowe) | ✓ | ✓ | |
| przepływ danych | | ✓ | | ✓ | ✓ | |
| Kontrola typowa | uwierzytelnianie | integralność (podpis, MAC, walidacja) | log audytowy, podpis | szyfrowanie, autoryzacja, minimalizacja | limity, izolacja, autoskalowanie z górnym limitem | autoryzacja, najmniejsze uprawnienia |

## PASTA — gdy liczy się wpływ na biznes
Siedem etapów, prowadzonych od celów biznesu: (1) cele biznesowe i bezpieczeństwa, (2) zakres techniczny,
(3) dekompozycja aplikacji (DFD), (4) analiza zagrożeń (kto i po co atakuje — dane o realnych atakach w branży),
(5) analiza podatności i słabych punktów, (6) modelowanie ataków (drzewa ataków), (7) analiza ryzyka i wpływu.
Stosuj dla procesów krytycznych (płatności, rozliczenia, dane medyczne) i gdy decyzję podejmuje biznes; na co dzień
wystarcza STRIDE.

## Ocena i kwantyfikacja ryzyka
- **Jakościowo (domyślnie)**: prawdopodobieństwo (dostępność z internetu, wymagane uprawnienia, złożoność, czy jest
  gotowy exploit) × wpływ (dane, pieniądze, dostępność, zakres) w skali 1–3 lub 1–5. Ryzyko = iloczyn; próg akcji
  zapisany w ADR.
- **Ilościowo (dla decyzji budżetowych)**: FAIR — częstość zdarzeń strat × wielkość straty, podane jako przedziały
  (min, najbardziej prawdopodobne, max) i symulacja Monte Carlo. Wynik: roczna strata w przedziale, porównywalna
  z kosztem kontroli. Liczby z danych (incydenty, branża), a nie z intuicji jednej osoby.
- Ryzyko po kontroli (rezydualne) zapisujesz osobno — to ono idzie do akceptacji.

## Klasy błędów do sprawdzenia — OWASP Top 10:2025
A01 Broken Access Control · A02 Security Misconfiguration · A03 Software Supply Chain Failures (ops-supply-chain-security)
· A04 Cryptographic Failures (ops-secrets-identities, `kryptografia-i-pki.md`) · A05 Injection · A06 Insecure Design (ten
skill) · A07 Authentication Failures (be-auth-security) · A08 Software or Data Integrity Failures · A09 Security Logging
and Alerting Failures (ops-security-operations) · A10 Mishandling of Exceptional Conditions (fail closed, bez wycieku
szczegółów w błędach). Dla API: OWASP API Top 10 w be-api-design.

## Szablon pliku `threat-model.md`
Nagłówek artefaktu (core-project-record) + sekcje: Zakres i aktywa · DFD (Mermaid) · Powierzchnia ataku (tabela) ·
Zagrożenia (ID, element, STRIDE, scenariusz, prawdopodobieństwo, wpływ, ryzyko, decyzja, kontrola, test, właściciel) ·
Ryzyka zaakceptowane (kto, do kiedy) · Założenia · Otwarte pytania · Przekazanie.

## Przykład
**Sytuacja:** „Operator płatności wysyła potwierdzenia wpłat na nasz webhook; po nim zamówienie idzie do wysyłki.”
**Wynik** (fragment `threat-model.md`, skala 1–3):

| ID | Element | STRIDE | Scenariusz | R | Decyzja i kontrola | Test nadużycia |
|---|---|---|---|---|---|---|
| Z-1 | operator → webhook | S | Napastnik wysyła fałszywe potwierdzenie, bo nie sprawdzamy nadawcy; skutek: towar bez zapłaty | 9 | ograniczyć: podpis (MAC) | brak podpisu → 401, stan bez zmian |
| Z-2 | operator → webhook | T | Powtórzenie podpisanego żądania; skutek: podwójne księgowanie | 4 | ograniczyć: deduplikacja po id | to samo żądanie 2× → 1 efekt |

Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] DFD z granicami zaufania i etykietami przepływów
- [ ] każdy punkt wejścia z internetu na liście powierzchni ataku
- [ ] STRIDE dla każdego elementu przecinającego granicę
- [ ] każde zagrożenie z decyzją; akceptacje z właścicielem i datą (tylko człowiek)
- [ ] kontrole w backlogu i testy nadużyć w planie testów

## Źródła
- A. Shostack, *Threat Modeling: Designing for Security* (2014); [OWASP Threat Modeling Process](https://owasp.org/www-community/Threat_Modeling_Process),
  [OWASP Attack Surface Analysis Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Attack_Surface_Analysis_Cheat_Sheet.html)
- PASTA — T. UcedaVélez, M. Morana, *Risk Centric Threat Modeling* (2015); FAIR — J. Freund, J. Jones, *Measuring and Managing Information Risk* (2014)
- [OWASP Top 10:2025](https://owasp.org/Top10/2025/); [roadmap.sh — DevSecOps](https://roadmap.sh/devsecops)
Opisane własnymi słowami.
