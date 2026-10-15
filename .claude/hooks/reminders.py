#!/usr/bin/env python3
"""
Hook UserPromptSubmit: przypomnienia z datą — od wskazanego dnia przypomina o odłożonej pracy.

Lista w `.claude/reminders.json`: `[{"id": "...", "from": "RRRR-MM-DD", "text": "..."}]`. Od dnia `from`
(czas lokalny) przy pierwszym prompcie w sesji dopisuje do kontekstu treść przypomnienia z prośbą, by model
przekazał ją człowiekowi. Każde przypomnienie zgłasza raz na sesję. Gotowe przypomnienie usuń z pliku.

Tylko biblioteka standardowa; błąd nigdy nie blokuje polecenia.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path


def due(reminders: list, today: date) -> list[dict]:
    out = []
    for r in reminders:
        try:
            if isinstance(r, dict) and r.get("text") and date.fromisoformat(str(r.get("from"))) <= today:
                out.append(r)
        except ValueError:
            continue
    return out


def main() -> int:
    try:
        data = json.load(sys.stdin)
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ".")
        src = root / ".claude" / "reminders.json"
        if not src.exists():
            return 0
        todo = due(json.loads(src.read_text(encoding="utf-8")), date.today())
        if not todo:
            return 0
        state_p = root / ".claude" / "logs" / "reminders.json"
        state = json.loads(state_p.read_text(encoding="utf-8")) if state_p.exists() else {}
        session = str(data.get("session_id") or "?")
        seen = set(state.get(session, []))
        fresh = [r for r in todo if str(r.get("id") or r["text"]) not in seen]
        if not fresh:
            return 0
        for r in fresh:
            print(f"PRZYPOMNIENIE (reminders, od {r['from']}): {r['text']}")
        print("Zanim zajmiesz się poleceniem, przekaż to przypomnienie użytkownikowi i zapytaj, czy wrócić do tej pracy.")
        state[session] = sorted(seen | {str(r.get("id") or r["text"]) for r in fresh})
        state = dict(list(state.items())[-200:])   # tylko ostatnie sesje
        state_p.parent.mkdir(parents=True, exist_ok=True)
        state_p.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
