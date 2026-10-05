# Scenariusz: sieć przychodni weterynaryjnych „Łapa” (fikcyjny)

> Dla orkiestratora i coacha. **Uczestnicy tego pliku nie czytają** (hook `cleanroom_guard.py`, profil `es-sim`).
> Fikcja napisana na potrzeby treningu — zbieżność z realnymi firmami przypadkowa.

## Domena
Cztery przychodnie w jednym mieście, jedna z dyżurem nocnym. Rejestracja telefoniczna i przez formularz, wizyty planowe
i nagłe, szczepienia z przypomnieniami, zabiegi, apteka przychodni (sprzedaż leków i ewidencja obrotu), rozliczenia
(paragon/faktura, pakiety opieki), klienci stali i hodowcy. Właścicielka planuje piątą placówkę i „system, który ogarnie wszystko”.

## Wiedza ukryta (ujawnia się tylko, gdy facylitator dopyta właściwą osobę)
| Fakt | Kto wie |
|---|---|
| 18% umówionych wizyt przepada (klient nie przychodzi); nikt tego nie liczy oficjalnie | recepcja (dobrze), właścicielka (myśli, że „kilka procent”) |
| przypomnienia o szczepieniach robione ręcznie z zeszytu, co drugi miesiąc ktoś zapomina | recepcja |
| karta leczenia bywa zamykana następnego dnia rano (wieczorem brak czasu) | lekarz |
| leki przeterminowane w apteka kosztują ok. 4% obrotu; dostawy zamawiane „na oko” | apteka |
| pakiety opieki (roczne) rozliczane w Excelu; zdarza się podwójne zużycie tej samej usługi z pakietu | księgowa, recepcja (pobieżnie) |
| hodowcy mają rabat „za miot”, nigdzie nie spisany | hodowca, właścicielka |

## Celowe sprzeczności (hot spot powstaje tylko, gdy facylitator je zderzy)
1. **Kiedy wizyta jest „zakończona”?** — recepcja: po zapłacie przy ladzie · lekarz: po zamknięciu karty leczenia ·
   księgowa: po wystawieniu paragonu/faktury · właścicielka: gdy zwierzę wychodzi z gabinetu („to oczywiste”).
2. **Kto decyduje o przyjęciu na dyżurze nocnym?** — lekarz: „zawsze przyjmujemy, taka jest zasada szefowej” ·
   właścicielka: „w nocy tylko stali klienci, obcy do kliniki całodobowej” · recepcja: „lekarz dyżurny decyduje przez telefon”.

## Czego nie zdradzać uczestnikom ani przez uczestników
Docelowe konteksty (rejestracja i grafik, leczenie, apteka i magazyn, rozliczenia i pakiety, komunikacja z klientem),
„kanoniczna” lista zdarzeń, wzorce taktyczne. Uczestnicy mówią językiem swojej pracy, nie językiem modelowania.

## Oczekiwane zdarzenia przełomowe (dla coacha)
Wizyta umówiona · Pacjent przyjęty · Leczenie zakończone / karta zamknięta · Płatność przyjęta · Lek wydany · Pakiet wykupiony.

## Anty-wzorce trenowane przez osoby
| Osoba | Trenuje | Co działa |
|---|---|---|
| Grażyna (właścicielka) | monopolizowanie głosu | limit czasu, „zapiszmy to na kartce”, zaproszenie innych po imieniu |
| Beata (recepcja) | milczący uczestnik | pytanie wprost, prośba o przykład „z wczoraj” |
| dr Paweł (lekarz) | dygresje | parking, „co się wydarzyło potem?” |
| Kamil (IT) | przedwczesne projektowanie | parking na „rozwiązania”, pytanie o zdarzenia zamiast tabel |
| Halina (księgowa) | zbaczanie w przepisy i szczegóły | docenić compliance jako hot spot i wrócić do osi |
| Robert (apteka) | pomijany obszar (compliance leków) | zapytać o regulacje i ewidencję |
| Jolanta (hodowczyni, dołącza na zaproszenie) | narzucanie obcej ramy („u nas w hodowli…”) | nie autorytet, tylko zaproszenie, by sama sprawdziła tezę na przykładzie |
