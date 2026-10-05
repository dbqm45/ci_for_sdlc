#!/usr/bin/env python3
"""
Hook UserPromptSubmit: ostrzega, gdy kontekst sesji robi się długi — jedna z przyczyn pomyłek i zmyśleń.

Rozmiar kontekstu bierze z ostatniej odpowiedzi modelu w transkrypcie (input + odczyt i zapis cache). Po
przekroczeniu progu dopisuje do kontekstu krótką instrukcję: zapisać punkt kontrolny i zaproponować człowiekowi
`/compact` z instrukcją albo nową sesję. Każdy próg zgłasza raz na sesję; gdy kontekst spadnie (np. po
kompaktowaniu), licznik się zeruje.

Progi w tysiącach tokenów: CLAUDE_CONTEXT_WARN_K (domyślnie 100) i 1,5 × próg (mocne ostrzeżenie).
Wyłączenie: CLAUDE_CONTEXT_WARN_K=0. Tylko biblioteka standardowa; błąd nigdy nie blokuje polecenia.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

TAIL_BYTES = 400_000   # ostatnia odpowiedź modelu jest na końcu transkryptu; nie czytamy całego pliku


def context_tokens(transcript: Path) -> int:
    if not transcript.is_file():
        return 0
    size = transcript.stat().st_size
    with transcript.open("rb") as f:
        f.seek(max(0, size - TAIL_BYTES))
        lines = f.read().decode("utf-8", errors="ignore").splitlines()
    for line in reversed(lines):
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        u = (e.get("message") or {}).get("usage") if e.get("type") == "assistant" else None
        if u:
            return int((u.get("input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0)
                       + (u.get("cache_creation_input_tokens") or 0))
    return 0


def message(level: int, k: int) -> str:
    if level == 2:
        return (f"UWAGA (context_guard): kontekst tej sesji ma ok. {k} tys. tokenów — dużo. Rośnie ryzyko pomyłek, "
                "zapominania wcześniejszych ustaleń i zmyśleń. Zanim zrobisz cokolwiek dalej: zapisz punkt kontrolny "
                "(core-project-record: kroki, następna czynność, ustalenia z rozmowy) i zaproponuj użytkownikowi nową "
                "sesję od punktu kontrolnego albo `/compact` z instrukcją, co zachować. Fakty podawaj tylko sprawdzone "
                "w tej chwili (core-grounding), nie z pamięci wcześniejszej części rozmowy.")
    return (f"context_guard: kontekst tej sesji ma ok. {k} tys. tokenów. Przy dłuższej pracy zapisz punkt kontrolny "
            "i rozważ z użytkownikiem `/compact` z instrukcją albo nową sesję; eksplorację wielu plików zlecaj "
            "subagentom. Ważne fakty sprawdzaj ponownie, zamiast polegać na wcześniejszej części rozmowy.")


def main() -> int:
    try:
        warn_k = int(os.environ.get("CLAUDE_CONTEXT_WARN_K", "100"))
    except ValueError:
        warn_k = 100
    if warn_k <= 0:
        return 0
    try:
        data = json.load(sys.stdin)
        tokens = context_tokens(Path(str(data.get("transcript_path") or "")).expanduser())
        if not tokens:
            return 0
        level = 2 if tokens >= warn_k * 1500 else 1 if tokens >= warn_k * 1000 else 0
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ".")
        state_p = root / ".claude" / "logs" / "context-guard.json"
        state = json.loads(state_p.read_text(encoding="utf-8")) if state_p.exists() else {}
        session = str(data.get("session_id") or "?")
        last = int(state.get(session, 0))
        if level > last:
            print(message(level, tokens // 1000))
        if level != last:
            state[session] = level
            state = dict(list(state.items())[-200:])   # tylko ostatnie sesje
            state_p.parent.mkdir(parents=True, exist_ok=True)
            state_p.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
