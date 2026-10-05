---
name: arch-architect-practice
description: Użyj przy pracy architekta poza techniką — decyzje i ich komunikacja, szacowanie, ATAM, arc42/C4/ADR, TOGAF, ITIL.
metadata:
  katalog: "Użyj przy pracy architekta poza samą techniką — poziomy architektury, podejmowanie i komunikowanie decyzji, szacowanie, przegląd architektury (ATAM), upraszczanie, dokumentacja (arc42, C4, ADR), coaching, ramy korporacyjne (TOGAF, ITIL). Nie do atrybutów jakości (arch-quality-attributes) ani wyboru stacku (arch-tech-selection)."
  slowa: "decyzja architektoniczna, zakomunikować decyzję, utrwalić decyzję, wracamy do tej samej dyskusji, ADR, rekord decyzji, przegląd architektury, ATAM, arc42, C4, interesariusze architektury, szacowanie architekta"
---

# Praktyka architekta

Architekt odpowiada za decyzje, które są drogie do zmiany, i za to, żeby zespół je rozumiał i stosował. Kod piszesz
o tyle, o ile trzeba, żeby decyzje były osadzone w rzeczywistości (prototyp, szkielet, przegląd).

## Poziomy architektury
| Poziom | Zakres | Typowe pytania | Wynik |
|---|---|---|---|
| **aplikacja** | wnętrze jednego systemu: moduły, warstwy, wzorce | jak podzielić kod, gdzie granice modułów, jak testować | struktura modułów, ADR, fitness functions (eng-*, ddd-tactical-design) |
| **rozwiązanie** | kilka systemów dla jednej potrzeby biznesowej | jak systemy się integrują, przepływ danych, technologie | architektura rozwiązania, mapa kontekstów, kontrakty (ddd-context-mapping, be-api-design) |
| **przedsiębiorstwo** | cała organizacja: zdolności biznesowe, portfel systemów | które systemy rozwijać, wygaszać, łączyć; standardy | mapy zdolności i aplikacji, zasady, mapa drogowa (`references/ramy-korporacyjne.md`) |
Zadanie zawsze nazywa poziom — inaczej rozmowa o „architekturze” miesza wnętrze modułu ze strategią firmy.

## Oczekiwania wobec architekta (wg Richardsa i Forda)
Podejmuje decyzje architektoniczne (i prowadzi do nich, zamiast dyktować technologie); stale analizuje architekturę
i jej dryf; śledzi trendy i ocenia je krytycznie; pilnuje zgodności z decyzjami (automatycznie, fitness functions);
zna różne technologie powierzchownie i kilka głęboko; zna domenę biznesu; ma umiejętności interpersonalne; rozumie
organizację i jej politykę (bez tego najlepsza decyzja nie zostanie wdrożona).

## Decyzje
1. **Czy to decyzja architektoniczna?** Dotyczy struktury, atrybutów jakości, zależności, interfejsów lub technik
   budowy i jest kosztowna do odwrócenia. Odwracalne szczegóły zostaw zespołowi.
2. **Czynniki**: scenariusze atrybutów jakości, ograniczenia (budżet, termin, kompetencje, regulacje), istniejące
   decyzje (ADR) i dane, nie opinie. Brak faktów → researcher lub spike, nie domysł.
3. **Opcje**: co najmniej dwie realne plus „nic nie zmieniać”; dla każdej kompromisy wprost (co zyskujemy, co
   tracimy). Nie ma rozwiązania najlepszego, jest najmniej złe dla tych czynników.
4. **Odwracalność**: przy remisie wybierz łatwiejsze do zmiany; drogie decyzje odkładaj do ostatniego odpowiedzialnego
   momentu, ale przygotuj to, co potrzebne do ich podjęcia.
5. **Zapis**: ADR z kontekstem, opcjami i konsekwencjami (core-tech-docs); akceptuje człowiek (core-project-record).
6. **Komunikacja**: decyzję tłumaczysz trzem odbiorcom — zespołowi (co robić inaczej i dlaczego), biznesowi (koszt,
   ryzyko, termin, w jego języku), operacjom (co zmienia się w utrzymaniu). Uzasadnienie „dlaczego” jest ważniejsze
   niż „co”.
Anty-wzorce: decyzja odkładana bez końca w oczekiwaniu na pełną informację; „architektura z wieży” bez kontaktu
z kodem; ta sama dyskusja co miesiąc, bo decyzja nie została zapisana.

## Upraszczanie i równowaga
- Pytania przy każdej propozycji: dlaczego to lepsze od alternatyw, czy da się prościej, jaki jest koszt budowy,
  utrzymania i operacji, czy ten przypadek brzegowy uzasadnia koszt?
- Złożoność nie jest dowodem kompetencji. Technologia wybrana, bo jest nowa, a nie dlatego, że rozwiązuje problem,
  to dług (eng-design-principles: drabina minimalizmu, YAGNI).
- Równowaga: szybkość kontra jakość, innowacja kontra stabilność — świadoma decyzja z zapisanym długiem
  (eng-tech-debt-audit), nie milcząca zgoda.

## Szacowanie i ocena
- **Szacowanie**: przedziały (optymistycznie / najbardziej prawdopodobnie / pesymistycznie), rozbicie na części,
  porównanie z podobnymi wykonanymi zadaniami, jawne założenia i niewiadome; największe niewiadome zamieniasz w spike.
  Prognozowanie przepływem: proc-agile.
- **Ocena architektury (lekki przegląd w stylu ATAM)**: (1) cele biznesowe i scenariusze jakości z priorytetami,
  (2) prezentacja architektury i decyzji, (3) dla każdego ważnego scenariusza: które decyzje go wspierają, gdzie są
  **punkty wrażliwości** (jedna decyzja silnie wpływa na atrybut), **kompromisy** (decyzja poprawia jeden atrybut
  kosztem innego) i **ryzyka**, (4) raport z ryzykami i rekomendacjami. Okresowo i przed dużą zmianą; ciągłe
  sprawdzanie przez fitness functions (arch-quality-attributes).

## Dokumentacja architektury
- **ADR** dla decyzji (core-tech-docs) — najważniejszy dokument, bo zapisuje „dlaczego”.
- **Model C4** dla widoków: kontekst (system i otoczenie), kontenery (aplikacje i magazyny danych), komponenty (w razie
  potrzeby); poziom kodu zwykle zbędny. Diagram jako kod w repo (core-tech-docs, `diagramy-i-prezentacje.md`).
- **arc42** jako szablon dokumentu architektury (cele, ograniczenia, kontekst, strategia rozwiązania, widoki, koncepcje
  przekrojowe, decyzje, wymagania jakości, ryzyka, słownik) — wypełniasz tylko sekcje, które ktoś przeczyta.
- Dokumentacja żyje w repo i jest aktualizowana z kodem; to, co da się wygenerować (grafy zależności —
  eng-codebase-mapping, referencja API), generujesz.

## Doradztwo i coaching
- Przegląd projektów i PR pod kątem decyzji architektonicznych, nie stylu (od tego są lintery).
- Pytania zamiast gotowych odpowiedzi tam, gdzie zespół ma się czegoś nauczyć; gotowa odpowiedź tam, gdzie liczy się czas
  lub ryzyko.
- Wiedza architekta skaluje się przez standardy w kodzie (generatory, szablony, reguły granic — tool-nx), przykłady
  referencyjne i warsztaty, nie przez bycie wąskim gardłem każdej decyzji (fe-engineering-levels, proc-team-topologies).

## Checklista
- [ ] poziom architektury nazwany; decyzja architektoniczna odróżniona od szczegółu
- [ ] ≥ 2 opcje z kompromisami, czynniki z danych, odwracalność oceniona
- [ ] ADR i komunikat dla zespołu, biznesu i operacji
- [ ] szacunek w przedziałach z założeniami; spike dla największej niewiadomej
- [ ] widoki C4 i dokumenty w repo, aktualizowane z kodem

## Źródła
- M. Richards, N. Ford, *Fundamentals of Software Architecture* (2. wyd. 2025) — oczekiwania wobec architekta,
  decyzje; N. Ford i in., *Building Evolutionary Architectures* — fitness functions
- SEI (R. Kazman i in.) — ATAM; S. Brown — [C4 model](https://c4model.com/); [arc42](https://arc42.org/)
- InfoQ, [Driving Architectural Simplicity](https://www.infoq.com/articles/driving-architectural-simplicity/);
  [roadmap.sh — Software Architect](https://roadmap.sh/software-architect)
Opisane własnymi słowami.
