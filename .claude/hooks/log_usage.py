#!/usr/bin/env python3
"""
SubagentStop / SessionEnd: zapisuje zużycie tokenów per agent i model oraz użyte skille do .claude/logs/usage.jsonl.
Raport: python3 factory/cost_report.py
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

TIER_RE = re.compile(r"Tier:\**\s*za\s+(niski|wysoki)", re.I)


def usage_from_transcript(path: Path) -> dict:
    """Sumuje usage z transkryptu. Ta sama odpowiedź (message.id) bywa zapisana w kilku liniach
    podczas streamingu — bierzemy OSTATNI (pełny) zapis dla każdego id."""
    per_msg: dict[str, tuple[str, dict]] = {}
    skills: list[str] = []
    last_text = ""
    if path.is_file():
        with path.open(encoding="utf-8", errors="ignore") as f:
            for line in f:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = entry.get("message") or {}
                for c in (msg.get("content") or []) if entry.get("type") == "assistant" else []:
                    if isinstance(c, dict) and c.get("type") == "text" and c.get("text"):
                        last_text = c["text"]
                    if not isinstance(c, dict) or c.get("type") != "tool_use":
                        continue
                    inp = c.get("input") or {}
                    if c.get("name") == "Skill" and inp.get("skill"):
                        skills.append(str(inp["skill"]).split(":")[-1])
                    elif c.get("name") == "Read":
                        m = re.search(r"\.claude/skills/([^/]+)/SKILL\.md$", str(inp.get("file_path", "")))
                        if m:
                            skills.append(m.group(1))
                usage = msg.get("usage")
                if entry.get("type") != "assistant" or not usage:
                    continue
                mid = msg.get("id") or entry.get("uuid")
                prev = per_msg.get(mid)
                if prev is None or (usage.get("output_tokens") or 0) >= (prev[1].get("output_tokens") or 0):
                    per_msg[mid] = (msg.get("model", "unknown"), usage)
    totals = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "requests": len(per_msg)}
    models: dict[str, int] = {}
    for model, u in per_msg.values():
        totals["input"] += u.get("input_tokens") or 0
        totals["output"] += u.get("output_tokens") or 0
        totals["cache_read"] += u.get("cache_read_input_tokens") or 0
        totals["cache_write"] += u.get("cache_creation_input_tokens") or 0
        models[model] = models.get(model, 0) + (u.get("output_tokens") or 0)
    m = TIER_RE.search(last_text[-2000:])     # samoocena wykonawcy z raportu: „Tier: za niski/za wysoki — powód”
    return {**totals, "models": models, "skills": list(dict.fromkeys(skills)),
            "tier_feedback": m.group(1).lower() if m else None}


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    event = data.get("hook_event_name", "")
    transcript = data.get("transcript_path") or ""

    if event == "SubagentStop":
        agent = data.get("agent_type") or "subagent"
        path = data.get("agent_transcript_path")
        if not path and transcript and data.get("agent_id"):
            path = str(Path(transcript).with_suffix("") / "subagents" / f"agent-{data['agent_id']}.jsonl")
    else:  # SessionEnd — główny wątek (persona uruchomiona przez --agent albo zwykła sesja)
        agent = data.get("agent_type") or "main"
        path = transcript
    if not path:
        sys.exit(0)

    usage = usage_from_transcript(Path(path).expanduser())
    if usage["requests"] == 0:
        sys.exit(0)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session": data.get("session_id"),
        "event": event,
        "agent": agent,
        "effort": (data.get("effort") or {}).get("level"),
        **usage,
    }
    log_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", data.get("cwd", "."))) / ".claude" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    with (log_dir / "usage.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
