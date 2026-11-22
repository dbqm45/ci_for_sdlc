# Pytania z komunikatora (DI Channels, krok 16)

Data: 2026-11-22 · Status: strona DI Definition gotowa; aplikacja Slack w `dbqm45/di-channels` — do zbudowania.

Część R1c z [`REFINEMENT-PLAN.md`](REFINEMENT-PLAN.md): osoba w Slacku zadaje pytanie do historyjki („dodaj pytanie”),
a ono trafia na stronę elementu tak samo jak pytanie zadane w aplikacji (R1, ustalenie `HUMAN-001`). Aplikacja
w Slacku to wspólna usługa suity (`di-channels`); DI Definition przyjmuje od niej tylko podpisane pytanie.

Decyzje właściciela (2026-11-22): **Slack** jako pierwsza platforma (D-P9); **na start bez usługi tożsamości suity**
(krok 14) — autorem jest nazwa wyświetlana ze Slacka z dopiskiem „(Slack)”, a identyfikator użytkownika Slacka jest
zapisany przy pytaniu, żeby po kroku 14 powiązać go z kontem suity.

## Wywołanie

`POST /api/webhooks/channels`, poza tokenem administratora jak inne webhooki, ale z obowiązkowym podpisem:

| Nagłówek | Wartość |
|---|---|
| `Content-Type` | `application/json` (najwyżej 16 KiB) |
| `X-DI-Timestamp` | sekundy Unix; okno ±5 minut |
| `X-DI-Signature` | `v1=<hex HMAC-SHA256(CI_CHANNELS_SIGNING_SECRET, "<X-DI-Timestamp>.<surowe ciało>")>` — ten sam schemat co połączenie z pdi |

Ciało (nieznane pola → 400):

```json
{
  "id": "Ev01ABC",
  "platform": "slack",
  "workspace": "mobile",
  "item": "PAY-123",
  "text": "Does this work offline?",
  "link": "https://acme.slack.com/archives/C1/p1",
  "author": { "name": "Ola", "user": "U012AB3CD" }
}
```

- `id` — identyfikator zdarzenia ze Slacka; ponowne doręczenie tego samego `id` niczego nie dodaje (`duplicate: true`).
- `workspace` — opcjonalnie; bez niego przestrzeń domyślna. Mapowanie kanału Slacka na przestrzeń trzyma `di-channels`.
- `link` — zwykle odnośnik do wiadomości w Slacku.

Odpowiedzi: 200 `{ question, duplicate, url? }` (`url` — strona elementu, gdy ustawiony jest `CI_PUBLIC_URL`;
`di-channels` odsyła go osobie w Slacku), 400 (zła treść, z powodem), 401 (podpis), 404 (nieznana historyjka albo
przestrzeń; także cała trasa bez `CI_CHANNELS_SIGNING_SECRET`).

Pytanie jak każde z R1: widzi je cały zespół z autorem, a gotowość obniża dopiero po przyjęciu przez PO. Każde
pytanie trafia do dziennika audytu (`question`, „asked from slack”, sposób: `channels_signature`).

## Czego tu nie ma

Przypomnienia, głosowanie i odpowiedzi w wątku (R8), Teams, powiązanie z kontem suity (po kroku 14). Gdy pojawi się
drugi odbiorca pytań z komunikatora, kształt ciała warto przenieść do kontraktu suity (`di-contract`) jako zdarzenie.
