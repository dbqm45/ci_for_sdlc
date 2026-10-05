# Scenariusze sesji Event Storming

## Logistyka (sesja stacjonarna)
- **Nieograniczona przestrzeń modelowania**: rolka papieru 8–10 m na ścianie; bez stołu na środku, krzesła pod ścianą (ludzie stoją = więcej energii).
- Dużo karteczek w kolorach notacji, grube markery (jeden pomysł na kartkę, czytelne z 2 m).
- Legenda na ścianie — dopisywana, gdy wprowadzasz nowy element.
- Zaproszenie: cel sesji w jednym zdaniu, czas, „nie trzeba się przygotowywać”. Zaproś osoby z pytaniami i osoby z odpowiedziami; bez decydentów, którzy onieśmielają resztę, albo uprzedź ich o roli.
- Facylitator jest pierwszy w sali i wychodzi ostatni (fotografuje ścianę po każdym etapie).

## Big Picture (ok. 4–6 h z przerwami)
| Czas | Krok | Co mówisz / robisz |
|---|---|---|
| 10' | Check-in, cel, zasady | „Dziś chcemy zrozumieć X. Każdy ma rację częściowo, nikt całkowicie.” Pokaż tylko pomarańczową kartkę i hot spot. |
| 30' | Chaotyczna eksploracja | „Napiszcie wszystko, co się dzieje w biznesie, w czasie przeszłym. Nie dyskutujemy — piszemy.” |
| 45' | Porządkowanie osi | „Czy te dwie kartki to to samo? Co było wcześniej?” Duplikaty zdejmij, synonimy zapisz na boku. |
| 20' | Zdarzenia przełomowe | „Po którym zdarzeniu świat wygląda inaczej?” Zaznacz je wyraźnie, podziel oś na rozdziały. |
| 20' | Swimlanes, aktorzy, systemy | Dopiero teraz wprowadź żółte i szerokie różowe kartki. |
| 30' | Walkthrough + reverse narrative | Jedna osoba opowiada; reszta zgłasza „stop”. Potem kilka fragmentów od końca. |
| 20' | Problemy i szanse | Hot spoty + zielone kartki; głosowanie 3 kropkami na osobę. |
| 20' | Wyłaniające się konteksty | Obrysuj obszary o wspólnym języku/odpowiedzialności. |
| 10' | Check-out | „Co dziś zrozumiałeś, czego nie wiedziałeś rano?” |

## Process Level (2–3 h, jeden proces)
1. Postaw Begin i End (jeśli proces jest znany) albo zdarzenia przełomowe (jeśli odkrywamy).
2. Rozpisz zdarzenia między nimi.
3. Wprowadź gramatykę: dla każdego zdarzenia „co je spowodowało?” → komenda + aktor; „co aktor musiał wiedzieć?” → read model; „co się dzieje potem automatycznie?” → polityka.
4. Sprawdź domknięcie łańcucha dla każdej ścieżki, łącznie z ścieżkami błędów i odrzuceń.
5. Zbierz reguły (żółte ograniczenia) i pytania rozgałęziające.
6. Warstwa to-be: inny tor/kolor, zaznacz różnice i szanse.

## Design Level (2–3 h, jeden kontekst)
1. Weź fragment procesu z Process Level.
2. Przy każdej komendzie zapytaj: „jaka reguła może to odrzucić?” → ograniczenie; „jakie dane są potrzebne, by to sprawdzić?”
3. Grupuj ograniczenia, które muszą być spójne natychmiast → kandydat na agregat. Nazwij go językiem biznesu (nie „Manager”, nie „Data”).
4. Zapytaj o współbieżność: „czy dwie osoby mogą to robić jednocześnie? co wtedy?” (ddd-tactical-design).
5. Dopisz zdarzenia odrzucenia i kompensacji.
6. Zanotuj read modele i ich źródła.

## Wersja zdalna
- Tablica (Miro/Mural/FigJam) z przygotowanymi kolumnami i legendą; każdy ma własny „brudnopis” na chaotyczną eksplorację.
- Krótsze bloki (max 90'), częstsze przerwy, kamery włączone, czat na hot spoty.
- Facylitator + pomocnik („producer”) do porządkowania tablicy.

## Wersja asynchroniczna z agentem
1. Agent zadaje pytanie o cel i zakres, proponuje format.
2. Użytkownik podaje zdarzenia partiami; agent porządkuje i odsyła oś z pytaniami.
3. Agent proponuje zdarzenia przełomowe i swimlanes jako **[propozycje]**.
4. Po każdym kroku zapis tablicy do pliku; hot spoty jako lista zadań z właścicielem pytania.
