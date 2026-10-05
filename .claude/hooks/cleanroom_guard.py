#!/usr/bin/env python3
"""
PreToolUse (Read|Grep|Glob|NotebookRead|Bash|WebFetch|WebSearch|Agent|Task): izolacja informacji dla wybranych agentów.

Profile z .claude/cleanroom.json:
- "denylist" (np. `*-qa-analyst`): projektant testów nie czyta implementacji — Read pliku z rozszerzeniem kodu spoza `allow`
  → deny; Grep tylko po dozwolonych ścieżkach/filtrach; Glob dozwolony (same nazwy plików). Skill qa-spec-first-testing.
- "allowlist" (np. `blind-analyst`): agent czyta WYŁĄCZNIE ścieżki z `allow` (np. brief biznesowy), żeby wymagania powstały
  bez wiedzy o architekturze. Skill ddd-model-stress-test.
- `block_tools`: narzędzia zablokowane dla profilu (np. Bash, który ominąłby reguły).
Agent spoza profili: bez zmian. Hook działa w subagentach (pole `agent_type`).
"""
import fnmatch
import json
import os
import re
import sys
from pathlib import Path

DEFAULT = {"profiles": [{"name": "qa", "agents": ["*-qa-analyst"], "mode": "denylist",
                         "allow": ["docs/**", "**/*.md"], "deny_extensions": [".ts", ".js", ".java"], "block_tools": ["Bash"]}]}


def load_config(project: Path) -> dict:
    try:
        cfg = json.loads((project / ".claude" / "cleanroom.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT
    if "profiles" not in cfg:   # stary format (jeden profil denylist)
        cfg = {"profiles": [{"name": "qa", "mode": "denylist", "block_tools": ["Bash"], **cfg}]}
    return cfg


def glob_to_re(pattern: str) -> re.Pattern:
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"; i += 3
        elif pattern.startswith("**", i):
            out += ".*"; i += 2
        elif pattern[i] == "*":
            out += "[^/]*"; i += 1
        elif pattern[i] == "?":
            out += "[^/]"; i += 1
        else:
            out += re.escape(pattern[i]); i += 1
    return re.compile(out + r"\Z")


def rel(path: str, project: Path) -> str:
    p = path.replace("\\", "/")
    root = str(project).replace("\\", "/").rstrip("/") + "/"
    if p.startswith(root):
        p = p[len(root):]
    while p.startswith("./"):
        p = p[2:]
    return p.rstrip("/")


def escapes(path: str) -> bool:
    return path.startswith("/") or path.startswith("~") or ".." in path.split("/")


def allowed(path: str, prof: dict) -> bool:
    return any(glob_to_re(g).match(path) for g in prof.get("allow", []))


def is_code(path: str, prof: dict) -> bool:
    name = path.rsplit("/", 1)[-1].lower()
    return any(name.endswith(ext) for ext in prof.get("deny_extensions", []))


def grep_allowed(path: str, glob: str, ftype: str, prof: dict) -> bool:
    if path and path not in (".", ""):
        if is_code(path, prof):
            return allowed(path, prof)                     # konkretny plik kodu
        if allowed(path, prof) or allowed(path + "/x", prof):
            return True                                    # dokument albo katalog dozwolony (docs/, test/, e2e/)
    if glob:
        sample = glob.replace("*", "x")
        return allowed(sample, prof) or allowed("x/" + sample, prof)
    return ftype in ("md", "markdown")


def deny(reason: str, hint: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": f"[cleanroom] {reason} {hint}",
    }}, ensure_ascii=False))
    sys.exit(0)


HINTS = {
    "denylist": "Projektuj przypadki ze specyfikacji (docs/project/03-requirements), kontraktów i istniejących testów; "
                "brak informacji = otwarte pytanie, nie czytanie kodu.",
    "allowlist": "Pracujesz na ślepo: czytaj wyłącznie pliki wskazane w zadaniu (brief biznesowy); braki zgłoś w wyniku.",
}


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    agent = data.get("agent_type") or ""
    if not agent:
        sys.exit(0)
    project = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd())
    prof = next((p for p in load_config(project).get("profiles", [])
                 if any(fnmatch.fnmatch(agent, a) for a in p.get("agents", []))), None)
    if not prof:
        sys.exit(0)
    mode = prof.get("mode", "denylist")
    hint = HINTS.get(mode, "")
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}

    if tool in prof.get("block_tools", []):
        deny(f"{agent} (profil {prof.get('name')}) nie używa narzędzia {tool}.", hint)
    if tool in ("Read", "NotebookRead"):
        raw = ti.get("file_path") or ti.get("notebook_path") or ""
        p = rel(raw, project)
        if not p:
            sys.exit(0)
        if mode == "allowlist":
            if escapes(p) or not allowed(p, prof):
                deny(f"{agent} może czytać tylko: {', '.join(prof.get('allow', []))} (próba: {p}).", hint)
        elif is_code(p, prof) and not allowed(p, prof):
            deny(f"{agent} nie czyta implementacji ({p}).", hint)
    elif tool == "Grep":
        if mode == "allowlist" or not grep_allowed(rel(ti.get("path") or "", project), ti.get("glob") or "",
                                                   ti.get("type") or "", prof):
            deny(f"{agent} może przeszukiwać tylko dokumentację, kontrakty i testy "
                 "(podaj path=docs/… albo glob=*.md / *.spec.ts).", hint)
    sys.exit(0)


if __name__ == "__main__":
    main()
