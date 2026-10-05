---
name: proc-team-topologies
description: Użyj przy strukturze zespołów i ich interakcji — cztery typy zespołów, tryby współpracy, obciążenie, prawo Conwaya.
metadata:
  katalog: "Użyj przy projektowaniu struktury zespołów i ich interakcji — cztery typy zespołów, trzy tryby współpracy, obciążenie poznawcze, prawo Conwaya i dopasowanie zespołów do granic kontekstów DDD. Nie do rytuałów pracy zespołu (proc-agile) ani skalowania SAFe (proc-safe)."
  slowa: "jak ułożyć zespoły, przeprojektować zespół organizacyjnie, zespół zawalony prośbami, zespół platformowy, zespół produktowy, zespół strumieniowy, zespół wspierający, prawo Conwaya, architektura a struktura zespołów, obciążenie poznawcze zespołu, platforma wewnętrzna"
---

# Team Topologies

## Typy zespołów
| Typ | Rola |
|---|---|
| **Stream-aligned** | dostarcza wartość end-to-end w jednym strumieniu (produkt, kontekst, segment klientów) — większość zespołów |
| **Platform** | udostępnia usługi wewnętrzne jako produkt (samoobsługa), by zmniejszyć obciążenie zespołów strumieniowych |
| **Enabling** | czasowo pomaga zespołom nabyć umiejętność (np. testy, obserwowalność), potem odchodzi |
| **Complicated-subsystem** | utrzymuje część wymagającą specjalistycznej wiedzy (np. silnik wyceny, algorytm przydziału) |

## Tryby współpracy
- **Collaboration** — ścisła współpraca na czas odkrywania (krótko, drogo).
- **X-as-a-Service** — korzystanie przez jasny interfejs (domyślny cel dla platformy).
- **Facilitating** — zespół enabling uczy innych.
Zmiana trybu to świadoma decyzja; długotrwała „współpraca” zwykle oznacza złą granicę.

## Zasady
- **Obciążenie poznawcze** zespołu jest ograniczone — granice odpowiedzialności dobieraj tak, by zespół rozumiał swoją część w całości.
- **Prawo Conwaya** — architektura odzwierciedla strukturę komunikacji; **odwrócony manewr Conwaya**: ułóż zespoły tak,
  jak chcesz, by wyglądała architektura.
- **Zespoły wokół granic kontekstów** (ddd-strategic-analysis): jeden kontekst → jeden zespół właściciel; relacje na mapie
  kontekstów (ddd-context-mapping) odpowiadają trybom współpracy (np. Open Host Service ≈ X-as-a-Service).
- Mierz zależności między zespołami — każda to czekanie (proc-lean).

## Platforma jako produkt
Zespół platformowy (np. wewnętrzna platforma deweloperska, IDP) działa jak zespół produktowy:
- ma product managera i użytkowników (zespoły strumieniowe), zbiera od nich opinie i mierzy adopcję;
- zaczyna od jednego zespołu pilotażowego, zanim platforma stanie się obowiązkowa — narzucona z góry rodzi „ShadowOps”;
- dostarcza **złote ścieżki**: szablony i moduły, w które wbudowano bezpieczeństwo, tagi kosztowe i obserwowalność,
  zamiast reguł w wiki;
- decyzja „budować portal (np. Backstage) czy kupić” liczy pełny koszt: kilka etatów przez kilka miesięcy do pierwszej
  użytecznej wersji, dojrzałość wtyczek, brak wbudowanego RBAC w wersji otwartoźródłowej.
Źródła (devops.com): [Tips for Managing Internal Developer Platforms](https://devops.com/tips-for-managing-internal-developer-platforms-idps/),
[Is Backstage the Right Internal Developer Portal for You?](https://devops.com/is-backstage-the-right-internal-developer-portal-for-you/) (artykuł dostawcy),
[Policy as Code for Cost Control](https://devops.com/policy-as-code-for-cost-control-not-just-compliance/)

## Przykład
**Sytuacja:** zespoły „Frontend”, „Backend” (40 otwartych próśb) i „DevOps”; funkcja czeka w trzech kolejkach.
**Wynik (odwrócony manewr Conwaya):** funkcja potrzebuje jednego zespołu strumieniowego i usług zamiast trzech.

| Przed | Po | Typ, tryb |
|---|---|---|
| Frontend + Backend | Katalog; Zamówienia i Płatności | stream-aligned |
| | Wycena (reguły rabatowe) | complicated-subsystem, X-as-a-Service |
| DevOps | Platforma | platform, X-as-a-Service |

Więcej przykładów: `references/przyklady.md`.
