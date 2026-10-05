---
name: be-messaging-outbox
description: Użyj przy komunikacji asynchronicznej modułów — komenda czy zdarzenie, outbox/inbox, kolejność, idempotencja odbiorcy, kontrakty.
metadata:
  katalog: "Użyj przy zamianie synchronicznego wywołania między modułami na asynchroniczną wiadomość i przy projektowaniu outbox/inbox — czy wolno rozproszyć, komenda czy zdarzenie, atomowość, relay, kolejność, idempotencja odbiorcy, testy producenta, kontraktu i konsumenta. Nie do wyboru relacji kontekstów (ddd-context-mapping) ani schematu bazy ogólnie (be-database)."
---

# Asynchroniczna komunikacja: outbox, inbox, gwarancje

## 1. Czy to wywołanie w ogóle można rozproszyć?
Dwa kryteria wykluczające — sprawdź je PRZED projektem:
- **Wywołujący korzysta z wyniku** (rozgałęzia się na nim, zwraca go, używa w tej samej jednostce pracy) → konwersja zmienia
  poprawność. **Stop** — zostaje synchronicznie albo trzeba przeprojektować przepływ.
- **Ktoś czyta efekt zaraz po wywołaniu** (read-after-write, np. ekran po zapisie) → decyzja biznesowa: zaakceptować opóźnienie,
  zostawić synchronicznie albo dać czytelnikowi własną projekcję.
Asynchroniczność usuwa sprzężenie **czasowe**, nie **logiczne** — moduły nadal zależą od znaczenia wiadomości.

## 2. Komenda czy zdarzenie?
- **Zdarzenie** — fakt w czasie przeszłym, 0..N odbiorców, reakcja to polityka odbiorcy; pasuje do granicy kontekstu.
- **Komenda** — tryb rozkazujący, jeden adresat; zachowuje dotychczasowe sprzężenie, bliższa temu, co było.
Dla przerabianego wywołania pokaż obie opcje z kosztami; zdarzenie, które już płynie, zostaje zdarzeniem.
Nazwa oddaje intencję biznesową, nie mechanizm. Wskaż testy, które po zmianie przestaną działać (te sprawdzające efekt w drugim module).

## 3. Atomowość
Dwa pytania: czy zmiana stanu producenta jest w transakcji? czy zapis do outboxa trafia **do tego samego zasobu w tej samej transakcji**?
| Werdykt | Działanie |
|---|---|
| atomowe | ok |
| atomowe po poprawce | dodaj transakcję wokół zmiany stanu + zapisu wiadomości |
| nieatomowe (różne zasoby) | outbox w magazynie producenta · CDC własnego stanu (listen-to-yourself) · udokumentowane best-effort |
**Cicha utrata atomowości jest gorsza niż wywołanie synchroniczne.** Publikacja „po commicie” z pamięci (bez outboxa) gubi
wiadomości przy awarii między commitem a wysłaniem — nazwij to ryzyko, jeśli je akceptujesz.

## 4. Outbox — anatomia i decyzje
Transakcja producenta zapisuje stan + rekord outboxa → **relay** czyta oczekujące rekordy, wysyła do ujścia i oznacza jako wysłane →
po drugiej stronie **cienki adapter** woła publiczne API odbiorcy.
| Decyzja | Opcje (domyślna pogrubiona) |
|---|---|
| gotowe czy własne | **mechanizm frameworka/biblioteki**, jeśli jest · własna tabela + poller |
| przechwycenie | **za istniejącym portem/szyną** (producent bez zmian) · nowy port wysyłający |
| magazyn | zawsze zasób transakcyjny producenta |
| rekord | id wiadomości, typ, ładunek (serializowany), status, czas utworzenia, ewentualnie klucz kolejności |
| **id wiadomości** | nadawane **przy zapisie w transakcji** — nigdy przez relay (każda ponowiona próba dostałaby nowe id i deduplikacja przestaje działać) |
| relay | **poller** (opóźnienie = interwał) · śledzenie logu/CDC · natywny strumień bazy |
| ujście | szyna w procesie (szkielet) · broker — zmiana ujścia to jedyna zmiana potrzebna do rozdzielenia procesów |
| serializer | jeden, ten sam w outboxie i w teście kontraktu |
Sprzątanie wysłanych rekordów i metryka zaległości outboxa (ops-observability) należą do projektu.

## 5. Kolejność i ponowienia
- Kolejność **nie jest gwarantowana** (poller, ponowienia, wielu workerów). Gdy odbiorca jej wymaga: klucz kolejności i jedna
  wiadomość na klucz „w locie” — kosztem przepustowości.
- Dostarczenie **co najmniej raz** → odbiorca musi być idempotentny:
  - rekord deduplikacji (inbox) zapisany **w tej samej jednostce pracy co efekt** — obsługa musi być synchroniczna w tej
    transakcji; obsługa „po commicie” lub w osobnym wątku łamie gwarancję;
  - deduplikacja przez **atomowe zajęcie** id (insert z pominięciem przy konflikcie, compare-and-set), nie „sprawdź, potem zapisz”.
- Wiele instancji relaya może wysłać tę samą wiadomość dwa razy — poprawne dzięki idempotencji, ale marnotrawne:
  `SKIP LOCKED`, compare-and-set statusu lub dzierżawa.

## 6. Testy (kolejność TDD)
1. **Producent:** „wiadomość opublikowana” — test kończy się na granicy transakcji; dubler publikatora jest tu właściwy,
   bo emisja wiadomości JEST zachowaniem. Najpierw czerwony.
2. **Kontrakt formatu:** migawka/approval serializacji albo kontrakt konsumencki / rejestr schematów; ten sam serializer co outbox,
   stałe id i czasy w danych testowych; sprawdzaj kompatybilność wstecz (nowe pola opcjonalne).
3. **Konsument:** test adaptera (z dublerem API odbiorcy) i integracyjny na prawdziwej infrastrukturze, **z przypadkiem idempotencji**:
   to samo id dostarczone dwa razy → dokładnie jeden efekt.

## Raport zmiany (`docs/project/04-architecture/adr/…` lub raport kroku)
klasyfikacja (kryteria 1–2) · komenda/zdarzenie z uzasadnieniem · werdykt atomowości · decyzje outboxa · gwarancje kolejności ·
co pozostało sprzężone logicznie · wyniki trzech rodzajów testów.

## Przykład
**Sytuacja:** „Zamówienia wołają synchronicznie `fakturowanie.wystawFakture()`; gdy fakturowanie leży, nie da się zamówić.”
**Wynik** (raport zmiany):
- kryteria 1–2: wynik niepotrzebny, nikt nie czyta faktury zaraz po zamówieniu → można rozproszyć;
- zdarzenie `ZamowienieZlozone` (przyjmie też magazyn), nie komenda; test „zamówienie tworzy fakturę” idzie do konsumenta;
- atomowe: zamówienie + rekord outboxa w jednej transakcji, id wiadomości nadane przy zapisie; relay: poller co 1 s;
- kolejność niepotrzebna; odbiorca: inbox `INSERT … ON CONFLICT DO NOTHING` w transakcji faktury;
- test: to samo id dwa razy → dokładnie jedna faktura.

Więcej przykładów: `references/przyklady.md`.
