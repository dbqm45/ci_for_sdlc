# Jakość danych, zarządzanie danymi i zgodność

## Wymiary jakości
| Wymiar | Pytanie | Przykładowy test |
|---|---|---|
| kompletność | czy są wszystkie rekordy i pola | liczba wierszy vs źródło, odsetek braków |
| poprawność | czy wartości odpowiadają rzeczywistości | uzgodnienie sumy z systemem źródłowym, zakresy |
| spójność | czy te same fakty zgadzają się między tabelami | klucze obce, suma szczegółów = suma nagłówka |
| aktualność | czy dane są świeże | czas ostatniej aktualizacji vs SLA |
| ważność | czy pasują do formatu i reguł | wzorce (NIP, e-mail), wartości dozwolone |
| unikalność | czy nie ma duplikatów | unikalność klucza biznesowego |
- Testy przy każdym uruchomieniu potoku (dbt tests, Great Expectations, Soda albo własne zapytania), z progiem:
  ostrzeżenie czy zatrzymanie publikacji.
- Każdy zbiór ma **właściciela** i **odbiorców**; incydent jakości obsługujesz jak incydent usługi (ops-sre-incidents):
  wykrycie, komunikat do odbiorców, naprawa, backfill, analiza przyczyny.
- Obserwowalność danych: świeżość, wolumen, rozkłady, schemat i pochodzenie w jednym widoku; anomalie wolumenu
  i rozkładu łapią błędy, na które nie ma testu.

## Metadane, katalog i pochodzenie
- **Katalog danych**: co istnieje, opis, właściciel, klasyfikacja (publiczne, wewnętrzne, poufne, osobowe), świeżość,
  przykładowe zapytania. Bez katalogu ludzie budują własne kopie tych samych danych.
- **Pochodzenie** (lineage): z jakich źródeł i transformacji powstała kolumna lub tabela — do oceny wpływu zmiany,
  szukania przyczyny błędu i odpowiedzi na żądania RODO. Generowane automatycznie (dbt, standard OpenLineage), nie
  rysowane ręcznie.
- **Architektura „najpierw metadane”**: potoki, uprawnienia i jakość sterowane z deklaracji (schemat, właściciel,
  klasyfikacja, reguły jakości), a nie zaszyte w kodzie.

## Organizacja danych
| Pojęcie | Czym jest |
|---|---|
| **jezioro danych** | magazyn plików w surowej postaci, różne formaty; tani, ale bez zarządzania staje się „bagnem” |
| **hurtownia** i **hurtownia tematyczna** (data mart) | modele do analityki; hurtownia tematyczna — wycinek dla jednego działu |
| **lakehouse** | jezioro z formatem tabel (Iceberg, Delta, Hudi) — transakcje i schemat jak w hurtowni |
| **hub danych** | punkt wymiany danych między systemami z kontrolą dostępu |
| **data fabric** | warstwa integracji i metadanych łącząca rozproszone źródła, często z automatyzacją |
| **data mesh** | organizacyjnie: domeny odpowiadają za swoje dane jako **produkty** (właściciel, kontrakt, jakość, dokumentacja), platforma samoobsługowa, wspólne zasady federacyjne. Wymaga dojrzałości zespołów; odpowiada granicom kontekstów DDD (ddd-strategic-analysis, proc-team-topologies) |
Wybierasz według skali organizacji, a nie mody: mały zespół zwykle potrzebuje jednej hurtowni z dbt.

## Ochrona danych
- **Klasyfikacja** kolumn (dane osobowe, szczególne, finansowe) w katalogu, uprawnienia według klasyfikacji (dostęp
  na poziomie kolumn i wierszy w hurtowni).
- **Maskowanie** (dynamiczne — w zależności od uprawnień — lub statyczne w kopiach), **pseudonimizacja**
  i **tokenizacja** (wartość zastąpiona tokenem, mapowanie w osobnym, chronionym magazynie — np. numery kart przez
  dostawcę płatności), **anonimizacja** nieodwracalna dla danych testowych i otwartych. Pseudonimizacja i tokenizacja
  to nadal dane osobowe w rozumieniu RODO.
- Szyfrowanie w ruchu i w spoczynku, klucze w KMS (ops-secrets-identities, `kryptografia-i-pki.md`).
- Minimalizacja i retencja: dane trzymasz tylko tak długo, jak cel tego wymaga; usuwanie obejmuje też kopie,
  migawki i hurtownię.

## Prawo (dział prawny rozstrzyga, agent przygotowuje fakty)
- **RODO**: podstawa prawna i cel przetwarzania, prawo dostępu, sprostowania i usunięcia (pochodzenie pokazuje, gdzie
  są dane osoby), przekazywanie poza EOG, rejestr czynności przetwarzania, ocena skutków dla ryzykownych przetwarzań.
- **AI Act** (UE): obowiązki przejrzystości (art. 50 — informowanie o kontakcie z AI, oznaczanie treści syntetycznych)
  stosuje się od 2.08.2026; pakiet Digital Omnibus przesunął obowiązki dla systemów wysokiego ryzyka z załącznika III
  na 2.12.2027, a z załącznika I na 2.08.2028 — sprawdź, czy zmiany weszły w życie i jak brzmią w dniu decyzji.
  Dla danych: dokumentacja źródeł i jakości danych treningowych, przeciwdziałanie stronniczości.
- Inne jurysdykcje według rynku (np. w USA przepisy federalne o komunikacji elektronicznej — ECPA — i stanowe ustawy
  o prywatności).

## Źródła
- DAMA-DMBOK (wymiary jakości); Z. Dehghani, *Data Mesh* (2022); OpenLineage; dokumentacja dbt
- [Jones Walker — EU AI Act Digital Omnibus](https://www.joneswalker.com/en/insights/blogs/ai-law-blog/yes-august-2-still-matters-the-eu-approved-a-high-risk-ai-delay-but-most-trans.html?id=102nbon)
- [roadmap.sh — Data Engineer](https://roadmap.sh/data-engineer) (data quality, lineage, metadata management, data lake,
  mart, hub, fabric, mesh, masking, obfuscation, tokenization, GDPR, EU AI Act, ECPA)
Opisane własnymi słowami.
