---
name: proc-safe
description: Użyj, gdy pracuje wiele zespołów w SAFe — Agile Release Train, PI Planning, role, WSJF, Inspect & Adapt, LPM.
metadata:
  katalog: "Użyj, gdy praca obejmuje wiele zespołów w dużej organizacji stosującej SAFe — Agile Release Train, PI Planning, role (RTE, Product Management, System Architect, Business Owners), hierarchia backlogu, WSJF, Inspect & Adapt, Lean Portfolio Management — oraz przy ocenie, czy SAFe pasuje. Nie do pracy pojedynczego zespołu (proc-agile)."
---

# SAFe (Scaled Agile Framework)

Stan wiedzy: SAFe 6.0 z aktualizacjami 2025 (model **pięciu dyscyplin**: Leadership and Culture, Team and Technical Agility,
Product Development Flow, Large Solution Integration and Delivery, Lean Portfolio Management; inicjatywa AI-Driven Agility).
Podstawowe konstrukcje (ART, PI Planning, LPM) bez zmian. Szczegóły sprawdzaj na framework.scaledagile.com.

## 10 zasad Lean-Agile SAFe
1. Patrz ekonomicznie. 2. Myśl systemowo. 3. Zakładaj zmienność, zachowuj opcje. 4. Buduj przyrostowo w szybkich,
zintegrowanych cyklach uczenia się. 5. Kamienie milowe = obiektywna ocena działających systemów. 6. Zapewnij nieprzerwany
przepływ wartości. 7. Stosuj kadencję i synchronizuj planowanie między domenami. 8. Uwalniaj wewnętrzną motywację pracowników
wiedzy. 9. Decentralizuj decyzje. 10. Organizuj się wokół wartości.

## Konstrukcje
- **Konfiguracje**: Essential (zespoły + ART), Large Solution (wiele ARTów), Portfolio (+ zarządzanie portfelem), Full.
- **Agile Release Train (ART)**: długotrwały zespół zespołów (zwykle ~50–125 osób) zorganizowany wokół strumienia wartości.
- **Program Increment (PI)**: kadencja zwykle 8–12 tygodni (kilka iteracji + iteracja IP: innowacje i planowanie).
- **Wydarzenia ART**: **PI Planning** (wszyscy razem, cele PI i zależności na tablicy programu), ART Sync (Coach Sync + PO Sync),
  **System Demo** (zintegrowany przyrost co iterację), **Inspect & Adapt** (demo, metryki, warsztat rozwiązywania problemów).
- **Role**: Release Train Engineer (RTE), Product Management (co na poziomie ARTu), System Architect, Business Owners
  (akceptują cele PI i ich wartość), w zespołach Product Owner i Scrum Master/Team Coach.
- **Backlog**: Epik (portfel, z hipotezą i Lean business case) → Capability (Large Solution) → Feature (ART, mieści się w PI) → Story (zespół).
- **Priorytety: WSJF** = koszt opóźnienia (wartość biznesowa + krytyczność czasowa + redukcja ryzyka/otwarcie możliwości) / rozmiar.
- **Lean Portfolio Management**: finansowanie strumieni wartości zamiast projektów, Portfolio Kanban, ograniczanie WIP epików.

## Kiedy pasuje, a kiedy nie
- Pasuje: wiele zespołów pracuje nad wspólnym rozwiązaniem z realnymi zależnościami i potrzebą synchronizacji; organizacja
  gotowa zmienić finansowanie i strukturę wokół strumieni wartości.
- Nie pasuje / ryzyka: kilka niezależnych zespołów (wystarczy proc-agile), SAFe jako nakładka nazw na stary proces
  („SAFe-washing”), PI Planning jako kontrakt zakresu zamiast wspólnego planu, ARTy cięte według działów zamiast wartości.
- Zanim dołożysz koordynacji, **zmniejsz zależności**: granice kontekstów (ddd-strategic-analysis) i struktura zespołów
  (proc-team-topologies) często usuwają potrzebę skalowania procesu.

## Przykład
**Sytuacja:** Product Management spiera się: „BLIK przynosi najwięcej, więc pierwszy”. **Wynik (WSJF, oceny
względne):** BLIK ma najwyższy koszt opóźnienia, ale mniejsze featury dają więcej na jednostkę pracy; to podstawa
rozmowy na PI Planning, nie wyrok.

| Feature | Koszt opóźnienia | Rozmiar | WSJF |
|---|---|---|---|
| Flagi funkcji | 1 + 2 + 8 = 11 | 2 | **5,5** |
| Wymiana biblioteki szyfrowania | 2 + 8 + 7 = 17 | 5 | **3,4** |
| Płatność BLIK | 9 + 7 + 2 = 18 | 6 | **3,0** |

Więcej przykładów: `references/przyklady.md`.
