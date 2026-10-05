---
name: ops-iac-terraform
description: Użyj przy infrastrukturze jako kod (Terraform/OpenTofu) — moduły, stan, zmienne, sieć, IAM, bazy, storage.
metadata:
  katalog: "Użyj przy infrastrukturze jako kod — Terraform/OpenTofu, moduły, stan, zmienne, zasoby chmurowe (sieć, IAM, bazy, storage). Nie do pipeline'ów (ops-ci-cd) ani kontenerów (ops-docker)."
---

# Infrastruktura jako kod (Terraform)

## Złota zasada
**Nigdy nie uruchamiasz `terraform apply` ani `destroy` samodzielnie.** Przygotowujesz zmianę, uruchamiasz
`terraform fmt`, `terraform validate` i `terraform plan`, a plan przedstawiasz człowiekowi do akceptacji.

## Struktura
```
infra/
  modules/<nazwa>/     # main.tf, variables.tf, outputs.tf, README.md
  envs/staging/        # wywołania modułów + backend
  envs/production/
```
- Środowiska różnią się zmiennymi, nie kodem.
- Moduły mają opisane zmienne (`description`, `type`, walidacje) i outputy.

## Stan
- Zdalny backend z blokadą. Na S3 blokada natywna `use_lockfile = true` (Terraform ≥ 1.11, w 1.10 eksperymentalnie;
  OpenTofu ≥ 1.10) — blokada przez DynamoDB jest przestarzała; GCS i Terraform Cloud blokują same. Stan szyfrowany, osobny per środowisko. Nigdy stan w repo.
- Stan zawiera sekrety — dostęp do niego jak do sekretów.

## Bezpieczeństwo
- IAM: najmniejsze uprawnienia, bez `*` w akcjach i zasobach produkcyjnych.
- Storage prywatny domyślnie, szyfrowanie włączone, publiczny dostęp jawnie zablokowany.
- Bazy i usługi wewnętrzne bez publicznego IP; security groups bez `0.0.0.0/0` poza load balancerem 80/443.
- Sekrety z menedżera sekretów (data source), nie w `.tfvars` w repo.
- Porty zarządzania (SSH 22, RDP 3389, panele admina) nigdy z `0.0.0.0/0` — dostęp przez bastion, SSM lub VPN.

## Środowiska testowe i tymczasowe
Huntress opisał własny incydent: błąd w automatyzacji zostawił działające 37 testowych maszyn z otwartym RDP i SSH
oraz słabym hasłem; jedną z nich przejęto przez odgadnięcie hasła i użyto do skanowania innych adresów.
Szkody ograniczyła segmentacja.
- Test/QA w osobnym koncie lub projekcie chmury, z osobnymi sekretami i danymi syntetycznymi lub zamaskowanymi.
- Poświadczenia generowane na każde uruchomienie (klucze SSH per przebieg), żadnych wspólnych haseł w obrazach.
- Każdy zasób tymczasowy ma tagi `owner` i `expires`; automatyczne usuwanie po czasie życia i cykliczne szukanie
  „sierot”. Alarm na nietypowy ruch wychodzący z maszyn testowych.
- Źródło: [Investigating Unauthorized Access: Huntress QA Environment Incident](https://www.huntress.com/blog/investigating-unauthorized-access-huntress-qa-environment-incident)

## Bramki w PR
Kolejność od najtańszej: `terraform fmt -check` → `terraform validate` → Checkov lub tfsec (Trivy config) → polityki
organizacji w OPA/Conftest (tagi, dozwolone rozmiary, zakazane konstrukcje) → skan sekretów (TruffleHog, Gitleaks) →
plan i różnica kosztu (Infracost, ops-finops). Nowe skanery włączasz najpierw w trybie ostrzegawczym, potem blokującym.
Infrastruktura wygenerowana przez AI jest oznaczona w PR i przechodzi te same bramki plus przegląd człowieka.

## Dryf
- Zaplanowany job (np. codziennie) uruchamia `terraform plan -detailed-exitcode` (kod 2 = różnica) dla każdego
  środowiska i zgłasza dryf jako zadanie lub incydent.
- Kto zmienił: korelacja z logiem audytowym chmury (CloudTrail, Activity Log); alarm na ręczne zmiany IAM i reguł
  sieciowych (np. otwarty port 22 dodany w konsoli).
- Dryf naprawiasz przez PR (kod dogania rzeczywistość albo odwrotnie), nigdy przez ręczne `apply` poza pipeline'em.

## Ochrona przed katastrofą
- `lifecycle { prevent_destroy = true }` dla baz, bucketów z danymi, kluczy KMS.
- W planie szukaj `must be replaced` / `destroy` — każde takie wystąpienie wyraźnie opisz w raporcie.
- Wersje providerów przypięte (`required_providers` + `.terraform.lock.hcl` w repo).

## Weryfikacja
`terraform fmt -check`, `terraform validate`, `terraform plan -out=tfplan`; opcjonalnie `tflint`, `checkov`/`tfsec`.

Źródła (devops.com): [Common IaC Security Issues and How to Fix Them](https://devops.com/common-iac-security-issues-and-how-to-fix-them/),
[AI Can Generate Your Infrastructure. Can Your CI/CD Pipeline Trust It?](https://devops.com/ai-can-generate-your-infrastructure-can-your-ci-cd-pipeline-trust-it/),
[AI-Driven Drift Detection in AWS](https://devops.com/ai-driven-drift-detection-in-aws-terraform-meets-intelligence/);
blokada S3: [What's new in OpenTofu 1.10](https://opentofu.org/docs/v1.10/intro/whats-new/),
[Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3); dryf:
[terraform plan](https://developer.hashicorp.com/terraform/cli/commands/plan) (`-detailed-exitcode`).
