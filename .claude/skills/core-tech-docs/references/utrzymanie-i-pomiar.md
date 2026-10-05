# Utrzymanie dokumentacji, styl jako kod i pomiar

## Starzenie się treści
- Każda strona ma **właściciela** i datę ostatniego przeglądu (w nagłówku pliku, np. `owner`, `last_reviewed`).
  Strony starsze niż ustalony okres (np. 6 miesięcy dla przewodników, przy każdym wydaniu dla referencji) trafiają
  do przeglądu — lista generowana skryptem w CI.
- Zmiana zachowania w kodzie = zmiana dokumentacji w tym samym PR (SKILL.md); szablon PR z polem „dokumentacja
  zaktualizowana / nie dotyczy”.
- Sprawdzanie linków (wewnętrznych i zewnętrznych) i przykładów kodu w CI; martwy link lub nieaktualny przykład to
  błąd jak każdy inny.
- Strony nieaktualne: aktualizujesz, przekierowujesz albo oznaczasz jako archiwalne z linkiem do nowej wersji —
  nie zostawiasz bez komentarza.

## Skąd brać tematy i luki
- **Zgłoszenia do wsparcia i czaty**: powtarzające się pytania (kategoria, liczba) → brakujące lub niejasne strony.
  Każde zgłoszenie rozwiązane linkiem do dokumentacji to dowód, że strona działa; rozwiązane bez linku — kandydat
  na nową treść.
- **Wyszukiwanie w dokumentacji**: zapytania bez wyników i z wynikami bez kliknięcia.
- **Społeczności** (fora, Stack Overflow, Reddit, issue w repozytorium): jak ludzie nazywają problem — tych słów
  używaj w tytułach.
- **Rozmowy z ekspertami i testowanie produktu samemu** (proces w `proces.md`); kod źródłowy jako ostateczne źródło
  prawdy o zachowaniu.

## Przewodnik stylu i lintowanie
- Krótki przewodnik stylu zespołu w repo (`docs/STYLE.md`): ton, forma zwracania się, terminy preferowane i zakazane
  (słownik domeny — ddd-facilitation), formatowanie (nagłówki, listy, bloki kodu), zapis liczb, dat i jednostek.
  Bazuj na istniejących (Google Developer Documentation Style Guide, Microsoft Writing Style Guide) — w sprawach,
  które nie są specyficzne dla języka polskiego.
- **Vale** — linter stylu w CI: `.vale.ini` z `StylesPath`, `MinAlertLevel`, gotowymi pakietami (`Packages = Google`,
  pobierane przez `vale sync`) i własnym słownictwem projektu (lista terminów akceptowanych i odrzucanych). Pakiety
  gotowe są dla angielskiego; dla tekstów polskich własne reguły (terminy, zakazane słowa) i
  `txt-polish-correctness/scripts/polish_lint.py`.
- Poziom `error` blokuje PR tylko dla reguł pewnych (zakazany termin, zła nazwa produktu); reszta jako sugestie,
  żeby linter nie zniechęcał.

## Pomiar
- Metryki zadaniowe ważniejsze niż odsłony: czy czytelnik osiągnął cel (przejście do kolejnego kroku, uruchomiony
  szybki start, spadek zgłoszeń na dany temat), ocena strony („czy to było pomocne?” z polem komentarza).
- Analityka dokumentacji zgodna z RODO (zgoda, bez danych osobowych w zdarzeniach — proc-product-discovery).
- Przegląd kwartalny: najczęściej odwiedzane strony z niską oceną → poprawki; strony bez ruchu → połącz lub usuń.

## Źródła
- [Vale — dokumentacja](https://docs.vale.sh/); Google Developer Documentation Style Guide
- [roadmap.sh — Technical Writer](https://roadmap.sh/technical-writer) (content aging, support request evaluation,
  communities, writing style guides, editing tools, content analysis, platform tracking and metrics)
Opisane własnymi słowami.
