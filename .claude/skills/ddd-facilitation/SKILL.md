---
name: ddd-facilitation
description: Użyj przy rozmowie lub warsztacie z ekspertami domeny — techniki facylitacji, język wszechobecny, słowa-sygnały.
metadata:
  katalog: "Użyj przy prowadzeniu rozmowy lub warsztatu z ekspertami domenowymi — techniki facylitacji, budowanie wszędobylskiego języka (ubiquitous language), wyłapywanie słów-sygnałów (status, CRUD), dynamika grupy. Także bramki decyzyjne agenta i samokontrola facylitatora. Nie do przebiegu i notacji Event Stormingu (ddd-event-storming) ani projektowania modelu (ddd-deep-modeling)."
---

# Facylitacja i wspólny język

## Rola facylitatora
- Jesteś właścicielem **procesu**, nie treści. Nie rozstrzygasz sporów merytorycznych — zapisujesz je jako hot spot.
- Pilnujesz celu sesji i czasu; decydujesz o przejściu do następnego kroku, gdy grupa się zapętla.
- Najpierw piszemy, potem mówimy — dzięki temu słychać także cichych ekspertów, a nie tylko najgłośniejszych.
- Ustal na starcie zasady (w duchu Deep Democracy): każdy ma kawałek racji, nikt całej; różnica zdań to informacja, nie problem.
- Otwieraj **check-inem** (krótko, po ludzku) i zamykaj **check-outem** („co wynosisz z sesji?”).

## Tryby myślenia — nie mieszaj ich
1. **Dywergencja** — generujemy (chaotyczna eksploracja): bez oceniania.
2. **Emergencja** — grupujemy, szukamy wzorców, nazywamy (porządkowanie osi, swimlanes).
3. **Konwergencja** — decydujemy (głosowanie, wybór granic).
Zapowiadaj głośno, w którym trybie jesteście. Ocena w fazie dywergencji zabija pomysły; generowanie w fazie decyzji zabija czas.

## Techniki na trudne momenty
- **Sześć kapeluszy** — gdy dyskusja krąży: wszyscy naraz patrzą z jednej perspektywy (fakty → ryzyka → korzyści → pomysły → emocje → proces), zamiast przerzucać się racjami.
- **Clean Questions** — pytania, które nie podsuwają odpowiedzi i używają słów rozmówcy:
  „A jaki to rodzaj X?”, „Co jeszcze o X?”, „Skąd się bierze X?”, „Co dzieje się tuż przed X?”, „A co potem?”,
  „Co chciałbyś, żeby się wydarzyło?”. Idealne do wydobywania pojęć bez narzucania własnego słownika.
- **Parking** — wątek ważny, ale nie teraz → kartka na parkingu z właścicielem.
- **Dominujący uczestnik** — daj mu zadanie (np. opowiadanie walkthrough na końcu), zbieraj głosy rundą.
- **Eksperci się nie zgadzają** — nie rozstrzygaj. Zapisz obie wersje jako hot spot; często to dwa różne konteksty z tym samym słowem.

## Stopniowe wprowadzanie notacji
Pokazujesz tylko to, czego grupa potrzebuje w danym kroku: najpierw zdarzenia i hot spoty, potem aktorzy i systemy,
na końcu komendy, polityki i read modele. Nowy element = krótki przykład na ścianie + dopisek w legendzie.

## Uzupełniające techniki — kiedy po nie sięgnąć
| Technika | Kiedy | Jak łączyć z Event Stormingiem |
|---|---|---|
| Customer Journey | gdy liczy się doświadczenie klienta | etapy podróży jako tory nad osią zdarzeń |
| User Story Mapping | gdy trzeba pociąć zakres na wydania | kroki z osi = kręgosłup mapy, historie pod spodem |
| Impact Mapping | gdy nie jest jasne, po co coś budujemy | cel → aktorzy → wpływ → produkty; weryfikuje sens procesów z osi |
| Service Blueprint | gdy ważne jest „zaplecze” usługi | frontstage/backstage jako tory, systemy wsparcia pod spodem |
| C4 | gdy przechodzisz do architektury | konteksty z sesji → kontenery/komponenty |

## Wszędobylski język (ubiquitous language)
Jeśli ekspert nie rozumie modelu, projekt od początku idzie w złą stronę. Język jest wspólny dla biznesu, analizy i kodu.
- Prowadź słownik `docs/project/02-domain/glossary.md`: pojęcie, znaczenie **w danym kontekście**, przykłady, synonimy, konflikty.
- To samo słowo, różne znaczenia (np. „Klient” w CRM i w Rozliczeniach) → prawdopodobna **granica kontekstu**. Nie ujednolicaj na siłę.
- Różne słowa, to samo znaczenie → uzgodnij jedno w obrębie kontekstu.
- Pytaj: „Jak to nazywacie u siebie?”, „Czy X i Y to to samo?”, „Kto używa tego słowa?”.

### Słownik w trakcie projektowania (nie tylko na warsztacie)
- **Wpis**: pogrubione pojęcie, 1–2 zdania o tym, czym coś **jest** (nie co robi), linia `_Unikaj_: …` z odrzuconymi
  synonimami. Bądź stanowczy: z kilku słów wybierz jedno. Wpisy grupuj nagłówkami, gdy pojawiają się naturalne grupy.
- **Tylko pojęcia tego kontekstu** — bez ogólnych pojęć programistycznych (timeout, typ błędu) i bez szczegółów
  implementacji. Słownik to nie specyfikacja ani brudnopis. Kilka kontekstów → osobny słownik na kontekst + mapa
  relacji (ddd-context-mapping).
- **Zapis od razu**, gdy pojęcie się ustali — nie zbiorczo na końcu sesji. Słownik równie często się kurczy, jak rośnie;
  okresowo usuwaj z niego szczegóły implementacji.
- Słowo sprzeczne ze słownikiem → nazwij konflikt od razu („słownik mówi, że Anulowanie to X, a ty mówisz o Y — które?”).
  Słowo mgliste → zaproponuj precyzyjne („konto — Klient czy Użytkownik?”).
- Relacje sprawdzaj **wymyślonymi scenariuszami brzegowymi**, aż granice pojęć będą ostre.
- **Konfrontuj z kodem**: gdy ktoś mówi, jak coś działa, sprawdź w kodzie i zacytuj rozbieżność („kod anuluje całe
  Zamówienie, a mówisz o częściowym anulowaniu — co jest prawdą?”). Rozbieżność kodu i języka blokuje dalsze decyzje.
- **Słownik pisany przez agenta to propozycja**, nie autorytet: wpisy bez przeglądu człowieka brzmią pewnie, a mogą być
  fałszywe. Nowe i zmienione wpisy pokazujesz w podsumowaniu sesji do akceptacji (core-project-record: statusy).
- **Bez plików na zapas** — słownik i ADR powstają, gdy jest pierwsze pojęcie lub pierwsza decyzja do zapisania.
- **Istniejące repo bez słownika:** nie czekaj, aż słownik urośnie przy okazji (za wolno). Zrób krótkie przesłuchanie:
  agent wypisuje kandydatów na pojęcia z kodu (nazwy agregatów, tabel, endpointów) i pyta o znaczenie i synonimy, partiami.
- Agent konfrontuje język z kodem i zapisanymi artefaktami — nie widzi trackera zgłoszeń; jeśli tam są ustalenia
  językowe, wskaż je w `CLAUDE.md` projektu.
Wzorowane na skillu `domain-modeling` z [mattpocock/skills](https://github.com/mattpocock/skills) (MIT; opis: [aihero.dev](https://www.aihero.dev/skills-domain-modeling)), opisane własnymi słowami.

### Słowa-sygnały — zatrzymaj się i dopytaj
| Sygnał | Dlaczego podejrzane | Co zapytać |
|---|---|---|
| **status** („zmieniono status na…”) | pole statusu często ukrywa kilka różnych cykli życia i kilka zdarzeń biznesowych | „Co się wydarzyło w biznesie, że status się zmienił? Kto o tym decyduje? Co wolno robić w tym stanie, a czego nie?” — każda wartość statusu to potencjalne zdarzenie lub osobne pojęcie |
| **CRUD**: dodano, zaktualizowano, usunięto, zapisano, edytowano | język bazy danych, nie biznesu | „Po co ktoś to zmienia? Jak to nazywacie?” — „zaktualizowano zamówienie” to np. „Klient zmienił adres dostawy” albo „Zamówienie zostało opłacone” |
| przetworzono, zsynchronizowano, obsłużono | ukrywa decyzję lub regułę | „Co dokładnie się sprawdza? Co może pójść nie tak?” |
| dane, rekord, obiekt, informacje, manager | pojęcie bez znaczenia biznesowego | „Jaki to rodzaj informacji? Do czego służy?” |
| zawsze / nigdy / automatycznie | ukryte wyjątki | „Czy był przypadek, kiedy nie…?” |
| nazwy ekranów, tabel, systemów | rozwiązanie zamiast problemu | „Co by się działo, gdyby tego systemu nie było?” |

## Praca agenta z użytkownikiem
- Zadawaj **jedno–trzy pytania naraz**, konkretne, najlepiej z przykładem.
- Parafrazuj językiem rozmówcy i proś o korektę („Dobrze rozumiem, że…?”).
- Nigdy nie uzupełniaj luk zmyśleniem — luka to hot spot z pytaniem i adresatem.
- Po każdej rundzie zapisz: nowe pojęcia, hot spoty, decyzje.

## Bramki decyzyjne (agent ↔ człowiek)
Bramka = punkt, w którym agent zatrzymuje się na decyzję człowieka. Pętla: **zbadaj → zaproponuj z uzasadnieniem → stop**.
- Na turę **3–7 pytań**, każde oparte na dowodzie (cytat/plik), z opcjami, **wartością domyślną** i oznaczeniem „blokuje / nie blokuje”.
- Człowiek może odpowiedzieć skrótem: `q1: b`, `C2: odrocz`; słowa sterujące: `pomiń` (przyjmij domyślne), `stop`, `powtórz`.
- Po każdej odpowiedzi jedno zdanie: „OK — na podstawie X robię Y”. Decyzje zapisuj w artefakcie (core-project-record), żeby
  przerwaną pracę dało się wznowić bez ponownych pytań.
- Limit 10 tur; po 3 turach bez postępu przyjmij wartości domyślne i zapisz to jako założenie.
- **Pytaj zawsze:** sprzeczność w źródłach, decyzja wartościująca (priorytet, ryzyko, koszt), słabe dowody, zmiana kontraktu.
  **Nie pytaj:** o rzeczy mechaniczne, stylistyczne ani o to, na co odpowiedź jest już w materiałach.
- Podagent nie ma rozmowy z człowiekiem — zamiast pytać, zwraca pytania (hot spoty) personie, która prowadzi rozmowę.

## Metaprogramy — soczewka na uczestników
| Oś | Rozpoznasz po | Jak prowadzić |
|---|---|---|
| podobieństwo ↔ różnica | „jak zawsze” / „to zupełnie inne” | podobnym pokaż ciągłość, różnicującym daj szukać wyjątków (hot spoty) |
| ogół ↔ szczegół | skróty myślowe / długie opowieści z liczbami | ogólnych proś o przykład, szczegółowych — o nazwę etapu |
| „od” ↔ „do” | mówi o problemach / o celach | nastawionym na problemy zleć oznaczanie ryzyk i hot spotów |
| wewnętrzna ↔ zewnętrzna rama | „wiem, że…” / „klienci mówią…” | pewnego siebie nie przekonuj autorytetem — zaproś, by sam sprawdził tezę na przykładzie |

## Samokontrola facylitatora (po sesji lub co kilka rund)
| # | Anty-wzorzec | Sygnał |
|---|---|---|
| 1 | przedwczesne projektowanie | rozmowa o tabelach/API na Big Picture |
| 2 | jedna osoba zdominowała | ta sama osoba mówi długo, wielokrotnie |
| 3 | ktoś milczy | brak wkładu przez kilka rund — zaproś wprost |
| 4 | brak hot spotów | mniej niż jeden na dwie rundy = spory są zamiatane |
| 5 | brak zdarzeń przełomowych | oś bez struktury |
| 6 | brak chronologii | kartki bez porządku czasu |
| 7 | mieszanie poziomów | komendy/polityki na Big Picture |
| 8 | facylitator pisze za grupę | kartki powstają z jego słów |
| 9 | pominięte regulacje/compliance | nikt nie zapytał o prawo i umowy |
| 10 | niesprawdzony język | słowa-sygnały bez dopytania |
Podsumowanie: po 3 najmocniejsze momenty i 3 do poprawy, w formie „Zauważyłem… to prowadzi do… następnym razem spróbuj…”.
Zapis: `docs/project/07-review/<data>-facilitation.md`.
