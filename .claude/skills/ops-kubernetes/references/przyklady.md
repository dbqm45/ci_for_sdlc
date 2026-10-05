# Przykłady Kubernetes

> **Spis treści:** 1. Produkcyjny Deployment z PDB · 2. NetworkPolicy i RBAC dla nowej usługi · 3. Wdrożenie „udane”, aplikacja pada — stary ConfigMap

Nazwy, liczby i rejestr są ilustracyjne. Wartości requests bierz z rzeczywistego zużycia (metryki z ostatnich tygodni),
nie z tych przykładów.

## 1. Produkcyjny Deployment z PDB
**Sytuacja:** „Napisz manifest dla `orders-api` na produkcję. Startuje ok. 40 s, zużywa zwykle 300m CPU i 380 MiB
pamięci, nie rozmawia z API Kubernetes.”

**Jak:**
1. requests z rzeczywistego zużycia, limit pamięci z zapasem, bez limitu CPU (unikasz throttlingu).
2. readiness i liveness na różnych endpointach; liveness bez zależności; `startupProbe` na wolny start.
3. 3 repliki, `RollingUpdate` z `maxUnavailable: 0`, osobny `PodDisruptionBudget`.
4. Obraz przypięty do digestu; `securityContext` zgodny z profilem `restricted`; `automountServiceAccountToken: false`.
5. `terminationGracePeriodSeconds` dłuższy niż najdłuższe żądanie (tu 30 s).

**Wynik:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: orders
  labels:
    pod-security.kubernetes.io/enforce: restricted
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  namespace: orders
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: orders-api
  template:
    metadata:
      labels:
        app: orders-api
    spec:
      serviceAccountName: orders-api
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 45
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: registry.acme.example/orders-api@sha256:<digest>
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 300m
              memory: 400Mi
            limits:
              memory: 512Mi
          startupProbe:
            httpGet:
              path: /health/live
              port: 8080
            periodSeconds: 5
            failureThreshold: 12
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            periodSeconds: 10
            failureThreshold: 3
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: orders-api
  namespace: orders
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: orders-api
```
`startupProbe` daje do 60 s (12 × 5 s) na start, zanim zacznie działać liveness. Walidacja: `kubeconform`, potem zmiana
przez GitOps — agent nie robi `kubectl apply` na klastrze współdzielonym.

## 2. NetworkPolicy i RBAC dla nowej usługi
**Sytuacja:** Usługa `orders-admin` ma przyjmować ruch tylko z kontrolera ingress, łączyć się z bazą `orders-db`
na 5432 i czytać jeden ConfigMap przez API Kubernetes (dlatego, inaczej niż w przykładzie 1, montuje token).

**Jak:**
1. Najpierw polityka domyślnie odmawiająca ruchu w obie strony w namespace (sprawdź, czy CNI egzekwuje NetworkPolicy).
2. Jawne zezwolenia: wejście z namespace ingress, wyjście do bazy i DNS — nic więcej, więc metadane chmury też odcięte.
3. Jedno konto usługi, Role w namespace z konkretnym zasobem i czasownikami, bez `*`.

**Wynik:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: orders
spec:
  podSelector: {}
  policyTypes: ["Ingress", "Egress"]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: orders-admin
  namespace: orders
spec:
  podSelector:
    matchLabels:
      app: orders-admin
  policyTypes: ["Ingress", "Egress"]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: orders-db
      ports:
        - port: 5432
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders-admin
  namespace: orders
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: orders-admin-config-reader
  namespace: orders
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["orders-feature-flags"]
    verbs: ["get", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: orders-admin-config-reader
  namespace: orders
subjects:
  - kind: ServiceAccount
    name: orders-admin
    namespace: orders
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: orders-admin-config-reader
```
Ruch do API Kubernetes wymaga osobnej reguły egress (adres serwera API zależy od klastra) — dodaj ją świadomie,
po sprawdzeniu adresu.

## 3. Wdrożenie „udane”, aplikacja pada — stary ConfigMap
**Sytuacja:** Po wdrożeniu `orders-api` w wersji 2.4 wszystkie pody są `Running`, ale pierwsze płatności kończą się
błędem 500. Log: `PAYMENTS_API_URL is not set`.

**Jak:**
1. Porównaj zmienne oczekiwane przez nową wersję z ConfigMap w repozytorium GitOps — nowej wartości tam nie ma.
2. Przyczyna: kod zmieniono w jednym PR, konfigurację miał dodać ktoś „później”; ConfigMap bez zmian nie wymusza rolloutu.
3. Naprawa: ConfigMap generowany przez Kustomize (nazwa z sufiksem skrótu) w tym samym PR co kod.
4. Zabezpieczenie: aplikacja waliduje konfigurację przy starcie i nie zgłasza gotowości, gdy wartości brakuje —
   następnym razem rolling update zatrzyma się na pierwszym podzie.

**Wynik:** `kustomization.yaml`
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: orders
resources:
  - deployment.yaml
configMapGenerator:
  - name: orders-api-config
    literals:
      - PAYMENTS_API_URL=https://payments.internal.acme.example
      - ORDERS_TIMEOUT_MS=3000
```
W Deployment: `envFrom: [{configMapRef: {name: orders-api-config}}]` — Kustomize podmieni nazwę na
`orders-api-config-<skrót>`, więc każda zmiana wartości zmienia szablon poda i wywołuje nowy rollout.
