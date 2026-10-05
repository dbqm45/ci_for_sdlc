#!/usr/bin/env python3
"""
Pilnuje bramki jakości skilli (factory/skill_gate.py).

PostToolUse (Edit|Write): po zmianie pliku skilla (`.claude/skills/<skill>/…`) albo jego scenariuszy
(`…/skill_evals/<skill>.json`) dopisuje do kontekstu przypomnienie o bramce — raz na skill w sesji.
Stop: jeśli w tej sesji zmieniono skill, a jego treść różni się od ostatniej zaliczonej bramki, pokazuje człowiekowi
listę (komunikat, nie blokada).

Wyłączenie: CLAUDE_SKILL_GATE=0. Tylko biblioteka standardowa; błąd nigdy nie blokuje pracy.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
from pathlib import Path

PATH_RE = re.compile(r"\.claude/skills/([a-z0-9][a-z0-9-]*)/|skill_evals/([a-z0-9][a-z0-9-]*)\.json$")


def root_of(data: dict) -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ".")


def state_path(root: Path) -> Path:
    return root / ".claude" / "logs" / "skill-changes.json"


def load_state(root: Path) -> dict:
    try:
        return json.loads(state_path(root).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(root: Path, state: dict) -> None:
    p = state_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(dict(list(state.items())[-50:]), ensure_ascii=False), encoding="utf-8")


def on_edit(data: dict) -> None:
    path = str((data.get("tool_input") or {}).get("file_path") or "").replace("\\", "/")
    m = PATH_RE.search(path)
    if not m:
        return
    skill = m.group(1) or m.group(2)
    root = root_of(data)
    if not (root / ".claude" / "skills" / skill / "SKILL.md").exists() and not path.endswith("SKILL.md"):
        return
    state = load_state(root)
    sess = str(data.get("session_id") or "?")
    seen = state.setdefault(sess, [])
    if skill in seen:
        return
    seen.append(skill)
    save_state(root, state)
    msg = (f"Zmieniono skill {skill}. Zanim uznasz pracę za skończoną, uruchom bramkę jakości: "
           f"`python3 factory/skill_gate.py {skill}` (bezpłatnie: struktura, scenariusze, podpowiedź, regresja innych "
           "skilli, polszczyzna). Nowy skill zaczynasz od scenariuszy ewaluacji (skill core-skill-authoring). Ewaluację "
           f"na modelu (`--model haiku,sonnet`) uruchamiasz dopiero po zgodzie człowieka — jest płatna.")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": msg}},
                     ensure_ascii=False))


def on_stop(data: dict) -> None:
    root = root_of(data)
    seen = load_state(root).get(str(data.get("session_id") or "?")) or []
    if not seen:
        return
    build_py = root / "factory" / "build.py"
    if not build_py.exists():
        return
    spec = importlib.util.spec_from_file_location("factory_build", build_py)
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    reg = build.gate_registry()
    stale = [s for s in seen if (root / ".claude" / "skills" / s / "SKILL.md").exists()
             and reg.get(s, {}).get("fingerprint") != build.skill_fingerprint(s)]
    if stale:
        print(json.dumps({"systemMessage": "⚠ Skille zmienione w tej sesji bez zaliczonej bramki jakości: "
                          + ", ".join(stale) + f". Uruchom: python3 factory/skill_gate.py {' '.join(stale)}"},
                         ensure_ascii=False))


def main() -> int:
    if os.environ.get("CLAUDE_SKILL_GATE") == "0":
        return 0
    try:
        data = json.load(sys.stdin)
        if data.get("hook_event_name") == "Stop":
            on_stop(data)
        else:
            on_edit(data)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
