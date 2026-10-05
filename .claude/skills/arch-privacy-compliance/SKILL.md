---
name: arch-privacy-compliance
description: Użyj, gdy system przetwarza dane osobowe (RODO) — podstawy, minimalizacja, retencja, DPIA, prawa osób, procesory, naruszenia.
metadata:
  katalog: "Użyj, gdy system przetwarza dane osobowe — nowa funkcja, integracja, analityka, logi, wysyłanie danych do zewnętrznych usług (także AI) — przy projektowaniu i przeglądzie: inwentarz danych (wkład do art. 30), cel i podstawa prawna, prywatność w fazie projektowania i domyślna (minimalizacja, pseudonimizacja), retencja i usuwanie, realizacja praw osób (dostęp, usunięcie, przenoszenie) także w kopiach zapasowych, logach i u procesorów, umowy powierzenia i transfery poza EOG, ocena skutków (DPIA), naruszenia ochrony danych (72 godziny), cookies. Nie do uwierzytelniania i haseł (be-auth-security), modelu zagrożeń (arch-threat-modeling), reagowania na incydent bezpieczeństwa (ops-security-operations) ani zarządzania danymi w potokach i AI Act (data-engineering). Nie jest poradą prawną."
  slowa: "RODO, GDPR, dane osobowe, ochrona danych, prywatność, UODO, IOD, inspektor ochrony danych, DPIA, ocena skutków, prawo do usunięcia, bycia zapomnianym, retencja danych, zgoda, cookies, ciasteczka, umowa powierzenia, wyciek danych, naruszenie ochrony danych, pseudonimizacja, anonimizacja, pod kątem RODO, zgodnie z RODO, analityka zachowań użytkowników, żądanie usunięcia danych"
---

# Ochrona danych osobowych (RODO) w projekcie

**Rola agenta:** przygotowuje inwentarz danych, projekt zabezpieczeń, szkic oceny skutków i procedury, a także
wskazuje decyzje do podjęcia. **Decyzje prawne** — podstawa przetwarzania, czy DPIA jest wymagana, czy zgłaszać
naruszenie, treść klauzul — podejmuje człowiek z inspektorem ochrony danych (IOD) lub prawnikiem. To nie jest porada
prawna. Artefakt: `docs/project/04-architecture/privacy.md` (szablon w core-project-record).

## Zasady
1. **Inwentarz przed kodem.**
   - Spisz: jakie dane, czyje (klienci, pracownicy, dzieci), skąd, po co, gdzie leżą — baza, **logi, kopie
     zapasowe, analityka, środowiska testowe, kolejki, zewnętrzni dostawcy** — i kto ma dostęp.
   - Przepływy zaznacz na diagramie przepływu danych z arch-threat-modeling.
   - To wkład do rejestru czynności przetwarzania (art. 30), który prowadzi administrator.
2. **Cel i podstawa prawna dla każdego celu** (art. 5–6):
   - podstawy z art. 6 ust. 1: umowa, obowiązek prawny, prawnie uzasadniony interes, zgoda i inne;
   - szczególne kategorie danych (zdrowie, biometria do identyfikacji, poglądy i inne z art. 9) wymagają dodatkowej
     przesłanki;
   - zgoda (art. 7) tylko tam, gdzie pasuje: dobrowolna, konkretna, udokumentowana i możliwa do wycofania tak łatwo,
     jak ją wyrażono;
   - analityka zachowań to zwykle osobny cel z osobną podstawą.
3. **Prywatność w fazie projektowania i domyślna** (art. 25):
   - zbieraj tylko pola potrzebne do celu; pole opcjonalne jest naprawdę opcjonalne;
   - domyślnie najwęższa widoczność i najkrótsze przechowywanie;
   - pseudonimizacja — identyfikator kluczem HMAC zamiast e-maila w analityce i logach;
   - agregaty zamiast surowych zdarzeń.
   - Dane pseudonimizowane nadal są danymi osobowymi dla tego, kto ma klucz.
4. **Retencja:**
   - okres przechowywania dla każdej kategorii i celu;
   - **automatyczne usuwanie** (zadanie retencji z testem), a nie „kiedyś posprzątamy”;
   - logi bez danych osobowych albo z krótką retencją;
   - kopie zapasowe wygasają w znanym cyklu.
5. **Prawa osób** (art. 12–22):
   - mechanizmy w systemie: eksport danych (dostęp, przenoszenie), poprawienie, usunięcie, ograniczenie, sprzeciw;
   - odpowiedź bez zbędnej zwłoki, **najpóźniej w miesiąc** (przedłużenie o dwa miesiące w uzasadnionych przypadkach,
     z informacją dla osoby);
   - usunięcie obejmuje kopie u **procesorów** (polecenie usunięcia) i logi;
   - w **kopiach zapasowych** dane wygasają z cyklem kopii, a po odtworzeniu kopii usunięcie stosujesz ponownie
     (lista usuniętych identyfikatorów);
   - przed wydaniem danych weryfikujesz tożsamość.
6. **Podmioty przetwarzające i transfery:**
   - każdy dostawca, który przetwarza dane w Twoim imieniu (chmura, mailing, analityka, obsługa klienta,
     **API modelu AI**), potrzebuje umowy powierzenia (art. 28) i wpisu na listę;
   - transfer poza EOG (rozdz. V) wymaga podstawy: decyzji o odpowiednim stopniu ochrony albo standardowych klauzul
     umownych;
   - USA: EU–US Data Privacy Framework (decyzja z 10.07.2023) obejmuje tylko certyfikowane firmy; Sąd UE oddalił
     skargę na tę decyzję 3.09.2025 (T-553/23), a odwołanie (C-703/25 P) jest w toku — śledź wynik.
7. **Bezpieczeństwo** (art. 32):
   - szyfrowanie w spoczynku i w transmisji, najmniejsze uprawnienia, rejestr dostępu do danych, kopie i testy
     odtworzenia (be-auth-security, ops-secrets-identities, ops-sre-incidents);
   - **w środowiskach testowych nie ma prawdziwych danych osobowych** — tylko dane syntetyczne lub skutecznie
     zanonimizowane;
   - przykład z praktyki: UODO ukarał administratora i podmiot przetwarzający za niezabezpieczoną testową bazę
     z prawdziwymi danymi.
8. **Ocena skutków dla ochrony danych (DPIA, art. 35):**
   - wymagana przy prawdopodobnie wysokim ryzyku, m.in. przy profilowaniu z istotnymi skutkami, szczególnych
     kategoriach na dużą skalę i monitorowaniu miejsc publicznych na dużą skalę;
   - w Polsce także dla operacji z wykazu Prezesa UODO (M.P. 2019 poz. 666), np. dane biometryczne lub lokalizacyjne,
     innowacyjne technologie, łączenie zbiorów;
   - agent przygotowuje szkic: opis, cel, niezbędność, ryzyka i środki; decyzję podejmuje administrator z IOD.
9. **Naruszenie ochrony danych** (art. 33–34):
   - zgłoszenie do UODO **bez zbędnej zwłoki, w miarę możliwości do 72 godzin** od stwierdzenia, chyba że naruszenie
     raczej nie spowoduje ryzyka;
   - przy wysokim ryzyku zawiadomienie osób;
   - każde naruszenie dokumentujesz, także niezgłoszone;
   - procesor zawiadamia administratora bez zbędnej zwłoki;
   - agent zatrzymuje wyciek i zabezpiecza dowody (ops-security-operations), przygotowuje fakty do zgłoszenia,
     a o zgłoszeniu decyduje człowiek;
   - procedura z osią czasu: `references/rodo-w-praktyce.md`.
10. **Cookies i dostęp do urządzenia:**
    - poza technicznie niezbędnymi potrzebna jest zgoda przed zapisem;
    - bez domyślnie zaznaczonych zgód (TSUE, Planet49, C-673/17);
    - odmowa tak samo dostępna jak zgoda;
    - w Polsce przepisy o dostępie do urządzenia są w Prawie komunikacji elektronicznej, w mocy od 10.11.2024
      [numer artykułu i organ nadzoru — sprawdź w ISAP przed cytowaniem].
11. **Dane w promptach do modeli AI** to przekazanie danych dostawcy:
    - minimalizujesz i pseudonimizujesz przed wysłaniem;
    - sprawdzasz umowę powierzenia, region przetwarzania i retencję u dostawcy;
    - obowiązki z AI Act: data-engineering (`.claude/skills/data-engineering/references/jakosc-zarzadzanie-i-zgodnosc.md`).
12. **Kary** (art. 83): do 10 mln EUR lub 2% światowego obrotu, a za naruszenie zasad, podstaw i praw osób do
    20 mln EUR lub 4% (wyższa z kwot).

## Zmiany w prawie — stan 2026-10-03
- Pakiet **Digital Omnibus** (projekt Komisji COM(2025) 837 z 19.11.2025) proponuje m.in.:
  - zgłaszanie do organu tylko naruszeń o wysokim ryzyku, w 96 godzin, przez wspólny punkt;
  - przeniesienie zasad cookies do RODO;
  - wspólne dla UE wykazy operacji wymagających DPIA;
  - doprecyzowanie definicji danych osobowych.
- To **projekt w trakcie prac** (Rada bez mandatu w czerwcu 2026, Parlament na etapie komisji). Do czasu przyjęcia
  i wejścia w życie obowiązują obecne przepisy — nie projektuj pod 96 godzin.

## Checklista
- [ ] inwentarz danych (z logami, kopiami, testami, dostawcami) i przepływy na diagramie
- [ ] cel i podstawa prawna dla każdego celu — zatwierdzone przez człowieka/IOD
- [ ] minimalizacja i pseudonimizacja w projekcie; brak prawdziwych danych w testach
- [ ] okresy retencji i automatyczne usuwanie z testem
- [ ] obsługa praw osób, w tym usunięcie u procesorów i po odtworzeniu kopii
- [ ] lista procesorów z umowami powierzenia i podstawą transferu poza EOG
- [ ] decyzja o DPIA zapisana w `decisions.md`; procedura naruszeń z rolami i 72 godzinami

## Źródła
- Rozporządzenie (UE) 2016/679 (RODO) — eur-lex.europa.eu (art. 5–7, 9, 12–22, 25, 28, 30, 32–35, 44–49, 83)
- EDPB: wytyczne 4/2019 (art. 25, wersja 2.0 z 20.10.2020), 9/2022 (zgłaszanie naruszeń, wersja 2 z 2023),
  01/2025 (pseudonimizacja, konsultacje), opinia 08/2024 („consent or pay”) — edpb.europa.eu
- UODO: wykaz operacji wymagających DPIA (M.P. 2019 poz. 666); decyzje i komunikaty 2025–2026 — uodo.gov.pl
- Sąd UE T-553/23 Latombe (3.09.2025), odwołanie C-703/25 P; TSUE C-673/17 Planet49 — curia.europa.eu
- Digital Omnibus: procedura 2025/0360(COD) (oeil.europarl.europa.eu), wspólna opinia EDPB-EDPS 2/2026
- Prawo komunikacji elektronicznej, Dz.U. 2024 poz. 1221 (w mocy od 10.11.2024)
Dostęp 2026-10-03. Opisane własnymi słowami; nie jest poradą prawną.
