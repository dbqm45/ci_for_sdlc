# Wzorce chmurowe i wybór platformy uruchomieniowej

## Katalog wzorców (Azure Architecture Center) — gdzie w fabryce
Nazwy wzorców to wspólny słownik w ADR i review. Kolumna „w fabryce” mówi, gdzie jest procedura.
| Grupa | Wzorce | W fabryce |
|---|---|---|
| odporność | Retry, Circuit Breaker, Bulkhead, Health Endpoint Monitoring, Throttling, Rate Limiting | ops-sre-incidents (projektowanie na awarię), be-api-design (`http-w-praktyce.md`, `checklista-wydajnosci-backendu.md`), ops-observability |
| dane | Cache-Aside, Materialized View, Index Table, Sharding, CQRS, Event Sourcing | be-api-design (`checklista-wydajnosci-backendu.md`), be-database (`wydajnosc-bazy.md`), ddd-tactical-design |
| komunikacja | Publisher-Subscriber, Competing Consumers, Queue-Based Load Leveling, Priority Queue, Sequential Convoy, Claim Check, Messaging Bridge, Idempotent Consumer | be-messaging-outbox, `katalog-stylow.md` |
| spójność rozproszona | Saga, Compensating Transaction, Choreography, Scheduler Agent Supervisor, Leader Election | ddd-tactical-design (saga), be-messaging-outbox |
| bramy i krawędź | Gateway Routing, Gateway Aggregation, Gateway Offloading, Backends for Frontends, Gatekeeper, Ambassador, Sidecar | be-api-design (`style-i-komunikacja.md`), ops-linux-networking (`serwery-www-i-proxy.md`) |
| integracja i migracja | Anti-Corruption Layer, Strangler Fig, Asynchronous Request-Reply, Pipes and Filters | ddd-context-mapping, eng-behavior-preserving-refactoring, be-api-design (`202`) |
| wdrożenie i skala | Deployment Stamps, Geode, Compute Resource Consolidation, Static Content Hosting, External Configuration Store | ops-release-engineering, ops-security-operations (wiele regionów) |
| bezpieczeństwo | Federated Identity, Valet Key (podpisany URL), Quarantine | be-auth-security, ops-supply-chain-security |
Uwagi do wybranych:
- **Strangler Fig**: nowy system przejmuje funkcje starego stopniowo za wspólną fasadą (routing po ścieżce lub
  funkcji), stary wyłączany kawałkami — zamiast przepisania „wielkim wybuchem”. Każdy krok wydawany i odwracalny.
- **Deployment Stamps**: powtarzalne, niezależne kopie całego systemu (z danymi) per region lub grupa klientów —
  ograniczają zasięg awarii i ułatwiają wymogi lokalizacji danych; koszt: wiele środowisk do utrzymania.
- **Sidecar / Ambassador**: funkcje pomocnicze (proxy, mTLS, logi) w osobnym kontenerze obok aplikacji; podstawa siatki
  usług. Zanim dodasz — czy biblioteka lub platforma nie zrobi tego taniej?

## Gdzie uruchamiać
| Platforma | Kiedy | Uważaj na |
|---|---|---|
| **PaaS / hosting frontendu** (Vercel, Netlify, Render, Railway, Heroku, App Service) | mały zespół, aplikacja webowa lub API bez nietypowych wymagań | koszt przy dużym ruchu, uzależnienie od funkcji platformy, region danych |
| **funkcje** (AWS Lambda, Azure Functions, Cloud Functions) | zdarzenia, nieregularny ruch, krótkie zadania | zimny start, limity czasu i pamięci, pule połączeń do bazy (pośrednik), koszt przy stałym obciążeniu |
| **kontenery bez klastra** (Cloud Run, ECS na Fargate, Azure Container Apps) | usługi HTTP i zadania w tle bez zarządzania klastrem | mniej kontroli nad siecią i harmonogramem |
| **Kubernetes zarządzany** (EKS, GKE, AKS) | wiele usług i zespołów, potrzeba wspólnej platformy | koszt operacyjny i kompetencje (ops-kubernetes); platforma jako produkt (proc-team-topologies) |
| **maszyny wirtualne** | oprogramowanie, które tego wymaga, specyficzny sprzęt | łatanie i konfiguracja (ops-linux-networking), maszyny niezmienialne z obrazów |
Mniejsi dostawcy (DigitalOcean, Hetzner) bywają znacznie tańsi dla prostych obciążeń — kosztem mniejszej liczby
usług zarządzanych. Decyzja w ADR według scenariuszy jakości, kosztu (ops-finops) i kompetencji zespołu
(arch-tech-selection).

## Źródła
- [Microsoft Azure Architecture Center — Cloud design patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/)
- [roadmap.sh — DevOps](https://roadmap.sh/devops) (cloud design patterns, cloud providers, serverless, PaaS,
  container orchestration)
Opisane własnymi słowami.
