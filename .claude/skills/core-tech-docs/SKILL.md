---
name: core-tech-docs
description: Użyj przy dokumentacji technicznej w repo — README, API, ADR, CHANGELOG, runbook, podręcznik; struktura, styl, recenzja.
metadata:
  katalog: "Użyj przy pisaniu, poprawianiu lub ocenie dokumentacji technicznej w repo — README, dokumentacja API, ADR, CHANGELOG, runbook, podręcznik, opis modułu/funkcjonalności; odbiorca, struktura, styl, proces i recenzja. Nie do artefaktów dziennika docs/project/ (core-project-record), commit message (core-conventional-commits) ani komentarzy w kodzie."
  slowa: "kiedy pisać ADR, dokumentować decyzję, dokumentacja, README, runbook, instrukcja, opis modułu"
---

# Dokumentacja techniczna

## Zanim zaczniesz — dwa pytania
1. **Dla kogo?** Użytkownik UI ≠ programista rozwijający system (inna treść, styl, słownictwo). Bez innych wskazówek
   pisz dla programisty wdrażającego/integrującego. Kilka grup o różnych potrzebach → osobne dokumenty albo wyraźnie
   oznaczone sekcje.
2. **Opisowo czy zadaniowo?** Opisowo (kolejność elementów systemu) → referencja, API. Zadaniowo (kolejność pracy
   odbiorcy) → podręczniki, tutoriale.

## Zasady ogólne
- Czytelnik jest zajęty: najważniejsze na początku, potem szczegóły. Wiele małych rozdziałów > kilka dużych.
- **Najpierw struktura** (rozdziały → podrozdziały), potem wypełnianie węzłów — nie pisz liniowo.
- **KISS:** krótkie zdania i akapity; kroki jako lista numerowana, porównania jako tabela, nie wyliczenia po przecinku.
- **Spójność terminów ważniejsza niż elegancja** — raz „system”, zawsze „system”; to samo dla formatowania.
  Przy konflikcie reguły stylu z jednoznacznością wybierz jednoznaczność.
- Każda komenda/metoda/endpoint z **przykładem kodu**, który da się skopiować i uruchomić (bloki z językiem, ```bash).
  Przykłady od najprostszego do trudnego.
- Dane w przykładach i zrzutach: realistyczne, ale **zmyślone**; nigdy dane prawdziwych osób ani prawdziwe sekrety.
- Jeden stały znacznik miejsc do uzupełnienia (`TBD`) — da się je znaleźć jednym wyszukiwaniem.
- Dokumentacja żyje obok kodu i zmienia się w tym samym commicie co kod (`docs:` — core-conventional-commits).
  Dokumentację referencyjną generuj ze źródeł, gdy się da (OpenAPI, TypeDoc/JSDoc).

## Który dokument
| Potrzeba | Dokument | Uwagi |
|---|---|---|
| Wejście do repo/pakietu | README | szkielet niżej |
| Decyzja architektoniczna | ADR | w `docs/project/` szablon z core-project-record |
| Zmiany dla użytkowników wersji | CHANGELOG | Keep a Changelog lub generowany (`nx release`) |
| Reakcja na alert | runbook | Objaw → potwierdzenie → naprawa → rollback → eskalacja |
| Kontrakt HTTP | dokumentacja API / OpenAPI | aktualizuj spec, nie osobny dokument |
| Praca użytkownika z systemem | podręcznik | zadaniowo; spis treści, słowniczek, indeks |
| Pierwszy sukces, nauka | tutorial / szybki start | Diátaxis: `references/rodzaje-dokumentacji.md` |
| Konkretny cel praktyka | instrukcja (how-to) | jw. |
| Zmiany dla użytkowników (nie dla programistów) | notatki o wydaniu | co nowego, co zrobić, zmiany łamiące; jw. |
| Błąd, objaw | rozwiązywanie problemów / lista błędów | według objawu; jw. |
| Artykuł, porównanie, studium przypadku | treść techniczna poza dokumentacją | `references/tresci-techniczne-i-seo.md` |
| Artefakty faz projektu (brief, wymagania, plan…) | — | **core-project-record**, nie tu |

## README — szkielet
1. Jedno zdanie: czym to jest i dla kogo.
2. Szybki start (≤ 5 komend do działającego stanu).
3. Konfiguracja (tabela: zmienna | domyślnie | opis) — tylko placeholdery sekretów.
4. Typowe zadania (test, build, deploy).
5. Struktura katalogów (tylko kluczowe).
6. Gdzie szukać pomocy / jak kontrybuować.

## ADR — `docs/project/04-architecture/adr/NNNN-krotki-tytul.md`
**Próg — wszystkie trzy naraz:** (1) trudno odwrócić, (2) bez kontekstu zaskoczy przyszłego czytelnika („czemu tak?”),
(3) był prawdziwy wybór między alternatywami. Brak któregokolwiek → bez ADR (wystarczy wiersz w `decisions.md` albo nic).
Kwalifikują się: kształt architektury, sposób integracji kontekstów, technologia z uzależnieniem (baza, kolejka,
dostawca tożsamości — nie każda biblioteka), decyzje o granicach i własności danych (także jawne „nie”), świadome
odstępstwa od oczywistej drogi, ograniczenia niewidoczne w kodzie (prawo, umowy, wymagania wydajności), odrzucona
alternatywa, jeśli powód nie jest oczywisty. ADR może mieć jeden akapit — liczy się *że* i *dlaczego*. ADR **proponujesz**,
nie zakładasz; odrzucenie kandydata z trwałym powodem też warto zapisać, żeby nie wracał.
W projektach z dziennikiem (`docs/project/`) użyj szablonu `core-project-record/templates/adr.md` (z nagłówkiem YAML)
i dopisz wiersz do `decisions.md`. Poza dziennikiem wystarczy:
```markdown
# NNNN. Tytuł decyzji
Status: Proponowana | Przyjęta | Zastąpiona przez NNNN
Data: RRRR-MM-DD
## Kontekst
Jaki problem, jakie ograniczenia.
## Decyzja
Co wybieramy (1–3 zdania).
## Rozważane opcje
- Opcja A — zalety / wady
- Opcja B — zalety / wady
## Konsekwencje
Co zyskujemy, co tracimy, co trzeba zrobić dalej.
```

## CHANGELOG, runbook, API
- **CHANGELOG** (Keep a Changelog): sekcje w `## [Unreleased]`: Added, Changed, Deprecated, Removed, Fixed, Security.
  Wpis = jedna linia z perspektywy użytkownika. Przy `nx release` changelog powstaje z commitów — pilnuj ich formatu.
- **Runbook:** dla każdego alertu **Objaw → Jak potwierdzić (komendy) → Naprawa krok po kroku → Rollback → Eskalacja**.
- **API:** dla każdego endpointu metoda + ścieżka, auth, parametry (tabela), przykład żądania i odpowiedzi, kody błędów.

## Weryfikacja i korekta
- **Wykonaj** procedury z dokumentu i sprawdź wynik — testuj opis jak kod.
- Merytoryka i korekta językowa to **dwa osobne przebiegi** (najpierw merytoryka).
- Recenzja przez kogoś bez głębokiej wiedzy o systemie wyłapuje „oczywistości” autora. Przy ponownej recenzji zaznacz zmiany.
- **Tekst po polsku przed oddaniem** → kontrola języka: txt-polish-correctness (poprawność), txt-polish-style (redakcja)
  lub persona Stefan (edytor).

## Indeks references
- Czytaj `references/styl-i-struktura.md`, gdy planujesz strukturę większego dokumentu (co na początku/końcu, słowniczek,
  nawigacja, formatowanie, cechy dobrej dokumentacji).
- Czytaj `references/proces.md`, gdy prowadzisz pisanie jako proces: zbieranie informacji, konsultacje z developerami,
  plan i kamienie milowe, metody recenzji, korekta, przejmowanie cudzej dokumentacji, post-mortem.
- Czytaj `references/rodzaje-dokumentacji.md`, gdy wybierasz rodzaj strony (Diátaxis), piszesz dla programistów
  (szybki start, referencja, lista błędów), rozwiązywanie problemów, FAQ albo notatki o wydaniu.
- Czytaj `references/utrzymanie-i-pomiar.md`, gdy utrzymujesz serwis dokumentacji: przeglądy, linki i przykłady w CI,
  luki ze zgłoszeń, przewodnik stylu i Vale, metryki.
- Czytaj `references/tresci-techniczne-i-seo.md`, gdy piszesz artykuł, porównanie lub studium przypadku dla odbiorcy
  technicznego: lejek, SEO, dystrybucja.
- Czytaj `references/diagramy-i-prezentacje.md`, gdy dokument potrzebuje diagramu (Mermaid, C4, UML), strony HTML
  z wyjaśnieniem albo prezentacji: wybór formy, notacja, czytelny układ, pułapki Mermaid, dostępność, slajdy.

## Checklista
- [ ] Znam odbiorcę i wybrałem podejście (opisowe/zadaniowe).
- [ ] Najważniejsze na początku; kroki jako listy, porównania jako tabele.
- [ ] Terminy i formatowanie spójne w całym dokumencie.
- [ ] Przykłady kodu działają (sprawdzone), dane zmyślone, bez sekretów.
- [ ] Brak `TBD` (albo świadomie zostawione i zgłoszone).
- [ ] Osobny przebieg korekty językowej (tekst po polsku → txt-polish-*).
- [ ] Dokumentacja zmieniona w tym samym commicie co kod.

Źródła (opisane własnymi słowami): poradnik Transparent Data o dokumentacji technicznej aplikacji; „What is Technical
Documentation and Why it Matters”; testerzy.pl „Jak poprawnie tworzyć dokumentację”; Keep a Changelog.
