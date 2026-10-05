#!/usr/bin/env python3
"""
Hook UserPromptSubmit: podpowiada modelowi 1–3 skille fabryki pasujące do polecenia użytkownika.

Po co: Claude Code trzyma opisy skilli w ~1% okna kontekstu. Przy oknie 200 tys. tokenów (np. Haiku) opisy skilli
fabryki wypadają z listy i model widzi same nazwy, a i przy pełnych opisach model często odpowiada z wiedzy ogólnej,
nie wczytując skilla (pomiar: tests/run_skill_evals.py). Hook dopasowuje polecenie do opisów skilli (description
i metadata.katalog) prostym dopasowaniem rdzeni słów z wagą rzadkości i dopisuje do kontekstu krótką podpowiedź.

  python3 .claude/hooks/skill_hint.py --explain "Jak zrobić paginację GET /orders?"   # ranking z punktacją

Wyłączenie: zmienna CLAUDE_SKILL_HINT=0. Tylko biblioteka standardowa; błąd nigdy nie blokuje polecenia.

Log: każda decyzja trafia do .claude/logs/skill-hints.jsonl (czas, sesja, podpowiedziane skille, 5 najwyżej
ocenionych z wynikiem). Treści polecenia NIE zapisujemy — chyba że CLAUDE_SKILL_HINT_LOG_PROMPT=1 (pierwsze 200
znaków, do strojenia słów kluczowych na własnej maszynie). Raport: python3 factory/hint_report.py
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
import os
import re
import sys
from pathlib import Path

SKILLS = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[2]) / ".claude" / "skills"
STEM = 5                  # długość rdzenia: polska odmiana zmienia głównie końcówki
MIN_SCORE = 8.0           # próg trafności (dobrany na scenariuszach w tests/skill_evals)
MAX_HINTS = 3
CLEAR_SCORE = 16.0          # wyraźny lider: wynik co najmniej taki …
CLEAR_LEAD = 1.3            # … i o 30% lepszy od drugiego skilla → mocniejsza podpowiedź (kalibracja: 176 trafnych, 2 błędne na 283 scenariuszach)
STRONG_SCORE = 12.0       # powyżej tego wyniku lider nie musi odstawać od drugiego
MARGIN = 1.15             # inaczej lider musi być o 15% lepszy od drugiego skilla
RATIO = 0.6               # podpowiadamy tylko skille blisko najlepszego wyniku
BODY_NORM = 0.5           # normalizacja wyniku treści względem jej długości (pomiar na tests/skill_evals)
HEAD_WEIGHT = 2.0         # słowo z opisu skilla waży więcej niż słowo z treści SKILL.md
STOP = set("""
aby albo ale bez być będzie bo by czy dla do gdy go i ich ile im jak jaki jakie jako je jest jeśli już kiedy który
która które ma mam mamy może można mnie na nad nam nas nie niż o od oraz po pod przez przy się są ta tak także te
też to tu tym w we więc z za ze że żeby co ten tej tego temu tych tę ja ty my wy on ona ono oni one mój nasz wasz
odpowiedz zwięźle krótko proszę chcę chcemy potrzebuję jak zrobić czy warto użyj nie do the and for with how what
""".split())
NEG_RE = re.compile(r"\bNie do\b.*$", re.S)


# Nazwy narzędzi, które po polsku są słowami pomijanymi („Jest” = narzędzie, „jest” = czasownik). Wielka litera
# w środku zdania albo nazwa z wersją/kropką oznacza narzędzie.
TOOL_ALIASES = [(re.compile(r"(?<=[^.!?\s] )Jest\b|\bJest(?=\s*\d)|\bjest(?=\.config|\.mock|\.fn|\.use)"), "jestjs")]


def stems(text: str) -> list[str]:
    for rx, alias in TOOL_ALIASES:
        text = rx.sub(alias, text)
    words = re.findall(r"[a-ząćęłńóśźż0-9][a-ząćęłńóśźż0-9+#.\-]*", text.lower())
    out = []
    for w in words:
        w = w.strip(".-")
        if len(w) < 3 or w in STOP:
            continue
        out.append(w[:STEM])
    return out


def load_index() -> list[dict]:
    items = []
    for p in sorted(SKILLS.glob("*/SKILL.md")):
        text = p.read_text(encoding="utf-8", errors="ignore")
        m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
        fm = m.group(1) if m else ""
        if re.search(r"^disable-model-invocation:\s*true", fm, re.M):
            continue                       # skill uruchamiany tylko ręcznie
        desc = (re.search(r"^description:\s*(.*)$", fm, re.M) or [None, ""])[1]
        kat = (re.search(r"^\s+katalog:\s*(.*)$", fm, re.M) or [None, ""])[1].strip().strip('"')
        kat = NEG_RE.sub("", kat)          # granice „Nie do …” opisują sąsiadów, nie ten skill
        slowa = (re.search(r"^\s+slowa:\s*(.*)$", fm, re.M) or [None, ""])[1].strip().strip('"')
        name = p.parent.name
        name_words = name.split("-", 1)[-1].replace("-", " ")
        body = text[m.end() if m else 0:]
        body = re.sub(r"```.*?```", " ", body, flags=re.S)          # bez przykładów kodu
        body = re.sub(r"^## Źródła.*$", " ", body, flags=re.S | re.M)  # bez listy źródeł
        head = stems(f"{desc} {kat} {name_words} {slowa}")
        excerpt = re.sub(r"<!--.*?-->|\s+", " ", body, flags=re.S).strip()[:700]
        items.append({"name": name, "desc": desc.strip(), "kat": kat.strip(), "excerpt": excerpt,
                      "head": set(head), "body": set(stems(body)) - set(head)})
    return items


QUOTED_RE = re.compile(r"„[^”]{20,}”|\"[^\"]{20,}\"|```.*?```", re.S)


def intent(prompt: str) -> str:
    """Treść polecenia bez cytowanego materiału (tekst do redakcji, fragment kodu) — o wyborze skilla decyduje prośba."""
    rest = QUOTED_RE.sub(" ", prompt)
    return rest if len(stems(rest)) >= 2 else prompt


def rank(prompt: str, items: list[dict]) -> list[tuple[float, dict]]:
    n = len(items) or 1
    df: dict[str, int] = {}
    for it in items:
        for t in it["head"] | it["body"]:
            df[t] = df.get(t, 0) + 1
    avg = sum(len(it["body"]) for it in items) / n
    q = set(stems(intent(prompt)))
    scored = []
    for it in items:
        idf = lambda t: math.log(1 + n / df[t])
        norm = (avg / max(1, len(it["body"]))) ** BODY_NORM   # długi skill nie wygrywa samą liczbą słów ogólnych
        score = HEAD_WEIGHT * sum(idf(t) for t in q & it["head"]) + norm * sum(idf(t) for t in q & it["body"])
        scored.append((round(score, 2), it))
    scored.sort(key=lambda x: -x[0])
    return scored


def select(prompt: str, items: list[dict]) -> list[tuple[float, dict]]:
    """Skille do podpowiedzi: wynik ponad progiem i wyraźny lider (płaski ranking to zwykle szum słów ogólnych)."""
    ranked = rank(prompt, items)
    if not ranked or ranked[0][0] < MIN_SCORE:
        return []
    best = ranked[0][0]
    second = ranked[1][0] if len(ranked) > 1 else 0.0
    if best < STRONG_SCORE and second and best < second * MARGIN:
        return []
    return [(s, it) for s, it in ranked[:MAX_HINTS] if s >= max(MIN_SCORE, best * RATIO)]


def log_decision(data: dict, prompt: str, items: list[dict], picks: list) -> None:
    """Zapis decyzji do .claude/logs/skill-hints.jsonl (bez treści polecenia, o ile nie włączono jawnie)."""
    try:
        top = [(it["name"], s) for s, it in rank(prompt, items)[:5]] if items else []
        rec = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), "session": data.get("session_id"),
               "prompt_chars": len(prompt), "hinted": [it["name"] for _, it in picks], "top": top, "via": LAST_VIA}
        if os.environ.get("CLAUDE_SKILL_HINT_LOG_PROMPT") == "1":
            rec["prompt"] = prompt[:200]
        log_dir = SKILLS.parent / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        with (log_dir / "skill-hints.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except OSError:
        pass


# ───────────── opcjonalny Jev: dwuetapowa podpowiedź (cookbook TypeSafe „skill suggestion”) ─────────────
JEV_GATE = 0.30          # średnia trzech pytań bramki — poniżej nie podpowiadamy nic
JEV_FITS = 0.30          # „czy zwycięzca robi dokładnie to, o co proszono” — poniżej nie podpowiadamy nic
JEV_SHORTLIST = 3
LAST_VIA = "slowa"
GATE_QS = {
    "specialist": {"type": "noul", "instructions": "Would a good answer to `request` follow a documented specialist "
                   "procedure or checklist, rather than general knowledge?"},
    "project_work": {"type": "noul", "instructions": "Does `request` ask for work on software, product, process, "
                     "infrastructure or a written document, rather than small talk or trivia?"},
    "prose_enough": {"type": "noul", "instructions": "Can `request` be fully answered with a short general reply "
                     "that needs no specialist procedure?"},
}


def jev_suggest(prompt: str, items: list[dict]) -> list | None:
    """Etap 1: wybór spośród wszystkich skilli (opisy, które widzi model) + 3 pytania bramki.
    Etap 2: wybór spośród 3 najlepszych (pełny opis i początek SKILL.md) + „czy pasuje” dla każdego.
    Zwraca [(wynik, skill)] (może być pusta) albo None, gdy Jev niedostępny — wtedy zostają słowa."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import jev_client as jev
        if not jev.enabled() or len(items) > 255:
            return None
        request = intent(prompt)[:4000]
        qs = {"skill": {"type": "choice", "instructions": "Which skill best matches what `request` asks for?",
                        "criteria": {it["name"]: it["desc"] for it in items}}, **GATE_QS}
        a = jev.decide({"request": request}, qs, timeout=4)
        if not a:
            return None
        gate = (jev.p_yes(a["specialist"]) + jev.p_yes(a["project_work"]) + 1 - jev.p_yes(a["prose_enough"])) / 3
        if gate < JEV_GATE:
            return []
        probs = a["skill"].get("probabilities") or {}
        short = [n for n, _ in sorted(probs.items(), key=lambda kv: -kv[1])][:JEV_SHORTLIST] or [a["skill"].get("choice")]
        by = {it["name"]: it for it in items}
        short = [n for n in short if n in by]
        if not short:
            return []
        cands = {n: {"description": by[n]["kat"] or by[n]["desc"], "excerpt": by[n]["excerpt"]} for n in short}
        q2 = {"best": {"type": "choice", "instructions": "Which candidate skill best covers what `request` asks for?",
                       "criteria": {n: by[n]["kat"] or by[n]["desc"] for n in short}}}
        q2 |= {f"fits_{i}": {"type": "noul", "instructions": f"Does the skill `candidates.{n}` cover the specific thing "
                             "asked in `request`?"} for i, n in enumerate(short)}
        b = jev.decide({"request": request, "candidates": cands}, q2, timeout=4)
        if not b:
            return None
        win = b["best"].get("choice")
        if win not in short or jev.p_yes(b[f"fits_{short.index(win)}"]) < JEV_FITS:
            return []
        return [(round(jev.p_yes(b[f"fits_{short.index(win)}"]) * 20, 2), by[win])]
    except Exception:
        return None


def suggest(prompt: str, items: list[dict]) -> list:
    """Słowa (domyślnie) albo Jev (CLAUDE_SKILL_HINT_JEV=1) z rezerwą w słowach, gdy Jev niedostępny."""
    global LAST_VIA
    LAST_VIA = "slowa"
    if os.environ.get("CLAUDE_SKILL_HINT_JEV") == "1":
        picks = jev_suggest(prompt, items)
        if picks is not None:
            LAST_VIA = "jev"
            return picks
        LAST_VIA = "slowa (Jev niedostępny)"
    return select(prompt, items)


def hint(prompt: str, data: dict | None = None) -> str:
    items = load_index()
    if not items or len(prompt.strip()) < 12 or prompt.lstrip().startswith("/"):
        return ""
    picks = suggest(prompt, items)
    if data is not None:
        log_decision(data, prompt, items, picks)
    if not picks:
        return ""
    top, rest = picks[0][0], [s for s, _ in picks[1:]]
    if top >= CLEAR_SCORE and (not rest or top >= CLEAR_LEAD * rest[0]):
        # wyraźny lider (ewaluacje 2026-10-02: przy łagodnej podpowiedzi model bywał pewny swojej wiedzy i pomijał skill)
        lines = [f"Polecenie wyraźnie pasuje do skilla fabryki {picks[0][1]['name']} (podpowiedź hooka skill_hint). "
                 "Wczytaj go narzędziem Skill, zanim odpowiesz — zawiera reguły i procedury tego projektu, których "
                 "nie ma w wiedzy ogólnej."]
    else:
        lines = ["Skille fabryki prawdopodobnie pasujące do tego polecenia (podpowiedź hooka skill_hint):"]
    lines += [f"- {it['name']} — {it['desc']}" for _, it in picks]
    lines.append("Jeśli zadanie mieści się w zakresie któregoś z nich, wczytaj go narzędziem Skill przed odpowiedzią "
                 "i stosuj jego reguły zamiast wiedzy ogólnej. Jeśli nie pasuje, zignoruj tę podpowiedź.")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if "--explain" in argv:
        prompt = " ".join(a for a in argv[1:] if a != "--explain")
        for s, it in rank(prompt, load_index())[:8]:
            try:
                print(f"{s:6.2f}  {it['name']}")
            except BrokenPipeError:
                return 0
        print("---\n" + (hint(prompt) or "(brak podpowiedzi — poniżej progu)"))
        return 0
    if os.environ.get("CLAUDE_SKILL_HINT") == "0":
        return 0
    try:
        data = json.load(sys.stdin)
        text = hint(str(data.get("prompt") or ""), data)
        if text:
            print(text)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
