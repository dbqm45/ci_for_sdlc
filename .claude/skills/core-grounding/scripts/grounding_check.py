#!/usr/bin/env python3
"""
Sprawdza, czy odwołania w dokumentach markdown wskazują rzeczy, które istnieją — bez modelu.

  python3 .claude/skills/core-grounding/scripts/grounding_check.py docs/project/06-delivery/003-logowanie.md
  python3 .claude/skills/core-grounding/scripts/grounding_check.py docs/project/ --warn   # tylko ostrzeżenia, kod 0
  python3 .claude/skills/core-grounding/scripts/grounding_check.py raport.md --jev       # + czy treść linii potwierdza zdanie

Sprawdza:
- ścieżki w `kodzie` (z ukośnikiem albo znanym rozszerzeniem), także w poleceniach (`python3 tools/x.py`),
- odwołania `plik:linia` i `plik:linia-linia` (plik istnieje i ma tyle linii),
- lokalne linki markdown [tekst](ścieżka#kotwica).
Z --jev (wymaga TYPESAFE_API_KEY; cookbook TypeSafe „citation check”) dla każdego odwołania `plik:linia` pyta model
decyzyjny Jev, czy wskazane linie POTWIERDZAJĄ zdanie, w którym stoi odwołanie, PRZECZĄ mu, czy NIC O NIM NIE MÓWIĄ.
Pewność ≥0,8 → werdykt; niższa → „do przejrzenia przez człowieka”. Sprzeczne i niepotwierdzające liczą się jako problemy.
Ścieżki szuka względem katalogu dokumentu, jego katalogów nadrzędnych i katalogu projektu. Pomija bloki kodu,
adresy URL, wzorce z <…>, *, {…}, $ oraz ścieżki oznaczone w tej samej linii jako planowane („(nowy)”, „(do
utworzenia)”, „[plan]”). Do dokumentów o projekcie (raporty, artefakty, README), nie do przykładów w skillach.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path.cwd()).resolve()
EXT = (".md", ".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json", ".yaml", ".yml", ".java", ".kt", ".html",
       ".css", ".scss", ".sql", ".sh", ".ps1", ".toml", ".xml", ".gradle", ".kts", ".tf", ".txt", ".jsonl", ".cfg", ".ini")
PLANNED = re.compile(r"\((nowy|nowa|nowe|do utworzenia|planowan\w*)\)|\[plan\]", re.I)
CODE_SPAN = re.compile(r"`([^`\n]+)`")
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
LINE_REF = re.compile(r"^(?P<path>[^\s:]+\.[A-Za-z0-9]+):(?P<a>\d+)(?:-(?P<b>\d+))?$")
SKIP_CHARS = set("<>*{}$|")


def candidates(token: str) -> list[str]:
    """Ścieżki do sprawdzenia w jednym fragmencie kodu (całość albo słowa polecenia)."""
    parts = token.split() if " " in token.strip() else [token.strip()]
    out = []
    for p in parts:
        p = p.strip("'\",;()")
        if not p or any(c in SKIP_CHARS for c in p) or "://" in p or p.startswith(("-", "@", "#", "~")):
            continue
        base = LINE_REF.match(p).group("path") if LINE_REF.match(p) else p
        if base.endswith("/") and base.count("/") == 1:
            continue   # sam katalog w rodzaju `references/` — zbyt ogólny, żeby go sprawdzać
        if ("/" in base and not base.startswith("/")) or base.lower().endswith(EXT):
            if re.match(r"^[\w.\-/]+$", base) and not base.startswith(".."):
                out.append(p)
    return out


_NAMES: dict[str, bool] = {}


def known_name(name: str) -> bool:
    """Sama nazwa pliku bez ścieżki (np. `scan_secrets.py`) — istnieje gdziekolwiek w projekcie?"""
    if name not in _NAMES:
        _NAMES[name] = any(True for p in ROOT.rglob(name)
                           if not any(x in p.parts for x in ("node_modules", ".git", "dist", "build", "coverage")))
    return _NAMES[name]


def resolve(doc: Path, rel: str) -> Path | None:
    rel = rel.rstrip("/")
    if "/" not in rel:
        local = doc.parent / rel
        if local.exists():
            return local
        return ROOT / rel if known_name(rel) else None
    bases = [doc.parent, *doc.parent.parents]
    for b in bases:
        cand = (b / rel)
        if cand.exists():
            return cand
        if b == ROOT:
            break
    cand = ROOT / rel
    return cand if cand.exists() else None


def looks_like_repo_path(doc: Path, path: str) -> bool:
    """Ścieżka bez rozszerzenia (np. `src/app/orders`) jest sprawdzana tylko, gdy jej pierwszy człon istnieje —
    inaczej to raczej identyfikator w rodzaju `skill/scenariusz`, a nie ścieżka."""
    if path.lower().endswith(EXT) and not path.startswith(".") or "/" not in path:
        return not (path.startswith(".") and "/" not in path and len(path) < 7)
    first = path.split("/")[0]
    return any((b / first).exists() for b in (doc.parent, *doc.parent.parents, ROOT))


def check_doc(doc: Path) -> list[str]:
    problems = []
    in_code = False
    for n, line in enumerate(doc.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        if line.lstrip().startswith("```"):
            in_code = not in_code
            continue
        if in_code or PLANNED.search(line):
            continue
        refs = [c for span in CODE_SPAN.findall(line) for c in candidates(span)]
        refs += [l.split("#")[0] for l in LINK.findall(line) if "://" not in l and not l.startswith(("#", "mailto:"))]
        for ref in refs:
            if not ref:
                continue
            m = LINE_REF.match(ref)
            path = m.group("path") if m else ref
            if not looks_like_repo_path(doc, path):
                continue
            target = resolve(doc, path)
            where = f"{doc.relative_to(ROOT) if doc.is_relative_to(ROOT) else doc}:{n}"
            if target is None:
                problems.append(f"{where}: nie istnieje `{path}`")
            elif m and target.is_file():
                last = int(m.group("b") or m.group("a"))
                lines = len(target.read_text(encoding="utf-8", errors="ignore").splitlines())
                if last > lines:
                    problems.append(f"{where}: `{ref}` — plik ma {lines} linii")
    return problems


JEV_ACCEPT = 0.8      # próg automatycznej akceptacji werdyktu (cookbook „citation check”)
CITE_CRITERIA = {
    "supports": "The `section` affirms the `claim` or logically implies that it is true.",
    "contradicts": "The `section` denies the `claim` or implies that it is false.",
    "says_nothing": "The `section` is silent on what the `claim` asserts.",
}


def jev_citations(doc: Path, limit: int) -> tuple[list[str], list[str]]:
    """Weryfikacja treści odwołań `plik:linia`: (problemy, do przejrzenia)."""
    cands = [d / ".claude" / "hooks" for d in (ROOT, *ROOT.parents)] + [Path(__file__).resolve().parents[3] / "hooks"]
    hooks = next((h for h in cands if (h / "jev_client.py").exists()), None)
    if not hooks:
        return [], ["brak .claude/hooks/jev_client.py — pominięto --jev"]
    sys.path.insert(0, str(hooks))
    import jev_client as jev
    if not jev.enabled():
        return [], ["--jev wymaga zmiennej TYPESAFE_API_KEY — pominięto weryfikację treści"]
    problems, review, done = [], [], 0
    in_code = False
    for n, line in enumerate(doc.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        if line.lstrip().startswith("```"):
            in_code = not in_code
            continue
        if in_code or PLANNED.search(line):
            continue
        for span in CODE_SPAN.findall(line):
            m = LINE_REF.match(span.strip())
            if not m or done >= limit:
                continue
            target = resolve(doc, m.group("path"))
            if not target or not target.is_file():
                continue
            lines = target.read_text(encoding="utf-8", errors="ignore").splitlines()
            a, b = int(m.group("a")), int(m.group("b") or m.group("a"))
            if b > len(lines):
                continue
            section = "\n".join(lines[max(0, a - 3):min(len(lines), b + 2)])
            claim = CODE_SPAN.sub(lambda x: x.group(0) if x.group(1) != span else "", line).strip(" -*#")
            ans = jev.decide({"claim": claim, "section": section},
                             {"verdict": {"type": "choice", "criteria": CITE_CRITERIA,
                                          "instructions": "How does `section` relate to `claim`? The texts may be in Polish."}},
                             timeout=10)
            done += 1
            where = f"{doc.relative_to(ROOT) if doc.is_relative_to(ROOT) else doc}:{n}"
            if not ans:
                review.append(f"{where}: `{span}` — Jev nie odpowiedział")
                continue
            v, conf = ans["verdict"].get("choice"), float(ans["verdict"].get("confidence") or 0)
            if conf < JEV_ACCEPT:
                review.append(f"{where}: `{span}` — niepewne ({v}, pewność {conf:.2f}) — sprawdź ręcznie")
            elif v == "contradicts":
                problems.append(f"{where}: `{span}` PRZECZY zdaniu (pewność {conf:.2f})")
            elif v == "says_nothing":
                problems.append(f"{where}: `{span}` nie potwierdza zdania — wskazane linie o tym nie mówią (pewność {conf:.2f})")
    return problems, review


def main(argv: list[str]) -> int:
    warn = "--warn" in argv
    paths = [Path(a) for a in argv[1:] if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    docs = []
    for p in paths:
        p = p if p.is_absolute() else (Path.cwd() / p)
        docs += sorted(p.rglob("*.md")) if p.is_dir() else [p]
    problems = [x for d in docs if d.exists() for x in check_doc(d.resolve())]
    review: list[str] = []
    if "--jev" in argv:
        for d in docs:
            if d.exists():
                pr, rv = jev_citations(d.resolve(), limit=50)
                problems += pr
                review += rv
    for x in review:
        print("? " + x)
    for x in problems:
        print(("⚠ " if warn else "✗ ") + x)
    print(f"{'✓' if not problems else ('⚠' if warn else '✗')} odwołania: {len(docs)} dokumentów, problemów: {len(problems)}")
    return 0 if warn or not problems else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
