# SEO publicznej aplikacji (np. Angular z SSR)

Dotyczy stron, które mają być znajdowane przez wyszukiwarki i asystentów AI. Panel za logowaniem pomijasz.

## Renderowanie
- Treść publiczna renderowana na serwerze lub statycznie (Angular SSR / prerendering z hydracją). Czysty rendering
  po stronie klienta tylko za logowaniem.
- Sprawdź, co dostaje robot: HTML **przed** uruchomieniem JS musi zawierać tytuł, opis, nagłówki i główną treść.

## Core Web Vitals (75. percentyl rzeczywistych użytkowników)
| Metryka | Dobrze | Słabo |
|---|---|---|
| LCP | ≤ 2,5 s | > 4 s |
| INP | ≤ 200 ms | > 500 ms |
| CLS | ≤ 0,1 | > 0,25 |
LCP rozkłada się na TTFB, opóźnienie i czas ładowania zasobu oraz renderowanie — zaczynasz od największego składnika.
Szczegóły pomiaru i poprawy: `core-web-vitals.md`.

## Indeksowanie
- `robots.txt` i mapa witryny aktualne; ważne strony najwyżej ~3 kliknięcia od strony głównej.
- Kanoniczny URL na każdej stronie (zwykle wskazujący na siebie), niesprzeczny z `noindex`.
- Paginacja przez zwykłe linki `<a href>`; przekierowania bez łańcuchów (jeden skok).
- Krótkie, czytelne adresy URL; jedna wersja (z ukośnikiem albo bez, jeden host).

## Metadane
- `<title>` unikalny, ok. 30–60 znaków; opis ok. 120–160 znaków, nie powtarza tytułu.
- Open Graph i karty społecznościowe dla stron udostępnianych.
- W Angularze: tytuł przez właściwość `title` trasy (i własny `TitleStrategy`), opis i Open Graph przez usługę `Meta`
  (resolver lub efekt na trasie) — renderowane w SSR.

## Dane strukturalne
- JSON-LD (`<script type="application/ld+json">`) zgodny z treścią strony (Organization, Product, Article,
  BreadcrumbList…). Nie znakuj treści, której użytkownik nie widzi.

## Roboty AI
Rozróżniaj roboty zbierające dane do trenowania modeli od robotów wyszukiwania i cytowania w asystentach — decyzję,
którym pozwolić, podejmuje biznes i zapisuje w `robots.txt` (zmiana świadoma, z ADR).

## Zasada weryfikacji
Każda rekomendacja ma sposób sprawdzenia, czy zadziałała (np. raport indeksowania, pomiar CWV z RUM po wdrożeniu).

## Źródło inspiracji
[claude-seo](https://github.com/AgriciDaniel/claude-seo) — progi CWV, zasady indeksowania, metadanych, renderowania
i danych strukturalnych, rozróżnienie robotów AI, „jak poznamy, że nie zadziałało” (opisane własnymi słowami; bez
jego crawlera, płatnych API i agentów audytowych).
