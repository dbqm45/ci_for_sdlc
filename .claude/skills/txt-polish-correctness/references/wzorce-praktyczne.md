# Wzorce praktyczne — najczęstsze błędy w tekstach użytkowych
<!-- polish-lint: ignore-file (plik zawiera celowe przykłady błędów) -->

Szybki katalog do analizy i autokontroli. Przy sprzeczności rozstrzygają `pisownia.md` i `interpunkcja.md`
(zbiór RJP PAN 2024, obowiązujący od 1.01.2026). Przykłady dobrane do dokumentacji, opisów i interfejsów.

## Pisownia — pułapki łączne/rozdzielne
| Błędnie | Poprawnie | Uwaga |
|---|---|---|
| napewno, wogóle, narazie, conajmniej, poprostu, odrazu, przedewszystkim, wkońcu | na pewno, w ogóle, na razie, co najmniej, po prostu, od razu, przede wszystkim, w końcu | wyrażenia przyimkowe piszemy rozdzielnie |
| z pośród, z pod, z nad | spośród, spod, znad | przyimki złożone łącznie |
| nie + imiesłów przymiotnikowy rozdzielnie („nie działający”) | niedziałający, niezapisany | łącznie (bez względu na znaczenie; rozdzielnie tylko przy przeciwstawieniu: „nie zapisany, lecz odrzucony”) |
| niechcę, niema | nie chcę, nie ma | `nie` z czasownikiem rozdzielnie |
| dlatego, że / dlatego że | oba poprawne | przecinek przed całym spójnikiem albo w środku — konsekwentnie |

## Interpunkcja
- Przecinek przed: `że`, `który/-a/-e`, `aby`, `żeby`, `ponieważ`, `gdyż`, `jeśli`, `gdy`, `chociaż`, `ale`, `lecz`, `więc`.
  Przy spójnikach złożonych (`mimo że`, `chyba że`, `zwłaszcza że`, `tak że`) przecinek stawiamy przed całością.
- Wtrącenie wydzielone z **obu** stron (przecinkami albo myślnikami).
- Bez przecinka przed pojedynczym `i`, `oraz`, `lub`, `albo`, `ani` w obrębie jednego zdania.
- Imiesłów na `-ąc`, `-wszy` z określeniami wydzielamy przecinkami.

## Znaki typograficzne
| Znak | Użycie | Spacje |
|---|---|---|
| łącznik `-` | wyrazy złożone: biało-czerwony, e-mail, 2-krotnie | bez spacji |
| półpauza `–` | zakresy: 2020–2026, s. 23–45, 10–15 zł | bez spacji |
| myślnik `–` lub `—` | wtrącenie, pauza w zdaniu | spacja z obu stron; w jednym dokumencie jedna forma |
| cudzysłów `„…”` | cytaty, nazwy przycisków w tekście, ironia | zagnieżdżony: `„… »…« …”` |
| wielokropek `…` | jeden znak (U+2026) | bez spacji przed |
Brak spacji przed `, . : ; ! ?` i po nawiasie otwierającym. Spacja przed jednostką: `10 GB`, `5 min`; procent `20%` albo `20 %`
— dopuszczalne oba, ważna konsekwencja w dokumencie. Tysiące: `10 000` (spacja twarda), ułamki przecinkiem: `2,5`.

## Gramatyka
- **Liczebnik + rzeczownik:** 1 plik · 2–4 pliki · 5–21 plików · 22–24 pliki · 25+ plików (decyduje ostatnia cyfra poza 12–14).
- **Imiesłów przysłówkowy** wymaga tego samego podmiotu co zdanie główne:
  ❌ „Uruchamiając skrypt, pojawił się błąd.” → ✅ „Po uruchomieniu skryptu pojawił się błąd.” / „Uruchamiając skrypt, zobaczyłem błąd.”
- **Biernik żeński zaimka:** „tę decyzję”, „tę funkcję” (nie „tą”); „tą” to narzędnik: „z tą funkcją”.
- **Rekcja:** korzystać **z** czegoś · szukać **czegoś** · dotyczyć **czegoś** (nie „o coś”) · wpływać **na** coś.
- **Zaprzeczenie → dopełniacz:** „nie ma konfiguracji”, „nie widzę błędu” (nie „nie widzę błąd”).
- **ilość / liczba:** ilość dla niepoliczalnych (ilość pamięci), liczba dla policzalnych (liczba użytkowników, plików, błędów).

## Semantyka i frazeologia
| Błąd | Poprawnie | Rodzaj |
|---|---|---|
| pełnić rolę | odgrywać rolę / pełnić funkcję | kontaminacja |
| cofnąć się do tyłu, wracać z powrotem, kontynuować dalej, okres czasu, potencjalna możliwość, fakt autentyczny, akwen wodny | cofnąć się, wracać, kontynuować, okres, możliwość, fakt, akwen | pleonazm |
| na dzień dzisiejszy, w dniu dzisiejszym | dziś, obecnie | styl urzędowy |
| w każdym bądź razie | w każdym razie / bądź co bądź | kontaminacja |
| efektywny ↔ efektowny | skuteczny ↔ robiący wrażenie | paronimy |
| adresować problem | zająć się problemem, rozwiązać problem | kalka (address) |
| zrobić sens, zrobić różnicę | mieć sens, mieć znaczenie | kalka |
| dedykowany (moduł) | przeznaczony, osobny | kalka (dedicated) — potoczne w IT, w dokumentacji unikać |
| na końcu dnia | ostatecznie | kalka |
| wspierać (format, przeglądarkę) | obsługiwać | kalka (support) |
| aplikować (na stanowisko) | ubiegać się, zgłosić się | kalka |

## Spójność
- Jeden termin na jedno pojęcie w całym dokumencie (zgodnie ze słownikiem projektu — `docs/project/02-domain/glossary.md`).
- Skrót rozwinięty przy pierwszym użyciu: „Architecture Decision Record (ADR)”.
- Jedna forma zwracania się: bezosobowo („Uruchom…” / „Należy…” — wybierz jedno) albo „ty”; nie mieszaj z „Państwo”.
- Nazwy obce (produkty, przyciski): jedna pisownia w całym tekście, nazwy przycisków w cudzysłowie lub pogrubieniu — konsekwentnie.

## Czytelność (orientacyjne progi dla prozy użytkowej)
| Miara | Cel | Sygnał alarmowy |
|---|---|---|
| średnia długość zdania | 12–20 słów w dokumentacji, do 24 w artykule | > 30 słów → podziel |
| akapit | 2–5 zdań | > 8 zdań → podziel |
| śródtytuł | co 200–400 słów | 600+ słów bez śródtytułu |
| wyróżnienia | ≤ 10–15% tekstu | pogrubienie w każdym akapicie |
