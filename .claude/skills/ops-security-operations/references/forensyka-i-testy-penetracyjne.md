# Forensyka po incydencie i testy penetracyjne

## Forensyka — zasady
- **Kolejność ulotności** (RFC 3227): najpierw to, co znika najszybciej — rejestry i pamięć podręczna, pamięć RAM
  (procesy, połączenia, klucze), stan sieci, procesy; potem dyski, logi zdalne, kopie zapasowe, nośniki archiwalne.
  Wyłączenie maszyny kasuje pamięć, w której często jest jedyny ślad.
- **Nie pracuj na oryginale**: obraz dysku (np. `dd`, FTK Imager) lub migawka wolumenu w chmurze, zrzut pamięci
  narzędziem do akwizycji, skrót (SHA-256) obrazu przy pobraniu i przy każdym użyciu; analiza na kopii, w odizolowanym
  środowisku.
- **Łańcuch dowodowy**: kto, kiedy, skąd, jakim narzędziem pobrał dowód, gdzie go przechowywano, kto miał dostęp.
  Bez tego dowód może nie mieć wartości w sporze lub postępowaniu.
- **Oś czasu** w UTC z wielu źródeł (logi systemu i aplikacji, logi chmury, EDR, zapory, poczty) — synchronizacja
  zegarów to warunek (ops-security-operations: telemetria).
- Narzędzia analizy (np. Autopsy, Volatility dla pamięci, edytory szesnastkowe) obsługuje osoba przeszkolona; w poważnym
  incydencie lub przy możliwym postępowaniu prawnym — zewnętrzny zespół reagowania (kontakt z planu).
- Rola agenta: zbiera i porządkuje fakty, buduje oś czasu z logów, pilnuje listy dowodów; **nie** zmienia stanu
  zaatakowanych systemów bez decyzji osoby dowodzącej (SKILL.md: reagowanie).

## Testy penetracyjne i ćwiczenia zespołów
- **Zasady zaangażowania** (rules of engagement) na piśmie, **przed** testem: pisemna zgoda właściciela systemów,
  zakres (adresy, domeny, aplikacje, konta) i wyłączenia, dozwolone techniki (np. bez DoS, bez socjotechniki), okna
  czasowe, kontakty awaryjne i warunki natychmiastowego przerwania, postępowanie z danymi znalezionymi w trakcie,
  sposób raportowania i usunięcia artefaktów testu.
- Systemy dostawców chmury i SaaS: tylko w granicach ich polityk testów (większość dużych dostawców je publikuje).
- Zespoły: **czerwony** (atakuje według scenariusza), **niebieski** (broni i wykrywa), **purpurowy** (oba razem,
  test po teście poprawiają wykrywanie). Wynik ćwiczenia to nowe reguły i poprawki, nie tylko raport.
- Raport: podatność, dowód, wpływ, prawdopodobieństwo, rekomendacja; potwierdzenie naprawy ponownym testem.
- Szkolenie praktyczne: legalne laboratoria i platformy CTF (np. TryHackMe, Hack The Box, picoCTF) — nigdy cudze
  systemy.

## Zasada dla agentów fabryki
Agent **nie uruchamia** skanerów portów i podatności, frameworków eksploitów ani narzędzi do łamania haseł wobec
żadnego systemu bez pisemnego zakresu i zgody człowieka w rozmowie — także „tylko sprawdzić” cudzy adres. W zakresie
testów (własne środowisko testowe, zgoda) stosuje zasady zaangażowania powyżej. Skan bierny własnej aplikacji na
stagingu (OWASP ZAP w trybie bazowym) jest częścią CI (qa-regression, `dane-srodowiska-i-specjalne.md`).

## Źródła
- RFC 3227 *Guidelines for Evidence Collection and Archiving*; NIST SP 800-86 *Guide to Integrating Forensic Techniques
  into Incident Response*
- [roadmap.sh — Cyber Security](https://roadmap.sh/cyber-security) (forensics, memdump, dd, FTK Imager, Autopsy,
  rules of engagement, blue/red/purple teams, CTF)
Opisane własnymi słowami.
