# Klasy problemów — rozpoznawanie w szczegółach

## Test zmienności (najważniejszy rozróżniacz)
Czy dane sprawdzane przy decyzji może w tej samej chwili zmienić **inne żądanie** (także ta sama osoba w drugiej karcie)?
Tak → potrzebna atomowość → konkurencja o zasoby. Nie → CRUD / obliczenie z walidacją.

## Sygnały
| Klasa | Mocne sygnały | Słabe (sprawdź testem zmienności) | Podejście |
|---|---|---|---|
| CRUD | pola opisowe; zapis nie zmienia tego, co inni mogą zrobić; nic w stanie systemu nie blokuje operacji | „tylko admin edytuje” | prosto: warstwa danych, walidacja; bez warstw domenowych |
| Transformacja | wynik deterministyczny z wejścia; „policz, wyceń”; nie zapisujemy decyzji wpływających na innych | „dużo reguł” | czyste funkcje, polityki, VO; ddd-algorithm-recognition |
| Prezentacja | tylko odczyt; widok łączy dane z wielu miejsc; kalendarz, raport, dashboard | „ekran z edycją” (to zwykle kilka klas) | projekcja/read model, BFF, widok zmaterializowany, cache odświeżany zdarzeniami |
| Integracja | „powiadom”, „wyślij do”, „zależy od systemu X”; częściowe awarie; ważna kolejność | „synchronizuje” | Published Language, ACL, saga/choreografia, outbox (be-messaging-outbox) |
| Konkurencja o zasoby | „nie może być dwa razy”, limity, rezerwacje, blokady, operacje zależne od stanu | „tylko jeden właściciel” | agregat z blokadą optymistyczną; bez transakcji na wiele agregatów; archetyp Availability |

## Sygnały z makiet UI
Jeden ekran to zwykle kilka klas. Patrz na **przyciski i stany**, nie na pola: pola opisowe → CRUD; przycisk zmieniający, co inni
mogą zrobić (zarezerwuj, zatwierdź, przydziel) → konkurencja o zasoby; wyszarzone akcje zależne od stanu → reguły domeny
(`canX()` wyliczane przez domenę, nie przez UI); zestawienie/kalendarz → prezentacja.

## Pułapki
- **Ukryty CRUD:** opisowe pola i status na jednym formularzu — rozdziel: edycja opisu (CRUD) ↔ zmiana stanu (domena). Domena
  wystawia `canEdit()`, a edycja opisu może wysłać sygnał „zmieniono X” do domeny, jeśli ją obchodzi.
- **Limit egzekwowany gdzie indziej** (system zewnętrzny, bank) — nie modeluj go agregatem u siebie.
- **Wyliczenie limitu to transformacja, egzekwowanie limitu to konkurencja o zasoby** — rozdziel.
- Dane prezentacyjne (opisy, zdjęcia) trzymaj poza agregatem konkurencji o zasoby.
- **Kalendarz to projekcja**, nie agregat. Tagi i kategorie to zwykle etykiety, nie encje.
- Test projekcji: „czy po skasowaniu i odbudowaniu z innych danych coś tracimy?” Nie → prezentacja.
- Nazwany przez biznes stan awarii integracji („płatność odrzucona”) to zdarzenie domenowe, nie obsługa błędu.

## Pytania rozstrzygające (kolejność)
1. Czy operacja zmienia to, co inni mogą zrobić? 2. Test zmienności. 3. Dla CRUD — Behaving/Becoming (czy status ukrywa cykl życia?).
4. Dla prezentacji — gdzie jest źródło prawdy? 5. Dla konkurencji — co jest zasobem, jaki niezmiennik, jaka ziarnistość blokady?
6. Dla integracji — co, jeśli druga strona nie odpowie; czy kolejność ma znaczenie?

## Wynik klasyfikacji
Klasa + **pewność** (wysoka: ≥ 3 zgodne mocne sygnały; średnia: 1–2 potwierdzone odpowiedziami; niska: trzeba dopytać) +
**ścieżka dedukcji** (tabela: pytanie → odpowiedź lub „wywnioskowane” → wniosek) + cytaty + „czego NIE robić”.
Dla złożonego obszaru: tabela **komponent → klasa** (źródło prawdy, read model, granica integracji, wspólny agregat).
Po klasie „konkurencja o zasoby” następny krok: projekt granicy spójności (ddd-tactical-design).
