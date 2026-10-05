#!/usr/bin/env python3
"""
PreToolUse (Bash): twarda bramka dla poleceń powłoki — działa niezależnie od decyzji modelu,
również w subagentach. DENY = blokada, ASK = wymagana zgoda człowieka.
Uzupełnia (nie zastępuje) reguły permissions w settings.json.
"""
import json
import re
import sys

DENY = [
    (r"\brm\s+-[a-zA-Z]*(rf|fr)[a-zA-Z]*\s+(/|/\*|~/?|\$HOME/?|\.\.?/?|\*)(\s|$)", "rm -rf na katalogu głównym/domowym/bieżącym"),
    (r"--no-preserve-root", "rm --no-preserve-root"),
    (r"\bgit\s+push\b.*(\s--force(?!-with-lease)|\s-f\b|\s\+\S+)", "git push --force (użyj --force-with-lease po zgodzie człowieka)"),
    (r"\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|py|node)\b", "pobieranie i wykonywanie skryptu z sieci (curl | sh)"),
    (r"(^|[;&|]\s*)(printenv|env)\s*($|[;&|>])", "wypisywanie wszystkich zmiennych środowiskowych (mogą zawierać sekrety)"),
    (r"\b(cat|less|more|head|tail|bat|strings|xxd|base64|cp|scp|rsync|source|\.)\s+[^;&|]*"
     r"(\.env(?!\.(example|sample|template))\b|id_rsa|id_ed25519|\.pem\b|\.p12\b|\.aws/credentials|/secrets?/|"
     r"\.ssh/|\.git-credentials|\.kube/config|\.docker/config\.json|\.config/gh/hosts)",
     "odczyt pliku z sekretami"),
    # Wzorce z analiz ataków (Huntress: ClickFix, fałszywe instrukcje AI, React2Shell, axios) — core-agent-security
    (r"\bbase64\s+(-d|-D|--decode)\b[^;&]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|py|node|perl)\b",
     "dekodowanie base64 i wykonanie w powłoce (typowe dla ClickFix)"),
    (r"\b(sh|bash|zsh)\s+(-c\s+)?[\"']?\$\(\s*(curl|wget)\b|<\(\s*(curl|wget)\b",
     "pobieranie i wykonywanie skryptu z sieci (sh -c \"$(curl …)\")"),
    (r"\b(iwr|irm|invoke-webrequest|invoke-restmethod)\b[^;&]*\|\s*(iex|invoke-expression)\b|"
     r"\b(iex|invoke-expression)\s*\(?\s*\(?\s*(iwr|irm|new-object\s+net\.webclient)",
     "pobieranie i wykonywanie skryptu PowerShell z sieci (irm | iex)"),
    (r"\bmshta(\.exe)?\s+\S", "mshta (uruchamianie HTA — typowe dla ClickFix)"),
    (r"169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200",
     "dostęp do usługi metadanych chmury (poświadczenia instancji)"),
    (r"\bhistory\s+-c\b|\bunset\s+HISTFILE\b|HISTFILE=/dev/null", "kasowanie historii powłoki (zacieranie śladów)"),
    (r"\bchattr\s+(-R\s+)?\+[a-zA-Z]*i", "chattr +i (blokowanie plików przed usunięciem — technika trwałości)"),
    (r"\bterraform\s+(destroy|apply\b.*-auto-approve)", "terraform destroy / apply -auto-approve"),
    (r"\bmkfs(\.\w+)?\b|\bdd\s+[^;&|]*of=/dev/", "operacje na urządzeniach blokowych"),
    (r"\bchmod\s+(-R\s+)?0?777\b", "chmod 777"),
    (r":\(\)\s*\{\s*:\|:&\s*\};:", "fork bomb"),
]

ASK = [
    (r"\bsudo\b", "sudo"),
    (r"\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|push\b)", "git reset --hard / clean -f / push"),
    (r"\bterraform\s+(apply|import|state\s+(rm|mv))\b", "zmiana stanu infrastruktury"),
    (r"\b(kubectl\s+(delete|apply|scale|rollout)|helm\s+(install|upgrade|uninstall|rollback))\b", "zmiana w klastrze Kubernetes"),
    (r"\b(npm|pnpm|yarn)\s+publish\b|\bdocker\s+push\b", "publikacja paczki/obrazu"),
    (r"\b(DROP\s+(DATABASE|TABLE|SCHEMA)|TRUNCATE\s+TABLE?)\b", "destrukcyjne SQL"),
    (r"\b(curl|wget)\b.*(\s-d\s*@|--data(-binary)?\s*@|\s-T\s|--upload-file|-F\s+\S+=@|--post-file)", "wysyłanie pliku na zewnątrz"),
    (r"\bcrontab\b(?!\s+-l\b)|\bsystemctl\s+(--user\s+)?(enable|link)\b|\blaunchctl\s+(load|bootstrap)\b|"
     r"(LaunchAgents|LaunchDaemons|/etc/cron\.|/etc/systemd/|\.config/systemd/)",
     "trwałość: cron, usługa systemd lub LaunchAgent"),
    (r"\b(npm\s+(i|install|add)|pnpm\s+(add|i|install)|yarn\s+add|bun\s+add)\b(\s+-{1,2}[\w-]+(=\S+)?)*\s+[@\w][^\s;&|]*",
     "dodanie lub zmiana zależności (ops-supply-chain-security)"),
    (r"\b(kubectl|helm|terraform|aws|gcloud|az)\b.*\b(prod|production|prd)\b", "polecenie dotyczące PRODUKCJI"),
]


def decide(decision: str, reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": f"[guard_bash] {reason}",
        }
    }, ensure_ascii=False))
    sys.exit(0)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command", "")
    if not cmd:
        sys.exit(0)
    for pattern, reason in DENY:
        if re.search(pattern, cmd, re.IGNORECASE):
            decide("deny", f"Zablokowano: {reason}. Jeśli to konieczne, poproś człowieka o wykonanie ręczne.")
    for pattern, reason in ASK:
        if re.search(pattern, cmd, re.IGNORECASE):
            decide("ask", f"Wymaga zgody: {reason}.")
    sys.exit(0)  # brak decyzji → normalny przepływ uprawnień


if __name__ == "__main__":
    main()
