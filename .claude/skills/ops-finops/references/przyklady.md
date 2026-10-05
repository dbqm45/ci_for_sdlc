# Przykłady FinOps

Kwoty i nazwy w przykładach są ilustracyjne — w prawdziwej pracy biorą się z Infracost, raportu kosztów dostawcy
i metryk wykorzystania.

## 1. Koszt w PR ze zmianą bazy
**Sytuacja:** PR w Terraform powiększa bazę `orders-db` i dodaje środowisko `orders-preview`. Infracost
skomentował różnicę, a polityka Conftest zgłosiła ostrzeżenie.

**Jak:**
1. Przeczytaj różnicę kosztu miesięcznego z komentarza Infracost i rozbij ją na zasoby.
2. Sprawdź tagi `team`, `env`, `project` i `expires` przy zasobach tymczasowych — brak tagu blokuje plan.
3. Odróżnij warstwy polityki: ostrzeżenie (ryzykowny wybór) od blokady (oczywiste marnotrawstwo poza produkcją).
4. Wpisz różnicę kosztu i uzasadnienie do opisu PR.

**Wynik:** fragment opisu PR
```text
Koszt (Infracost): +1 240 USD/mies.

| Zasób                       | Przed | Po    | Różnica | Uwagi                                  |
|-----------------------------|-------|-------|---------|----------------------------------------|
| orders-db (prod)            | 610   | 1 220 | +610    | 2× większa klasa; CPU p95 = 85% od 3 tyg. |
| orders-preview-db (preview) | 0     | 630   | +630    | klasa produkcyjna poza produkcją     |

Polityka: WARN orders-preview-db — klasa spoza listy dozwolonych dla env=preview
Decyzja: preview zmienione na najmniejszą dozwoloną klasę (+90 zamiast +630),
         tag expires=2026-11-15; nowa różnica: +700 USD/mies.
```
```hcl
tags = {
  team    = "orders"
  env     = "preview"
  project = "checkout"
  expires = "2026-11-15"
}
```

## 2. Cotygodniowy przegląd sprzątania
**Sytuacja:** „Agent, przygotuj listę rzeczy do usunięcia z konta dev — rachunek rośnie.”

**Jak:**
1. Zbierz kandydatów według progów: CPU < 5% przez 30 dni, niepodpięte dyski, migawki starsze niż 90 dni, load
   balancery bez celów; osobno zasoby wykorzystane poniżej 40% (do zmniejszenia).
2. Przypisz właściciela z tagu `team`; zasób bez tagu idzie do zespołu platformy.
3. Wyślij listę właścicielom z terminem sprzeciwu 7 dni.
4. Niczego nie usuwaj — usunięcie wykonuje człowiek po upływie terminu.

**Wynik:**
```text
Przegląd 2026-10-05 (konto dev) — sprzeciw do 2026-10-12

| Zasób               | Kryterium               | Koszt/mies. | Właściciel | Propozycja      |
|---------------------|-------------------------|-------------|------------|-----------------|
| vm-batch-old-2      | CPU 1,8% przez 30 dni   | 140 USD     | data       | usunąć          |
| vol-0a91 (200 GiB)  | niepodpięty od 41 dni   | 16 USD      | brak tagu  | usunąć          |
| snap-ci-* (37 szt.) | starsze niż 90 dni      | 52 USD      | platform   | usunąć          |
| lb-legacy-api       | brak celów              | 18 USD      | orders     | usunąć          |
| vm-search-1         | CPU 22%, pamięć 31%     | 280 USD     | search     | zmniejszyć o pół |

Potencjalna oszczędność: 226 USD/mies. (usunięcia) + ok. 140 USD/mies. (zmniejszenie)
Agent: brak usunięć; czeka na decyzję właścicieli i akceptację człowieka.
```

## 3. Rosnący rachunek a koszt jednostkowy
**Sytuacja:** Budżet zespołu `payments` przekroczył próg 100%, kierownik pyta, czy to marnotrawstwo.

**Jak:**
1. Zestaw koszt z miarą biznesową (transakcje) — sam rachunek nie odpowiada na pytanie.
2. Policz koszt jednostkowy miesiąc do miesiąca.
3. Gdy koszt jednostkowy stoi, wzrost jest zdrowy; gdy rośnie, szukaj anomalii i zasobów do sprzątania.
4. Zaproponuj korektę budżetu albo działania naprawcze, z alertami 80/100/120%.

**Wynik:**
```text
| Miesiąc  | Koszt [USD] | Transakcje | USD / 1000 transakcji |
|----------|-------------|------------|-----------------------|
| lipiec   | 8 000       | 4,0 mln    | 2,00                  |
| sierpień | 9 100       | 4,6 mln    | 1,98                  |
| wrzesień | 11 900      | 4,8 mln    | 2,48  ← +25%          |

Wniosek: lipiec→sierpień to zdrowy wzrost (koszt jednostkowy płaski). We wrześniu koszt
jednostkowy skoczył o 25% przy +4% ruchu — anomalia: klaster testów obciążeniowych bez tagu
expires działa od 3.09 (ok. 2 600 USD). Działanie: właściciel potwierdza wyłączenie, polityka
wymaga expires dla env=perf; budżet bez zmian.
```
