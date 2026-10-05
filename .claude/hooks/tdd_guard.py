#!/usr/bin/env python3
"""
Bramka TDD: kod produkcyjny dopiero po czerwonym teście. Tylko biblioteka standardowa; błąd hooka nigdy nie blokuje.

Śledzi osobno każdy kontekst (sesja główna i każdy subagent) w `.claude/logs/tdd-state.json`:
  - PostToolUse Edit|Write   — edycja pliku testów;
  - PostToolUse / PostToolUseFailure Bash — uruchomienie testów i jego wynik (czerwony / zielony);
  - PreToolUse Edit|Write    — edycja pliku produkcyjnego: sprawdza regułę.

Reguły:
  A. Pierwsza edycja kodu produkcyjnego w danym kontekście wymaga: edycji testu, a PO NIEJ uruchomienia testów, które
     NIE przeszły (czerwony test — dowód, że test sprawdza brakujące zachowanie). Test, który od razu przeszedł,
     niczego nie dowodzi — wyjątek: test charakteryzujący przed refaktoryzacją, oznaczony w pliku testu słowem
     „charakteryz…”/„characteriz…” (qa-spec-first-testing).
  B. Później: po CLAUDE_TDD_MAX_EDITS (domyślnie 12) edycjach kodu produkcyjnego bez nowej edycji testu — następne
     zachowanie wymaga następnego testu.
  C. Osłabienie testu: edycja pliku testów, która zmniejsza liczbę asercji lub testów albo dopisuje pominięcie
     (skip, xfail, @Disabled, xit…). Tryb CLAUDE_TDD_WEAKEN: warn (domyślnie: ostrzeżenie dla człowieka i kontekst dla modelu, bez blokady),
     ask (decyduje człowiek), deny (blokada), off. Przenoszenie asercji przy refaktoryzacji testów też wywoła regułę —
     dlatego domyślnie tylko ostrzega.

Tryb (zmienna środowiskowa CLAUDE_TDD): strict (domyślnie: blokada z wyjaśnieniem dla agenta), ask (decyduje człowiek),
off (wyłączone — np. spike, prototyp). Pliki nieobjęte: testy, konfiguracja, style i szablony, dokumentacja, `.claude/`,
`factory/`, wygenerowane katalogi; dodatkowe wzorce w CLAUDE_TDD_EXEMPT (oddzielone przecinkami, np. "src/migrations/*").
"""
from __future__ import annotations

import fnmatch
import json
import os
import re
import sys
import time
from pathlib import Path

SOURCE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".java", ".kt", ".go", ".rs", ".cs", ".rb", ".php",
              ".swift", ".scala"}
TEST_RE = re.compile(
    r"(\.(test|spec)\.[cm]?[jt]sx?$)|(/__tests__/)|(/(tests?|e2e|spec)/)|((^|/)test_[^/]+\.py$)|(_test\.(py|go)$)"
    r"|(/src/test/)|((Test|Tests|IT|Spec)\.(java|kt|cs|scala)$)|(_spec\.rb$)|(\.feature$)|(Test\.php$)", re.I)
EXEMPT_RE = re.compile(
    r"(^|/)(\.claude|factory|docs|node_modules|dist|build|out|coverage|target|vendor|\.git|generated|__generated__)/"
    r"|\.d\.ts$|(^|/)[^/]*\.config\.[cm]?[jt]s$|(^|/)(setup|conftest|manage)\.py$|(^|/)__init__\.py$", re.I)
TEST_CMD_RE = re.compile(
    r"\b((npm|pnpm|yarn|bun)( run)? (test|test:\S+)|npx (vitest|jest|playwright test|mocha)|vitest|jest|mocha"
    r"|pytest|python3? -m (pytest|unittest)|mvnw? (\S+ )*(test|verify)|gradlew? (\S+ )*test|go test|cargo test"
    r"|dotnet test|nx (test|run-many|affected)\b[^\n]*test|ng test|deno test|rspec|phpunit|tox)\b")
FAIL_RE = re.compile(r"\b(FAIL(ED)?|failing|failures?: [1-9]|[1-9]\d* (failed|failing)|AssertionError|"
                     r"Tests?:\s+[1-9]\d* failed|BUILD FAILURE)\b|[✗×] ", re.I)
MARK_RE = re.compile(r"charakteryz|characteriz", re.I)
ASSERT_RE = re.compile(r"\bassert\w*\b|\bexpect\s*\(|\bshould\b|\bverify\s*\(|\bpytest\.raises\b|\bassertThat\b")
TESTDEF_RE = re.compile(r"^\s*(async\s+)?def\s+test\w*|\b(it|test)\s*\(|@(Test|ParameterizedTest)\b|^\s*func\s+Test\w+",
                        re.M)
SKIP_RE = re.compile(r"\.(skip|todo)\s*\(|\b(xit|xdescribe|xtest)\s*\(|@pytest\.mark\.(skip|xfail)|pytest\.(skip|xfail)\s*\("
                     r"|@(Disabled|Ignore)\b|\bt\.Skip\s*\(|@unittest\.skip", re.M)


def root_of(data: dict) -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ".")


def rel(path: str, root: Path) -> str:
    p = path.replace("\\", "/")
    r = str(root).replace("\\", "/").rstrip("/") + "/"
    return p[len(r):] if p.startswith(r) else p


def is_test(path: str) -> bool:
    return bool(TEST_RE.search("/" + path))


def is_production(path: str) -> bool:
    if Path(path).suffix.lower() not in SOURCE_EXT or is_test(path) or EXEMPT_RE.search("/" + path):
        return False
    extra = [g.strip() for g in os.environ.get("CLAUDE_TDD_EXEMPT", "").split(",") if g.strip()]
    return not any(fnmatch.fnmatch(path, g) for g in extra)


def load(root: Path) -> dict:
    try:
        return json.loads((root / ".claude" / "logs" / "tdd-state.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save(root: Path, state: dict) -> None:
    p = root / ".claude" / "logs" / "tdd-state.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(dict(list(state.items())[-100:]), ensure_ascii=False), encoding="utf-8")


def ctx_key(data: dict) -> str:
    return f"{data.get('session_id') or '?'}:{data.get('agent_id') or 'main'}"


def bash_failed(data: dict) -> bool:
    if data.get("hook_event_name") == "PostToolUseFailure":
        return True
    resp = data.get("tool_response")
    if isinstance(resp, dict):
        code = resp.get("exit_code", resp.get("exitCode", resp.get("returncode")))
        if isinstance(code, int) and code != 0:
            return True
        text = f"{resp.get('stdout', '')}\n{resp.get('stderr', '')}\n{resp.get('output', '')}"
    else:
        text = str(resp or "")
    return bool(FAIL_RE.search(text[-20000:]))


def deny(reason: str) -> None:
    mode = os.environ.get("CLAUDE_TDD", "strict").lower()
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "ask" if mode == "ask" else "deny",
                                             "permissionDecisionReason": reason}}, ensure_ascii=False))


def weakening(tool: str, inp: dict, root: Path, path: str) -> list[str]:
    """Co osłabia test w tej edycji: mniej asercji, mniej testów, nowe pominięcie."""
    pairs: list[tuple[str, str]] = []
    if tool == "Edit":
        pairs = [(str(inp.get("old_string") or ""), str(inp.get("new_string") or ""))]
    elif tool == "MultiEdit":
        pairs = [(str(e.get("old_string") or ""), str(e.get("new_string") or "")) for e in inp.get("edits") or []]
    elif tool == "Write":
        try:
            pairs = [((root / path).read_text(encoding="utf-8", errors="ignore"), str(inp.get("content") or ""))]
        except OSError:
            return []
    old = "\n".join(a for a, _ in pairs)
    new = "\n".join(b for _, b in pairs)
    found = []
    if len(ASSERT_RE.findall(new)) < len(ASSERT_RE.findall(old)):
        found.append(f"mniej asercji ({len(ASSERT_RE.findall(old))} → {len(ASSERT_RE.findall(new))})")
    if len(TESTDEF_RE.findall(new)) < len(TESTDEF_RE.findall(old)):
        found.append("usunięty test")
    if len(SKIP_RE.findall(new)) > len(SKIP_RE.findall(old)):
        found.append("dopisane pominięcie testu (skip/xfail/disabled)")
    return found


def weaken_check(tool: str, inp: dict, root: Path, path: str) -> None:
    mode = os.environ.get("CLAUDE_TDD_WEAKEN", "warn").lower()
    if mode == "off":
        return
    found = weakening(tool, inp, root, path)
    if not found:
        return
    reason = (f"TDD: ta edycja może osłabić test {path}: {', '.join(found)}. Testów nie osłabiasz, żeby przeszły — "
              "popraw kod albo uzasadnij zmianę testu (zmienione wymaganie, refaktoryzacja testu bez utraty sprawdzeń).")
    if mode in ("ask", "deny"):
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": mode,
                                                 "permissionDecisionReason": reason}}, ensure_ascii=False))
    else:   # warn: ostrzeżenie dla człowieka i kontekst dla modelu, bez decyzji o uprawnieniach
        print(json.dumps({"systemMessage": reason,
                          "hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": reason}},
                         ensure_ascii=False))


def main() -> int:
    if os.environ.get("CLAUDE_TDD", "strict").lower() == "off":
        return 0
    try:
        data = json.load(sys.stdin)
        root = root_of(data)
        event = data.get("hook_event_name")
        tool = data.get("tool_name") or ""
        inp = data.get("tool_input") or {}
        state = load(root)
        key = ctx_key(data)
        s = state.setdefault(key, {"seq": 0, "test_edit": -1, "red": -1, "green": -1, "prod_since_test": 0,
                                   "started": False, "marked": False, "green_warned": False})
        s["seq"] += 1
        path = rel(str(inp.get("file_path") or inp.get("notebook_path") or ""), root)

        if event in ("PostToolUse", "PostToolUseFailure") and tool == "Bash":
            if TEST_CMD_RE.search(str(inp.get("command") or "")):
                if bash_failed(data):
                    s["red"] = s["seq"]
                else:
                    s["green"] = s["seq"]
        elif event == "PostToolUse" and tool in ("Edit", "Write", "MultiEdit") and path:
            if is_test(path):
                s["test_edit"], s["prod_since_test"] = s["seq"], 0
                try:
                    s["marked"] = s["marked"] or bool(MARK_RE.search((root / path).read_text(encoding="utf-8",
                                                                                                errors="ignore")))
                except OSError:
                    pass
            elif is_production(path):
                s["prod_since_test"] += 1
        elif event == "PreToolUse" and tool in ("Edit", "Write", "MultiEdit") and path and is_test(path):
            weaken_check(tool, inp, root, path)
            return 0
        elif event == "PreToolUse" and tool in ("Edit", "Write", "MultiEdit") and path and is_production(path):
            if not s["started"]:
                red_after_test = s["test_edit"] >= 0 and s["red"] > s["test_edit"]
                green_after_test = s["test_edit"] >= 0 and s["green"] > s["test_edit"] and s["red"] < s["test_edit"]
                if red_after_test or (green_after_test and s["marked"]):
                    s["started"] = True
                elif green_after_test and not s["green_warned"]:
                    s["green_warned"] = True
                    deny("TDD: nowy test od razu PRZESZEDŁ, więc niczego nie dowodzi. Popraw test tak, żeby sprawdzał "
                         "brakujące zachowanie i nie przechodził (czerwony z właściwego powodu), uruchom go i dopiero "
                         "wtedy pisz kod. Jeśli to test charakteryzujący przed refaktoryzacją, oznacz go w pliku testu "
                         "jako [charakteryzujący] (qa-spec-first-testing).")
                    save(root, state)
                    return 0
                else:
                    deny(f"TDD: zanim zmienisz kod produkcyjny ({path}), napisz test opisujący oczekiwane zachowanie "
                         "(przy błędzie: test odtwarzający błąd), uruchom testy i pokaż, że ten test NIE przechodzi "
                         "z właściwego powodu. Potem minimalny kod → zielony → refaktoryzacja (eng-testing). Wyjątki: "
                         "konfiguracja, style, dokumentacja; spike — człowiek ustawia CLAUDE_TDD=off.")
                    save(root, state)
                    return 0
            else:
                limit = int(os.environ.get("CLAUDE_TDD_MAX_EDITS", "12") or 12)
                if s["prod_since_test"] >= limit:
                    deny(f"TDD: {s['prod_since_test']} zmian kodu produkcyjnego bez nowego testu. Następne zachowanie = "
                         "następny test: dopisz test (czerwony), potem kod. Jeśli to tylko refaktoryzacja przy zielonych "
                         "testach, uruchom testy i dopisz/zaktualizuj test, który ją zabezpiecza.")
                    save(root, state)
                    return 0
        s["ts"] = int(time.time())
        save(root, state)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
