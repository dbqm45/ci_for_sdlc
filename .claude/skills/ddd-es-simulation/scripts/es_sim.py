#!/usr/bin/env python3
"""
Stan symulowanego warsztatu Event Storming (skill ddd-es-simulation). Tylko biblioteka standardowa, zero tokenów:
księgowość sesji, budowa promptów uczestników, tani router, tablica, statystyki dla coacha.

  es_sim.py init --variant pelna|oszczedna [--scenario weterynaria] [--id 2026-09-27-a]
  es_sim.py round-begin --id <id> --text "<wypowiedź facylitatora>"   # zapisuje prompty rundy, wypisuje kogo wywołać
  es_sim.py round-end --id <id>                                      # wczytuje odpowiedzi, aktualizuje tablicę, wypisuje streszczenie
  es_sim.py invite --id <id> --persona <id>                          # dołącza osobę spoza sali
  es_sim.py pivotal --id <id> --event ev_003                         # facylitator oznacza zdarzenie przełomowe
  es_sim.py stats --id <id> [--json]                                 # metryki dla coacha
  es_sim.py board --id <id>                                          # tablica w markdown

Katalog sesji: $CLAUDE_PROJECT_DIR/docs/training/es-sim/<id>/ (materiał treningowy — nigdy dowód domenowy).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
ALLOWED_TYPES = {"event", "hot_spot"}
MEMORY_KEEP, ECHO_N, RECENT_EVENTS, ROOM_MAX = 5, 3, 12, 4
LONG_TURN = 6  # zdań — próg „monopolizowania” dla coacha


# ───────────── pliki ─────────────

def root() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()


def session_dir(sid: str) -> Path:
    return root() / "docs" / "training" / "es-sim" / sid


def load(sid: str) -> dict:
    p = session_dir(sid) / "state.json"
    if not p.exists():
        sys.exit(f"Brak sesji {sid} — uruchom: es_sim.py init")
    return json.loads(p.read_text(encoding="utf-8"))


def save(state: dict) -> None:
    d = session_dir(state["id"])
    (d / "state.json").write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    (d / "board.md").write_text(board_md(state), encoding="utf-8")


def parse_card(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    meta: dict = {}
    body = text
    if m:
        body = m.group(2)
        for line in m.group(1).splitlines():
            if ":" in line:
                k, _, v = line.partition(":")
                v = v.strip()
                meta[k.strip()] = [x.strip() for x in v[1:-1].split(",") if x.strip()] if v.startswith("[") else v
    sections = {h.strip(): c.strip() for h, c in re.findall(r"^##\s+(.+?)\n(.*?)(?=^##\s|\Z)", body, re.M | re.S)}
    variants = re.findall(r"^\s*\d+\.\s+(.+)$", sections.get("Warianty dnia", ""), re.M)
    anecdotes = dict(re.findall(r"^-\s+(\w+):\s+(.+)$", sections.get("Anegdoty", ""), re.M))
    return {"meta": meta, "sections": sections, "variants": variants, "anecdotes": anecdotes}


def personas(scenario: str) -> dict[str, dict]:
    out = {}
    for f in sorted((SKILL / "scenarios" / scenario / "personas").glob("*.md")):
        c = parse_card(f)
        out[c["meta"].get("id", f.stem)] = c
    return out


def sentences(text: str) -> int:
    return len([s for s in re.split(r"(?<=[.!?…])\s+", text.strip()) if len(s.strip()) > 2]) if text.strip() else 0


# ───────────── init / invite ─────────────

def cmd_init(a) -> None:
    sid = a.id or f"{date.today().isoformat()}-{hashlib.sha1(os.urandom(8)).hexdigest()[:4]}"
    ps = personas(a.scenario)
    if not ps:
        sys.exit(f"Brak scenariusza {a.scenario}")
    d = session_dir(sid)
    (d / "rounds").mkdir(parents=True, exist_ok=True)
    present = [pid for pid, c in ps.items() if c["meta"].get("obecna_od_startu", "tak") == "tak"]
    state = {
        "id": sid, "scenario": a.scenario, "variant": a.variant, "round": 0, "present": present,
        # wariant dnia: deterministyczny z id sesji i persony (inny temperament w każdej sesji, ta sama wiedza)
        "day_variant": {pid: int(hashlib.sha256(f"{sid}:{pid}".encode()).hexdigest(), 16) % max(1, len(c["variants"]))
                        for pid, c in ps.items()},
        "memory": {pid: [] for pid in ps}, "anecdotes_used": {pid: [] for pid in ps},
        "events": [], "hot_spots": [], "rejected": [], "pivotal": [], "rounds": [], "last_spoke": {pid: 0 for pid in ps},
    }
    (d / "transcript.md").write_text(f"# Transkrypcja sesji {sid} (scenariusz: {a.scenario}, wersja: {a.variant})\n"
                                     "> Materiał treningowy (symulacja) — nie jest źródłem wiedzy o prawdziwej domenie.\n",
                                     encoding="utf-8")
    save(state)
    # Gotowe wprowadzenie dla facylitatora — gospodarz pokazuje je dosłownie i nie czyta brief.md (tam jest wiedza ukryta).
    brief = (SKILL / "scenarios" / a.scenario / "brief.md").read_text(encoding="utf-8")
    m = re.search(r"^##\s+Domena\s*\n(.*?)(?=^##\s|\Z)", brief, re.M | re.S)
    title = re.search(r"^#\s+(.+)$", brief, re.M)
    who = "\n".join(f"| {ps[p]['meta'].get('imie', p)} | {ps[p]['meta'].get('rola', '')} |" for p in present)
    absent = ", ".join(f"{ps[p]['meta'].get('imie', p)} ({ps[p]['meta'].get('rola', '')})" for p in ps if p not in present) or "—"
    intro = (f"## Sesja `{sid}` — wersja {'pełna' if a.variant == 'pelna' else 'oszczędna'}\n"
             f"**{title.group(1) if title else a.scenario}**\n\n{m.group(1).strip() if m else ''}\n\n"
             f"| Na sali | Rola |\n|---|---|\n{who}\n\nDołączają na zaproszenie: {absent}\n\n"
             "**Cel:** Event Storming Big Picture — chronologia zdarzeń biznesowych, hot spoty, zdarzenia przełomowe.\n\n"
             "**Ty prowadzisz.** Pisz to, co powiedział(a)byś na sali. Polecenia: `zaproś <imię>` · `przełomowe ev_…` · "
             "`tablica` · `coach` · `koniec`.")
    print(json.dumps({"id": sid, "variant": a.variant, "present": present,
                      "absent": [p for p in ps if p not in present], "dir": str(d.relative_to(root()))},
                     ensure_ascii=False))
    print("\n=== POKAŻ DOSŁOWNIE ===\n" + intro)


def cmd_invite(a) -> None:
    st = load(a.id)
    if a.persona not in personas(st["scenario"]):
        sys.exit(f"Nieznana persona {a.persona}")
    if a.persona not in st["present"]:
        st["present"].append(a.persona)
        st.setdefault("invited_at", {})[a.persona] = st["round"] + 1
    save(st)
    print(f"✓ {a.persona} dołącza od rundy {st['round'] + 1}")


def cmd_pivotal(a) -> None:
    st = load(a.id)
    if not any(e["id"] == a.event for e in st["events"]):
        sys.exit(f"Nie ma zdarzenia {a.event}")
    if a.event not in st["pivotal"]:
        st["pivotal"].append(a.event)
    save(st)
    print(f"✓ {a.event} oznaczone jako przełomowe")


# ───────────── router (wersja oszczędna) ─────────────

def route(st: dict, ps: dict, text: str) -> list[str]:
    """Kogo wywołać: zaadresowani imieniem/rolą > dopasowani słowami kluczowymi > najdłużej milczący (rotacja)."""
    low = text.lower()
    present = [p for p in st["present"] if p in ps]
    def stems(p: str) -> list[str]:
        # rdzenie imion odporne na odmianę: „Beata” → „beat” trafia też „Beato”, „Beaty”, „Beatą”
        forms = ps[p]["meta"].get("formy_imienia") or []
        words = [w for w in re.findall(r"\w+", ps[p]["meta"].get("imie", "")) if len(w) >= 4]
        return [f.lower() for f in forms] + [w[:max(4, len(w) - 2)].lower() for w in words] + [p.lower()]
    named = [p for p in present if any(re.search(rf"\b{re.escape(st_)}", low) for st_ in stems(p))]
    if any(w in low for w in ("wszyscy", "każdy", "każda", "cała sala", "wszystkich")):
        named = named or present[:]
    scored = sorted(present, key=lambda p: (-sum(k.lower() in low for k in ps[p]["meta"].get("slowa_kluczowe", [])),
                                            st["last_spoke"].get(p, 0), p))
    # osoby, które z natury wtrącają się (karta: `wtraca_sie: tak`) — ich zachowanie jest częścią treningu
    butt_in = [p for p in present if str(ps[p]["meta"].get("wtraca_sie", "nie")).lower() == "tak"]
    chosen: list[str] = []
    for p in named + butt_in + scored:
        if p not in chosen:
            chosen.append(p)
    return chosen[:max(ROOM_MAX, len(named))]


# ───────────── prompty ─────────────

RULES = """Jesteś uczestnikiem SYMULOWANEGO warsztatu Event Storming Big Picture. Człowiek jest facylitatorem i trenuje prowadzenie sesji.
Zasady gry:
- Mów jak ta osoba: jej słowami, z jej wiedzą. Czego „nie wiesz” wg karty — naprawdę nie wiesz. Nie zdradzaj celu ćwiczenia.
- Nie pomagaj facylitatorowi ponad to, co zrobiłaby ta osoba. Nie podpowiadaj hot spotów ani kontekstów, nie projektuj systemu
  (chyba że karta mówi, że masz taką skłonność).
- Kartki: tylko `event` (zdarzenie w czasie przeszłym, np. „Wizyta umówiona”) albo `hot_spot` (problem, pytanie, spór). Inne typy są odrzucane.
- Milczenie jest dozwolone: jeśli ta osoba by się nie odezwała — pusty `dialogue` i pusta lista `stickies`.
- Każdej anegdoty użyj najwyżej raz (lista dostępnych poniżej); gdy się skończą — mów tylko konkretem z bieżącej rundy.
- Reaguj na facylitatora i na to, co powiedzieli inni w poprzedniej rundzie (echo sali).
"""

CONTRACT = """Odpowiedź: TYLKO blok JSON (bez komentarza), dokładnie w tym kształcie:
```json
{"persona": "<id>", "dialogue": "<co mówisz na głos; może być puste>",
 "stickies": [{"type": "event|hot_spot", "text": "<treść kartki>", "relates_to": "<ev_… lub null>", "rationale": "<po co, 1 zdanie>"}],
 "memory": "<jedno zdanie własnymi słowami: co zapamiętujesz z tej rundy>", "anecdote_used": "<id anegdoty albo null>"}
```"""


def card_block(pid: str, c: dict, st: dict, compact: bool) -> str:
    sec = c["sections"]
    variant = c["variants"][st["day_variant"][pid]] if c["variants"] else ""
    free = {k: v for k, v in c["anecdotes"].items() if k not in st["anecdotes_used"].get(pid, [])}
    parts = [f"### {c['meta'].get('imie', pid)} — {c['meta'].get('rola', '')} (id: {pid})"]
    if compact:
        parts.append(sec.get("Karta skrócona", ""))
    else:
        for name in ("Charakter", "Wiedza", "Bóle", "Kotwice zdarzeń", "Zachowania (bodziec → reakcja)", "Metaprogramy",
                     "Brzmienie (nie cytuj)"):
            if sec.get(name):
                parts.append(f"**{name}**\n{sec[name]}")
    parts.append(f"**Dziś (wariant dnia):** {variant}")
    parts.append("**Dostępne anegdoty:** " + ("; ".join(f"{k}: {v}" for k, v in free.items()) if free else "brak — mów tylko konkretem"))
    return "\n\n".join(parts)


def dynamic_block(pid: str | None, st: dict, text: str, pids: list[str]) -> str:
    events = st["events"][-RECENT_EVENTS:]
    ev = "\n".join(f"- {e['id']} {e['text']} ({e['author']})" for e in events) or "- (pusto)"
    prev = st["rounds"][-1]["replies"] if st["rounds"] else {}
    echo_src = [(p, r.get("dialogue", "")) for p, r in prev.items() if r.get("dialogue") and p != pid][:ECHO_N]
    echo = "\n".join(f"- {p}: „{d[:220]}”" for p, d in echo_src) or "- (cisza)"
    mem = {p: st["memory"].get(p, [])[-MEMORY_KEEP:] for p in pids}
    mem_txt = "\n".join(f"- {p}: " + " | ".join(m) for p, m in mem.items() if m) or "- (pierwsza runda)"
    return (f"## Stan sali (runda {st['round']})\nNa tablicy {len(st['events'])} zdarzeń, {len(st['hot_spots'])} hot spotów; "
            f"ostatnie:\n{ev}\n\n## Echo z poprzedniej rundy\n{echo}\n\n## Pamięć (własne skróty)\n{mem_txt}\n\n"
            f"## Facylitator mówi teraz\n„{text}”\n")


def cmd_round_begin(a) -> None:
    st = load(a.id)
    ps = personas(st["scenario"])
    st["round"] += 1
    n = st["round"]
    rd = session_dir(a.id) / "rounds" / f"{n:02d}"
    rd.mkdir(parents=True, exist_ok=True)
    with (session_dir(a.id) / "transcript.md").open("a", encoding="utf-8") as f:
        f.write(f"\n## Runda {n}\n**Facylitator:** {a.text}\n")
    if st["variant"] == "pelna":
        called = [p for p in st["present"] if p in ps]
        for p in called:
            prompt = (RULES + "\n## Twoja karta\n" + card_block(p, ps[p], st, compact=False) + "\n\n"
                      + dynamic_block(p, st, a.text, [p]) + "\n" + CONTRACT.replace("<id>", p)
                      + f"\n\nZapisz ten JSON do pliku `{(rd / (p + '.reply.json')).relative_to(root())}` i odpowiedz jednym słowem: ok.")
            (rd / f"{p}.prompt.md").write_text(prompt, encoding="utf-8")
        out = {"round": n, "variant": "pelna", "agent": "es-participant",
               "calls": [{"persona": p, "prompt_file": str((rd / f'{p}.prompt.md').relative_to(root()))} for p in called]}
    else:
        called = route(st, ps, a.text)
        cards = "\n\n".join(card_block(p, ps[p], st, compact=True) for p in called)
        prompt = (RULES.replace("Jesteś uczestnikiem", "Grasz kilku uczestników") + "\nGrasz WYŁĄCZNIE osoby z kart poniżej; "
                  "każda mówi osobno, własnym głosem. Pozostałe osoby w sali milczą w tej rundzie.\n\n## Karty\n" + cards + "\n\n"
                  + dynamic_block(None, st, a.text, called) + "\n"
                  + CONTRACT.replace('{"persona"', '[{"persona"').replace('"anecdote_used": "<id anegdoty albo null>"}',
                                                                        '"anecdote_used": "<id anegdoty albo null>"}, …]')
                  + f"\nJedna pozycja tablicy JSON na każdą osobę z kart. Zapisz tablicę do pliku "
                    f"`{(rd / 'room.reply.json').relative_to(root())}` i odpowiedz jednym słowem: ok.")
        (rd / "room.prompt.md").write_text(prompt, encoding="utf-8")
        out = {"round": n, "variant": "oszczedna", "agent": "es-room", "personas": called,
               "calls": [{"persona": ",".join(called), "prompt_file": str((rd / 'room.prompt.md').relative_to(root()))}]}
    st["rounds"].append({"n": n, "facilitator": a.text, "called": called, "replies": {}})
    save(st)
    print(json.dumps(out, ensure_ascii=False))


# ───────────── round-end ─────────────

def extract_json(text: str):
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    raw = (m.group(1) if m else text).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = min([i for i in (raw.find("{"), raw.find("[")) if i >= 0], default=-1)
        if start < 0:
            return None
        try:
            return json.JSONDecoder().raw_decode(raw[start:])[0]
        except json.JSONDecodeError:
            return None


def cmd_round_end(a) -> None:
    st = load(a.id)
    ps = personas(st["scenario"])
    n = st["round"]
    rd = session_dir(a.id) / "rounds" / f"{n:02d}"
    rnd = st["rounds"][-1]
    replies: dict[str, dict] = {}
    problems: list[str] = []
    if st["variant"] == "pelna":
        for p in rnd["called"]:
            f = rd / f"{p}.reply.json"
            data = extract_json(f.read_text(encoding="utf-8")) if f.exists() else None
            if not isinstance(data, dict):
                problems.append(f"{p}: brak lub niepoprawny JSON — traktuję jako milczenie (nie dopisuję kartek za personę)")
                data = {"persona": p, "dialogue": "", "stickies": []}
            replies[p] = data
    else:
        f = rd / "room.reply.json"
        data = extract_json(f.read_text(encoding="utf-8")) if f.exists() else None
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list):
            problems.append("room: brak lub niepoprawny JSON — cała runda jako cisza")
            data = []
        for item in data:
            if isinstance(item, dict) and item.get("persona") in rnd["called"]:
                replies[item["persona"]] = item
        for p in rnd["called"]:
            replies.setdefault(p, {"persona": p, "dialogue": "", "stickies": []})
    added_ev, added_hs, rejected = [], [], []
    for p, r in replies.items():
        for s in r.get("stickies") or []:
            typ = (s.get("type") or "").strip()
            text = (s.get("text") or "").strip()
            if typ not in ALLOWED_TYPES or not text:
                rejected.append({"round": n, "persona": p, "type": typ, "text": text})
                continue
            coll = st["events"] if typ == "event" else st["hot_spots"]
            sid = f"{'ev' if typ == 'event' else 'hs'}_{len(coll) + 1:03d}"
            item = {"id": sid, "text": text, "author": p, "round": n, "relates_to": s.get("relates_to"),
                    "rationale": s.get("rationale", "")}
            coll.append(item)
            (added_ev if typ == "event" else added_hs).append(sid)
        if r.get("memory"):
            st["memory"].setdefault(p, []).append(str(r["memory"])[:200])
            st["memory"][p] = st["memory"][p][-MEMORY_KEEP:]
        if r.get("anecdote_used") and r["anecdote_used"] in ps.get(p, {}).get("anecdotes", {}):
            st["anecdotes_used"].setdefault(p, []).append(r["anecdote_used"])
        if (r.get("dialogue") or "").strip() or r.get("stickies"):
            st["last_spoke"][p] = n
    st["rejected"] += rejected
    rnd["replies"] = {p: {"dialogue": r.get("dialogue", ""), "stickies": len(r.get("stickies") or [])} for p, r in replies.items()}
    rnd["added"] = {"events": added_ev, "hot_spots": added_hs, "rejected": len(rejected)}
    silent = [p for p in st["present"] if p not in replies or not (replies[p].get("dialogue") or "").strip()]
    lines = []
    for p, r in replies.items():
        d = (r.get("dialogue") or "").strip()
        if d:
            lines.append(f"**{ps[p]['meta'].get('imie', p)} ({p}):** {d}")
    for sid in added_ev + added_hs:
        it = next(x for x in st["events"] + st["hot_spots"] if x["id"] == sid)
        lines.append(f"- 🟧 `{sid}` {it['text']} — {it['author']}" if sid.startswith("ev") else f"- 🟪 `{sid}` {it['text']} — {it['author']}")
    meta = (f"_Runda {n}: +{len(added_ev)} zdarzeń, +{len(added_hs)} hot spotów, odrzucone kartki: {len(rejected)}, "
            f"milczą: {', '.join(silent) or '—'}_")
    with (session_dir(a.id) / "transcript.md").open("a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n" + meta + "\n")
        for pr in problems:
            f.write(f"> problem: {pr}\n")
    save(st)
    print("=== POKAŻ DOSŁOWNIE ===\n" + "\n".join(lines + [meta] + [f"⚠ {p}" for p in problems]))


# ───────────── tablica i statystyki ─────────────

def board_md(st: dict) -> str:
    rows = [f"# Tablica — sesja {st['id']} (runda {st['round']})", "", "## Zdarzenia (kolejność dodania)"]
    for e in st["events"]:
        mark = " ⭐ przełomowe" if e["id"] in st["pivotal"] else ""
        rel = f" ← {e['relates_to']}" if e.get("relates_to") else ""
        rows.append(f"- `{e['id']}` {e['text']} — {e['author']}, r{e['round']}{rel}{mark}")
    rows += ["", "## Hot spoty"] + [f"- `{h['id']}` {h['text']} — {h['author']}, r{h['round']}" for h in st["hot_spots"]]
    return "\n".join(rows) + "\n"


def stats(st: dict) -> dict:
    per: dict[str, dict] = {}
    for r in st["rounds"]:
        for p in st["present"]:
            s = per.setdefault(p, {"rounds_spoke": 0, "sentences": 0, "long_turns": 0, "max_silence": 0, "_cur": 0})
            d = r["replies"].get(p, {}).get("dialogue", "") if r.get("replies") else ""
            k = sentences(d)
            if k:
                s["rounds_spoke"] += 1
                s["sentences"] += k
                s["long_turns"] += k > LONG_TURN
                s["_cur"] = 0
            elif p in r.get("called", []) or st["variant"] == "pelna":
                s["_cur"] += 1
                s["max_silence"] = max(s["max_silence"], s["_cur"])
    for s in per.values():
        s.pop("_cur", None)
    rounds = max(1, len(st["rounds"]))
    fac = [r["facilitator"] for r in st["rounds"]]
    return {
        "rounds": len(st["rounds"]), "events": len(st["events"]), "hot_spots": len(st["hot_spots"]),
        "hot_spots_per_round": round(len(st["hot_spots"]) / rounds, 2), "pivotal": st["pivotal"],
        "rejected_by_type": {t: sum(1 for x in st["rejected"] if x["type"] == t) for t in {x["type"] for x in st["rejected"]}},
        "facilitator": {"avg_words": round(sum(len(t.split()) for t in fac) / rounds, 1),
                        "questions": sum(t.count("?") for t in fac)},
        "per_persona": per,
        "flags": {
            "monopolista": [p for p, s in per.items() if s["long_turns"] > 2],
            "milczacy": [p for p, s in per.items() if s["max_silence"] >= 4],
            "malo_hot_spotow": len(st["hot_spots"]) / rounds < 0.5,
            "brak_przelomowych": not st["pivotal"] and len(st["events"]) >= 10,
        },
    }


def cmd_stats(a) -> None:
    st = load(a.id)
    s = stats(st)
    if a.json:
        print(json.dumps(s, ensure_ascii=False, indent=1))
        return
    print(f"Rundy: {s['rounds']} · zdarzenia: {s['events']} · hot spoty: {s['hot_spots']} ({s['hot_spots_per_round']}/rundę) · "
          f"przełomowe: {', '.join(s['pivotal']) or '—'} · odrzucone kartki: {s['rejected_by_type'] or '—'}")
    print(f"Facylitator: śr. {s['facilitator']['avg_words']} słów/rundę, pytań: {s['facilitator']['questions']}")
    for p, v in s["per_persona"].items():
        print(f"- {p}: mówił(a) w {v['rounds_spoke']} rundach, zdań {v['sentences']}, długich wypowiedzi {v['long_turns']}, "
              f"najdłuższa cisza {v['max_silence']}")
    print("Sygnały: " + ", ".join(k for k, v in s["flags"].items() if v) or "Sygnały: —")


def cmd_board(a) -> None:
    print(board_md(load(a.id)))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("init"); p.add_argument("--variant", choices=["pelna", "oszczedna"], required=True)
    p.add_argument("--scenario", default="weterynaria"); p.add_argument("--id")
    p = sub.add_parser("round-begin"); p.add_argument("--id", required=True); p.add_argument("--text", required=True)
    p = sub.add_parser("round-end"); p.add_argument("--id", required=True)
    p = sub.add_parser("invite"); p.add_argument("--id", required=True); p.add_argument("--persona", required=True)
    p = sub.add_parser("pivotal"); p.add_argument("--id", required=True); p.add_argument("--event", required=True)
    p = sub.add_parser("stats"); p.add_argument("--id", required=True); p.add_argument("--json", action="store_true")
    p = sub.add_parser("board"); p.add_argument("--id", required=True)
    a = ap.parse_args()
    {"init": cmd_init, "round-begin": cmd_round_begin, "round-end": cmd_round_end, "invite": cmd_invite,
     "pivotal": cmd_pivotal, "stats": cmd_stats, "board": cmd_board}[a.cmd](a)


if __name__ == "__main__":
    main()
