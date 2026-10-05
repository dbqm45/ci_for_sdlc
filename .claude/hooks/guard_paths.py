#!/usr/bin/env python3
"""
PreToolUse (Read|Edit|Write|NotebookEdit|Grep|Glob): chroni pliki z sekretami
i konfigurację zabezpieczeń przed zmianą przez samego agenta.
"""
import json
import re
import sys

SECRET_PATHS = re.compile(
    r"(^|/)(\.env(\.[\w-]+)?|id_rsa|id_ed25519|credentials(\.json)?|\.npmrc|\.pypirc|\.netrc|"
    r"[\w.-]+\.(pem|key|p12|pfx|jks|tfstate(\.backup)?)|secrets?(/|$)|"
    r"\.ssh/|\.aws/|\.kube/config|\.git-credentials|\.docker/config\.json|\.config/gh/hosts\.yml|\.config/gcloud/|\.azure/)",
    re.IGNORECASE,
)
SAFE_ENV = re.compile(r"\.env\.(example|sample|template|dist)$", re.IGNORECASE)

# Samomodyfikacja zabezpieczeń wymaga zgody człowieka
GUARDRAILS = re.compile(r"(^|/)\.claude/(settings(\.local)?\.json|hooks/|cleanroom\.json)|(^|/)\.git/")


def decide(decision: str, reason: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": f"[guard_paths] {reason}",
    }}, ensure_ascii=False))
    sys.exit(0)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}
    path = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
    pattern = ti.get("pattern") or ""  # Glob/Grep
    targets = [p for p in (path, pattern if tool == "Glob" else "") if p]

    for p in targets:
        norm = p.replace("\\", "/")
        if SECRET_PATHS.search(norm) and not SAFE_ENV.search(norm):
            decide("deny", f"Dostęp do pliku z sekretami ({p}) jest zablokowany. Używaj zmiennych środowiskowych i plików *.example.")
        if tool in ("Edit", "Write", "NotebookEdit") and GUARDRAILS.search(norm):
            decide("ask", f"Zmiana konfiguracji zabezpieczeń lub .git ({p}) wymaga zgody człowieka.")
    sys.exit(0)


if __name__ == "__main__":
    main()
