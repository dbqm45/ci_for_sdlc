# Usuwanie danych klienta (T7)

Stan: 2026-11-10. Decyzje właściciela: **usunięta przestrzeń czeka 30 dni** (można ją przywrócić po pomyłce), potem
jest kasowana na zawsze; na żądanie zespołu operator **kasuje całą organizację jednym działaniem**, a zostaje tylko
ślad bez danych osobowych. Wymóg RODO (art. 17) i DPA (`BETA-PLAN.md` §5).

## 1. Usunięcie przestrzeni (Admin zespołu)

*Settings → Workspace → Delete* (id wpisane dla potwierdzenia) albo `DELETE /api/workspaces/<id>`:

1. Analiza przestrzeni staje, przestrzeń znika z listy.
2. **Połączenie z Atlassianem jest usuwane od razu** (zaszyfrowany token odświeżania), więc usunięta przestrzeń nie ma
   już dostępu do strony zespołu.
3. Dane przestrzeni (ustawienia, decyzje, zatwierdzenia, audyt, wyniki) czekają **30 dni** (`ERASE_AFTER_DAYS`);
   odpowiedź podaje datę (`eraseAfter`), a audyt organizacji zapisuje ją.
4. Do tej daty operator może przestrzeń **przywrócić** (`#/operator` → *Deleted workspaces* → *Restore*;
   `POST /api/workspaces-deleted/restore`) — połączenie z Atlassianem trzeba wtedy zrobić od nowa — albo **skasować od
   razu** (*Erase now*; `POST /api/workspaces-deleted/erase`).
5. Po dacie zadanie serwera (co godzinę i przy starcie) kasuje dane na zawsze, razem z wydatkiem AI przestrzeni i jej
   notatkami pomiaru.

## 2. Skasowanie organizacji na żądanie (operator)

Zespół odchodzi i prosi o usunięcie danych → `#/operator` → wiersz zespołu → **Erase all data…** (nazwa organizacji
wpisana dla potwierdzenia; `POST /api/orgs/<id>/erase`). Od razu i bez możliwości przywrócenia znikają:

| Co | Gdzie było |
|---|---|
| wszystkie przestrzenie organizacji, także usunięte i czekające 30 dni | dane przestrzeni |
| połączenia z Atlassianem (tokeny) | dane przestrzeni |
| ludzie organizacji (konto, e-mail, imię, sesje) — chyba że należą też do innej organizacji, wtedy tylko członkostwo | `_platform` |
| zaproszenia | `_platform` |
| zgłoszenie do bety, zapis uczestnictwa i **odpowiedzi na ankiety** | `_platform` |
| zdarzenia pomiaru użycia i ich kolejka do wysłania | `_platform` |
| limit i wydatek AI przestrzeni | `_platform` |

Pierwszej organizacji (instalacji) nie da się skasować. Test `DEL-04` sprawdza, że po skasowaniu w katalogu danych nie
ma ani e-maila, ani imienia, ani treści pracy zespołu.

**Co zostaje:** wpis w rejestrze kasowań (`GET /api/erasures`, operator): data, kto skasował, nazwa organizacji i
liczby (przestrzenie, osoby, zaproszenia, zdarzenia, odpowiedzi). Bez e-maili i imion. Audyt pierwszej organizacji
zawiera wpisy operatora o zespole (zgłoszenie, zatwierdzenie) z nazwą organizacji, bez e-maili.

## 3. Poza serwerem — sprawdź przy każdym żądaniu

| Gdzie | Co zrobić |
|---|---|
| **Kopie w B2** | kasowane same: dzienne po 35 dniach, miesięczne po 100 (blokada nie pozwala skasować wcześniej). Napisz to w odpowiedzi zespołowi i w DPA. Przy odtworzeniu kopii sprzed skasowania skasuj organizację ponownie. |
| **Render** (odtwarzanie bazy) | okno 3 dni (Hobby) — samo wygasa. |
| **PostHog** (jeśli włączony) | zdarzenia mają tylko pseudonimy i liczby, bez treści i e-maili; jeśli zespół prosi także o nie, usuń w PostHog dane jego grupy/osób (*Persons & groups → Delete*). |
| **Resend** | logi wysłanych maili (adresat, temat) przechowuje Resend według swoich zasad; usuń je w panelu, jeśli trzeba. |
| **Atlassian** | zespół może sam odebrać dostęp aplikacji: *Atlassian account → Connected apps* (tokeny po naszej stronie są już skasowane). |
| **AWS Bedrock** | nie przechowuje treści zapytań na potrzeby trenowania (sprawdź w aktualnych warunkach AWS); nic do zrobienia. |
| **Twoja poczta** | maile powiadomień o zgłoszeniu (operator) — usuń ręcznie. |

## 4. Procedura żądania (RODO)

1. Potwierdź tożsamość proszącego (mail z adresu kontaktowego zespołu albo Owner zalogowany w aplikacji).
2. Odpowiedz bez zbędnej zwłoki, najpóźniej w ciągu miesiąca.
3. *Erase all data…* na `#/operator`, potem kroki z §3.
4. Odpisz zespołowi: co skasowano (liczby z wyniku), że kopie wygasną najpóźniej po 100 dniach, i co ewentualnie
   zostało (§2, „Co zostaje”).
