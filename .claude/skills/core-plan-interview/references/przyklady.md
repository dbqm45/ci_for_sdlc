# Przykłady: przesłuchanie planu

## 1. Eksport zamówień do CSV
**Sytuacja:** „Chcę dodać eksport zamówień do CSV w panelu administratora. Przepytaj mnie, zanim zaczniesz”.

**Jak:**
1. Drzewo: uprawnienia, dane osobowe i filtry są od siebie niezależne; rejestr eksportów zależy od danych
   osobowych, rozmiar pliku od filtrów, a forma wydania pliku od rozmiaru.
2. Fakty sprawdzasz sam: `scout` ustala, że panel ma role `admin` i `support`, a tabela zamówień ma ok. 2 mln
   wierszy. O to nie pytasz.
3. Front pierwszej rundy: tylko decyzje bez nierozstrzygniętych warunków (uprawnienia, dane osobowe, filtry).
   Pytanie o formę wydania pliku czeka — zależy od odpowiedzi o filtrach (rozmiar pliku).

**Wynik (runda 1):**
```
**P1 — Kto może eksportować**: a) tylko admin, b) admin i support
→ Rekomendacja: a — eksport zawiera dane klientów; support może dostać to później.

**P2 — Dane osobowe w pliku**: a) pełne (imię, e-mail, adres), b) bez danych osobowych, c) do wyboru przy eksporcie
→ Rekomendacja: b — wystarcza do raportów, a nie tworzy kopii danych osobowych poza systemem.

**P3 — Filtry**: a) zakres dat, b) zakres dat i status, c) wszystkie filtry z listy zamówień
→ Rekomendacja: b — pokrywa opisany przypadek, a nie wiąże eksportu z każdą zmianą listy.
```
Człowiek: `P1: a, P2: c, P3: b`. Odpowiedzi odblokowują nowe pytania do rundy 2: rejestr eksportów (wynika
z P2: c) i forma wydania pliku, gdy filtr dat obejmie wszystkie 2 mln wierszy (wynika z P3).

## 2. Podsumowanie i potwierdzenie
**Sytuacja:** Po trzech rundach (13 pytań) front jest pusty.

**Jak:**
1. Podsumowanie: decyzje, założenia, co poza zakresem.
2. Pytanie o wspólne zrozumienie; bez „tak” nie wdrażasz.
3. Zapis decyzji do `decisions.md`; decyzja o wydawaniu plików w tle spełnia próg ADR → propozycja ADR.

**Wynik:**
```
Decyzje: eksport tylko dla admina; dane osobowe do wyboru, każdy eksport z danymi osobowymi w rejestrze;
filtry: daty i status; powyżej 50 tys. wierszy plik generowany w tle, link e-mailem.
Założenia: format CSV UTF-8 z separatorem „;” [do potwierdzenia przez dział raportów].
Poza zakresem: eksport do XLSX, harmonogram automatycznych eksportów.
Czy tak to rozumiemy?
```

## 3. Człowiek niedostępny
**Sytuacja:** Człowiek zostawia notatkę: „Wyjeżdżam do piątku, przygotuj plan migracji logowania na OIDC”.

**Jak:**
1. Fakty z repo zbierasz jak zwykle.
2. Decyzji nie rozstrzygasz po cichu: rekomendacje przyjmujesz jako jawne **założenia**.
3. Nie wdrażasz — plan czeka na potwierdzenie po powrocie.

**Wynik:**
```
Założenia (do potwierdzenia, nic nie wdrożono):
Z1 — dostawca tożsamości: obecny Keycloak firmy [rekomendacja P1]
Z2 — stare sesje: wygasają naturalnie, bez wymuszonego wylogowania [rekomendacja P2]
Z3 — konta bez e-maila: ręczne łączenie przez support [rekomendacja P3]
Po powrocie: potwierdź lub zmień Z1–Z3; Z1 zmienia kształt dalszych pytań.
```
