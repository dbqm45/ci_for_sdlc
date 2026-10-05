---
name: ops-kubernetes
description: Użyj przy manifestach i operacjach Kubernetes — zasoby, sondy, repliki i PDB, autoskalowanie, RBAC, NetworkPolicy.
metadata:
  katalog: "Użyj przy manifestach i operacjach Kubernetes — zasoby (requests/limits), sondy, liczba replik i PodDisruptionBudget, autoskalowanie, bezpieczeństwo podów (Pod Security Standards, securityContext), RBAC i konta usług, NetworkPolicy, sekrety, walidacja manifestów w CI, aktualizacje klastra. Nie do obrazów (ops-docker), wydań i GitOps (ops-release-engineering) ani chmury (ops-iac-terraform)."
---

# Kubernetes

## 1. Każdy Deployment ma
- **requests** CPU i pamięci z rzeczywistego zużycia (bez nich scheduler zgaduje, a HPA na procencie CPU/pamięci nie działa);
  **limit pamięci** zawsze; limit CPU ostrożnie — zbyt niski dławi aplikację (throttling).
- **readinessProbe** (czy przyjmować ruch) i **livenessProbe** (czy restartować) — różne endpointy, liveness nie
  sprawdza zależności zewnętrznych, bo awaria bazy zrestartuje wszystkie pody. Wolny start: `startupProbe`.
- Co najmniej 2 repliki dla usług produkcyjnych, `PodDisruptionBudget` (np. `maxUnavailable: 1`) i strategia
  `RollingUpdate` z `maxUnavailable`, która nie wyłącza wszystkich podów naraz.
- Obraz przypięty do wersji lub digestu, nigdy `latest` — przy restarcie lub przeniesieniu poda węzeł pobierze to, na co
  tag wskazuje **teraz**, i zachowanie zmieni się bez żadnego wdrożenia.
- Łagodne zamykanie: obsługa SIGTERM, `terminationGracePeriodSeconds` dłuższy niż najdłuższe żądanie.

## 2. Autoskalowanie
- HPA na metryce, która naprawdę rośnie z obciążeniem (CPU, żądania na sekundę, długość kolejki — KEDA dla kolejek
  i zdarzeń). Minimum i maksimum replik ustawione świadomie; maksimum chroni przed kosztem i przeciążeniem bazy.
- Autoskalowanie węzłów (Cluster Autoscaler, Karpenter) wymaga poprawnych requests — inaczej węzły są źle dobrane.

## 3. Bezpieczeństwo podów
- Namespace z etykietą `pod-security.kubernetes.io/enforce: restricted` (Pod Security Standards); wyjątki jawne.
- `securityContext`: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`,
  `seccompProfile.type: RuntimeDefault` (tego wymaga profil `restricted`) oraz `readOnlyRootFilesystem: true` (poza
  profilem — wymuś polityką Kyverno lub Gatekeeper).
- `automountServiceAccountToken: false`, jeśli pod nie rozmawia z API Kubernetes.
- **NetworkPolicy** (działa tylko z wtyczką sieci CNI, która ją egzekwuje) domyślnie odmawiająca ruchu w namespace, potem jawne zezwolenia; ruch wychodzący ograniczony
  (także do metadanych chmury).
- RBAC: jedno konto usługi na aplikację, Role w namespace zamiast ClusterRole, bez `*` w zasobach i czasownikach.
  Dostęp chmurowy przez tożsamość obciążenia (IRSA, EKS Pod Identity, Workload Identity), nie przez klucze w sekretach.
- Polityki wymuszane przy przyjęciu (admission): Kyverno lub OPA Gatekeeper — np. zakaz `latest`, wymagane requests,
  tylko obrazy z zaufanego rejestru i podpisane (cosign).

## 4. Sekrety i konfiguracja
- Sekrety przez `secretKeyRef`/wolumeny z zewnętrznego menedżera (External Secrets, Vault, Sealed Secrets, SOPS),
  nigdy jawnie w manifeście ani w pliku pipeline'u. Włączone szyfrowanie sekretów w etcd.
- Nazwy zmiennych w manifeście i aplikacji zgodne — niezgodność kończy się awarią podów przy starcie; aplikacja
  waliduje konfigurację przy starcie (lang-typescript, sekcja o `process.env`).
- **Konfiguracja wdraża się razem z kodem.** Częsty „drobny” błąd: nowa wersja aplikacji oczekuje nowej wartości
  (np. adresu API), a ConfigMap lub Secret zostały stare — pody działają, wdrożenie wygląda na udane, aplikacja pada
  dopiero przy pierwszym wywołaniu. Dlatego:
  - ConfigMap i odwołania do sekretów w tym samym PR i repozytorium GitOps co zmiana kodu, która ich wymaga;
  - zmiana konfiguracji wymusza nowy rollout: Kustomize `configMapGenerator`/`secretGenerator` (nazwa z sufiksem
    skrótu) albo w Helm adnotacja z sumą kontrolną konfiguracji w szablonie poda. Zmienne środowiskowe z ConfigMap nie
    odświeżają się w działającym podzie;
  - aplikacja sprawdza wymagane wartości przy starcie i nie zgłasza gotowości (readiness), gdy ich brakuje — wtedy
    rolling update zatrzyma się na pierwszym podzie zamiast wymienić wszystkie.

## 5. Walidacja w CI
`yamllint`, walidacja schematu (`kubeconform`), `kubectl apply --dry-run=server` na klastrze testowym, lint
Helm/Kustomize, skan polityk (Kyverno CLI, Conftest). Agent nie wykonuje `kubectl apply` na klastrze współdzielonym —
zmiana idzie przez GitOps (ops-release-engineering); hook `guard_bash.py` pyta o zgodę przy `kubectl apply/delete`.

## 6. Aktualizacje klastra
Przed aktualizacją: lista usuwanych wersji API (np. `kubent`, `pluto`), zgodność kontrolerów i operatorów, aktualizacja
najpierw w środowisku testowym, węzły po kolei z respektowaniem PDB.

## Przykład
**Sytuacja:** `orders-api` na produkcję; start ok. 40 s, zużycie ok. 300m CPU i 380 MiB.
**Wynik** (kluczowe pola Deployment, zagnieżdżenie skrócone; obok PDB `maxUnavailable: 1`):
```yaml
replicas: 3
image: registry.acme.example/orders-api@sha256:<digest>
resources: { requests: { cpu: 300m, memory: 400Mi }, limits: { memory: 512Mi } }
startupProbe: { httpGet: { path: /health/live, port: 8080 }, periodSeconds: 5, failureThreshold: 12 }
readinessProbe: { httpGet: { path: /health/ready, port: 8080 } }
livenessProbe: { httpGet: { path: /health/live, port: 8080 } }
securityContext: { runAsNonRoot: true, allowPrivilegeEscalation: false, capabilities: { drop: [ALL] } }
```
Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] requests, limit pamięci, sondy readiness/liveness, ≥ 2 repliki i PDB
- [ ] Pod Security `restricted`, securityContext, NetworkPolicy domyślnie odmawiająca
- [ ] konto usługi per aplikacja, minimalny RBAC, tożsamość obciążenia zamiast kluczy
- [ ] sekrety z menedżera, walidacja manifestów i polityk w CI
- [ ] zmiana konfiguracji w tym samym PR co kod i wymuszająca rollout; walidacja konfiguracji przy starcie
- [ ] przed aktualizacją klastra sprawdzone usuwane API

## Źródła
- [10 Minor DevOps Mistakes That Can Cause Major Production Issues](https://medium.com/coinmonks/10-minor-devops-mistakes-that-can-cause-major-production-issues-191d141e7686) — Pawan Natekar, 2026 (nieaktualny ConfigMap/Secret, `latest`, brak limitów)
- [Why Your Deployments Fail: A Deep Dive Into Misconfigured Pipelines](https://devops.com/why-your-deployments-fail-a-deep-dive-into-misconfigured-pipelines/) (devops.com)
- Dokumentacja Kubernetes: [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/),
  [Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/),
  [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/),
  [Specifying a Disruption Budget](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
devops.com ma niewiele praktycznych artykułów o operacjach Kubernetes, dlatego skill opiera się głównie na dokumentacji projektu.
