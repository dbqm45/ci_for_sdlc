# Treści techniczne poza dokumentacją: lejek, SEO i dystrybucja

Dla artykułów na blogu, poradników i porównań, które mają przyciągnąć i przekonać odbiorcę technicznego. Zasada
nadrzędna: **rzetelność techniczna przed sprzedażą** — programiści szybko odrzucają treści, które obiecują więcej,
niż produkt robi.

## Odbiorca i cel
- **Profil idealnego klienta** (jaka organizacja), **persona kupującego** (kto decyduje) i **persona czytelnika**
  (kto czyta i wdraża — często inna osoba) — z badań i danych sprzedaży (proc-product-discovery).
- Każdy tekst ma jeden cel i intencję czytelnika: poznać problem, porównać rozwiązania, wdrożyć konkretne.

## Lejek treści
| Etap | Czytelnik | Formy | Miara |
|---|---|---|---|
| **góra** (świadomość) | zna problem, nie zna rozwiązań | artykuły wyjaśniające, trendy, przewodniki koncepcyjne | ruch z wyszukiwarki, czas czytania |
| **środek** (rozważanie) | porównuje podejścia | porównania, architektury referencyjne, e-booki, białe księgi | zapisy na newsletter, pobrania, przejście do dokumentacji |
| **dół** (decyzja) | wybiera i wdraża | studia przypadków, przewodniki migracji, szybki start, cennik i bezpieczeństwo produktu | rejestracje, uruchomione wersje próbne |
- **Porównania** uczciwe: kryteria jawne, dane z datą i źródłem, słabe strony własnego produktu też; nieaktualne
  porównanie z konkurencją to ryzyko prawne i wizerunkowe (core-source-research).
- Treści za formularzem (e-booki, raporty) tylko gdy wartość uzasadnia oddanie danych; zgoda zgodna z RODO.
- **Wezwanie do działania** na końcu: jeden następny krok dopasowany do etapu (dokumentacja, wersja próbna), nie pięć.
- Subtelna sprzedaż: pokazuj wynik i oszczędzony czas na prawdziwym przykładzie, bez superlatywów i języka reklamy
  (txt-polish-style, `slady-pisania-ai.md`).

## SEO treści technicznych
- **Intencja i słowa kluczowe**: jak ludzie nazywają problem (wyszukiwarka, społeczności, zgłoszenia do wsparcia).
  Frazy krótkie (np. „kubernetes”) mają duży wolumen i ogromną konkurencję; frazy długie i konkretne („jak ustawić
  limit pamięci poda w kubernetes”) — mniejszy wolumen, jasna intencja, realna szansa. Trendy wyszukiwania pokazują
  tematy rosnące.
- **Tytuł**: konkretny, ze słowami czytelnika, obietnica zgodna z treścią; nagłówki opisują sekcje, nie są ozdobą.
- **Struktura klastrów**: strona filarowa (szeroki temat) linkuje do artykułów szczegółowych i odwrotnie.
- **Technika**: kanoniczny URL przy treści publikowanej w kilku miejscach (np. blog firmowy i Dev.to — `canonical`
  wskazuje oryginał), metadane Open Graph dla podglądów w komunikatorach, szybkie strony, dane strukturalne
  (fe-web-platform, `seo-publiczne-strony.md`).
- **Linki przychodzące** zdobywa się wartością: narzędzia open source, raporty z danymi, odpowiedzi w społecznościach.
  Bez kupowania linków i farm treści.
- Ocena pokrycia tematu przez narzędzia SEO to wskazówka — tekst pisany pod metrykę zamiast czytelnika traci jedno
  i drugie.

## Dystrybucja
- Kanały, w których jest odbiorca: newsletter, społeczności (Reddit, Hacker News, Dev.to, fora produktu), GitHub
  (README, przykłady), LinkedIn, konferencje. Każdy kanał ma swoje zasady — autopromocja bez wartości jest usuwana.
- Wzmacnianie: zespół i eksperci udostępniają, partnerzy cytują, krótsze wersje na różne kanały; odświeżanie
  i ponowna publikacja najlepszych tekstów.
- Śledzenie: parametry UTM w linkach per kanał (bez danych osobowych w URL), konwersje zdefiniowane z góry
  (rejestracja, start wersji próbnej) — analityka zgodna z RODO.
- Oryginalność: teksty piszesz sam; cytaty krótkie, z atrybucją; sprawdzanie podobieństwa przed publikacją, gdy
  treść powstawała z wielu źródeł.

## Źródła
- [roadmap.sh — Technical Writer](https://roadmap.sh/technical-writer) (technical content marketing, buyer journey,
  ICP, funnel content, SEO keywords, pillar content, canonical, OpenGraph, backlinking, distribution, conversion
  tracking, subtle selling, call to actions, crafting titles)
Opisane własnymi słowami.
