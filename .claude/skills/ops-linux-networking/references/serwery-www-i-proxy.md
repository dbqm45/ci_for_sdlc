# Serwery WWW, proxy i równoważenie obciążenia

## Role
| Element | Co robi | Typowe narzędzia |
|---|---|---|
| **reverse proxy** | przyjmuje ruch od klientów i przekazuje do aplikacji: TLS, kompresja, limity, routing po ścieżce lub hoście | nginx, Caddy, Envoy, HAProxy, Traefik, Ingress / Gateway API w Kubernetesie |
| **load balancer L4** | rozkłada połączenia TCP/UDP, nie patrzy w HTTP | NLB, HAProxy w trybie TCP |
| **load balancer L7** | rozkłada żądania HTTP, zna ścieżki, nagłówki, ciasteczka | ALB, Application Gateway, nginx, Envoy |
| **forward proxy** | ruch **wychodzący** z sieci przechodzi przez proxy: allowlista domen, log, cache pakietów | Squid, proxy chmurowe, bramy NAT z filtrem |
| **serwer cache** | przechowuje odpowiedzi HTTP przed aplikacją | CDN, Varnish, `proxy_cache` w nginx |
| **serwer aplikacji** | uruchamia kod | Node, Tomcat, Kestrel/IIS; za reverse proxy, nie bezpośrednio z internetu |

## Konfiguracja reverse proxy — o czym pamiętać
- **TLS** kończony na proxy lub load balancerze, przekierowanie HTTP→HTTPS, HSTS (be-auth-security,
  `checklista-bezpieczenstwa-api.md`). Caddy wystawia i odnawia certyfikaty automatycznie; w nginx — certbot lub
  cert-manager.
- **Nagłówki od proxy**: `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host` (lub standardowy `Forwarded`).
  Aplikacja ufa im **tylko** od znanych proxy (np. `trust proxy` w Express, `server.forward-headers-strategy`
  w Spring Boot) — inaczej klient podszyje się pod dowolny adres IP i obejdzie limity żądań.
- **Limity czasu** spójne w łańcuchu: klient → load balancer → proxy → aplikacja → baza. Limit wyższego poziomu
  dłuższy niż niższego, inaczej proxy zrywa połączenie, a aplikacja dalej pracuje (`proxy_read_timeout`,
  `proxy_connect_timeout` w nginx).
- **Rozmiar żądań** (`client_max_body_size` w nginx) zgodny z limitem w aplikacji; większe pliki przez podpisany URL
  do magazynu obiektów.
- **SSE i strumieniowanie**: wyłączone buforowanie odpowiedzi dla tych tras (`proxy_buffering off` lub nagłówek
  `X-Accel-Buffering: no`) i długi limit czasu odczytu. **WebSocket**: przekazanie nagłówków `Upgrade` i `Connection`.
- **Kompresja** na proxy (gzip lub Brotli), jeśli aplikacja jej nie robi — w jednym miejscu, nie w dwóch.
- Ukryj wersję serwera (`server_tokens off`), brak listowania katalogów, osobne logi dostępu z identyfikatorem żądania
  przekazywanym do aplikacji (ops-observability).

## Równoważenie obciążenia
- Algorytmy: round robin (proste, równe żądania), najmniej połączeń (żądania o różnym koszcie), hash (powinowactwo,
  np. cache per klucz). Sticky sessions tylko gdy musisz — utrudniają skalowanie i wdrożenia; lepiej sesje poza procesem.
- Sondy zdrowia sprawdzają gotowość (`/health/ready`), a nie tylko to, czy port jest otwarty; instancja wycofywana
  łagodnie (opróżnianie połączeń) przy wdrożeniu.
- Siatka usług (Istio, Linkerd, w tym tryby bez sidecarów): mTLS, ponowienia, podział ruchu i telemetria między
  usługami bez zmian w kodzie — kosztem złożoności operacyjnej. Zwykle dopiero przy wielu usługach i zespołach;
  wcześniej wystarczą biblioteki i Gateway API (ops-kubernetes).

## Proxy wychodzące
- Aplikacje i CI wychodzą do internetu przez proxy lub bramę z allowlistą domen (rejestry pakietów, API partnerów).
  Utrudnia to wyprowadzenie danych i kontakt złośliwego kodu z serwerem napastnika (ops-supply-chain-security).
- Repozytorium artefaktów (Artifactory, Nexus, rejestr chmurowy) jako pośrednik do npm, Maven i obrazów: cache,
  jedno miejsce kontroli, możliwość kwarantanny nowych wersji.

## Źródła
- Dokumentacja nginx (`ngx_http_proxy_module`), Caddy, Envoy, Kubernetes Gateway API
- [roadmap.sh — DevOps](https://roadmap.sh/devops) (web servers, reverse proxy, forward proxy, caching server,
  load balancer, service mesh, artifact management)
Opisane własnymi słowami.
