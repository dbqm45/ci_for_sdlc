#!/usr/bin/env python3
"""
Dziennik projektu (docs/project/): struktura, indeks, walidacja, dziennik zdarzeń, raport.

  python3 .claude/hooks/project_record.py init                 # utwórz strukturę docs/project/
  python3 .claude/hooks/project_record.py status               # stan faz, do akceptacji, ostatnie przekazanie
  python3 .claude/hooks/project_record.py check                # walidacja artefaktów (exit 1 przy błędach)
  python3 .claude/hooks/project_record.py index                # przebuduj docs/project/README.md
  python3 .claude/hooks/project_record.py log --by ewa --phase domain "Utworzono mapę kontekstów (proposed)"
  python3 .claude/hooks/project_record.py report [--out plik]  # raport do przeczytania/przekazania
  python3 .claude/hooks/project_record.py evidence             # cytaty z corpus.md istnieją w źródłach; progi obszarów
  python3 .claude/hooks/project_record.py wip start "Cel zadania" [--slug nazwa] [--by kto]   # punkt kontrolny pracy w toku
  python3 .claude/hooks/project_record.py wip list | show [nazwa] | done <nazwa> | pause <nazwa> | snapshot
  --hook-session / --hook-index                                 # tryby hooków (SessionStart / PostToolUse)
  --hook-snapshot <zdarzenie> / --hook-stop                     # migawka stanu (PreCompact, SessionEnd) / przypomnienie (Stop)

Tylko biblioteka standardowa. Katalog projektu: $CLAUDE_PROJECT_DIR albo bieżący.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parent.parent / "skills" / "core-project-record" / "templates"
PHASES = [
    ("discovery", "01-discovery", "Odkrywanie"),
    ("domain", "02-domain", "Domena"),
    ("requirements", "03-requirements", "Wymagania"),
    ("architecture", "04-architecture", "Architektura i stack"),
    ("plan", "05-plan", "Plan"),
    ("delivery", "06-delivery", "Realizacja"),
    ("review", "07-review", "Przeglądy"),
    ("operations", "08-operations", "Utrzymanie"),
]
PHASE_DIR = {p: d for p, d, _ in PHASES}
PHASE_LABEL = {p: label for p, _, label in PHASES}
STATUSES = ["draft", "proposed", "accepted", "superseded", "rejected"]
REQUIRED_KEYS = ["artifact", "phase", "status", "version", "author", "created", "updated", "inputs"]
NO_SECTIONS = {"adr", "journal", "decisions"}
# główne artefakty faz — muszą mieć nagłówek (pozostałe pliki to materiały pomocnicze)
MAIN_PATTERNS = [
    r"01-discovery/brief\.md", r"02-domain/strategic\.md", r"03-requirements/requirements\.md",
    r"04-architecture/[^/]+\.md", r"04-architecture/adr/[^/]+\.md", r"05-plan/[^/]+\.md",
    r"06-delivery/[^/]+\.md", r"07-review/[^/]+\.md", r"08-operations/[^/]+\.md",
]


def root_dir() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()


def record_dir(root: Path) -> Path:
    return root / "docs" / "project"


# ───────────── parsowanie ─────────────

def parse(path: Path) -> tuple[dict | None, str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return None, text
    meta: dict = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = re.sub(r"\s+#.*$", "", value).strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key.strip()] = [v.strip().strip("'\"") for v in value[1:-1].split(",") if v.strip()]
        else:
            meta[key.strip()] = value.strip("'\"")
    return meta, m.group(2)


def section(body: str, name: str) -> str | None:
    m = re.search(rf"^##\s+{re.escape(name)}\s*$(.*?)(?=^##\s|\Z)", body, re.M | re.S)
    return m.group(1).strip() if m else None


def title(body: str, fallback: str) -> str:
    m = re.search(r"^#\s+(.+)$", body, re.M)
    return m.group(1).strip() if m else fallback


def artifacts(rec: Path) -> list[dict]:
    items = []
    for p in sorted(rec.rglob("*.md")):
        rel = p.relative_to(rec).as_posix()
        if rel == "README.md" or rel.startswith(("exports/", "archive/", "wip/")):
            continue
        meta, body = parse(p)
        items.append({"path": p, "rel": rel, "meta": meta, "body": body,
                      "main": any(re.fullmatch(pat, rel) for pat in MAIN_PATTERNS)})
    return items


def phase_index(phase: str) -> int:
    return next((i for i, (p, _, _) in enumerate(PHASES) if p == phase), -1)


# ───────────── walidacja ─────────────

def language_warnings(rec: Path) -> list[str]:
    """Uwagi językowe (WYSOKIE i ŚREDNIE) z lintera polszczyzny — zero tokenów; tylko ostrzeżenia, nie blokują."""
    lint_path = Path(__file__).resolve().parent.parent / "skills" / "txt-polish-correctness" / "scripts" / "polish_lint.py"
    if not lint_path.exists():
        return []
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("polish_lint", lint_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        out = []
        for f in sorted(rec.rglob("*.md")):
            rel = f.relative_to(rec).as_posix()
            if rel == "README.md" or rel.startswith(("exports/", "archive/")) or rel.endswith("corpus.md"):
                continue   # bank dowodów to dosłowne cytaty — nie poprawiamy
            issues = [i for i in mod.lint_file(f) if i["priority"] in ("WYSOKI", "ŚREDNI")]
            if issues:
                first = issues[0]
                out.append(f"{rel}: {len(issues)} uwag językowych (np. l.{first['line']}: {first['fragment']} → "
                           f"{first['suggestion']}) — polish_lint.py lub polish-editor")
        return out
    except Exception:
        return []


def check(root: Path) -> tuple[list[str], list[str]]:
    rec = record_dir(root)
    errors, warnings = [], []
    if not rec.exists():
        return [f"brak {rec.relative_to(root)} — uruchom: project_record.py init"], []
    items = artifacts(rec)
    by_rel = {f"docs/project/{i['rel']}": i for i in items}
    for it in items:
        meta, rel = it["meta"], it["rel"]
        if meta is None:
            if it["main"]:
                errors.append(f"{rel}: brak nagłówka (frontmatter) — główny artefakt fazy")
            continue
        for k in REQUIRED_KEYS:
            if k not in meta or meta[k] in ("", None):
                errors.append(f"{rel}: brak pola '{k}' w nagłówku")
        raw = "\n".join(f"{k}: {v}" for k, v in meta.items())
        if "<" in raw and ">" in raw:
            errors.append(f"{rel}: w nagłówku zostały znaczniki szablonu <…>")
        status, phase, kind = meta.get("status"), meta.get("phase"), meta.get("artifact")
        if status and status not in STATUSES:
            errors.append(f"{rel}: nieznany status '{status}' (dozwolone: {', '.join(STATUSES)})")
        if phase and phase != "meta":
            if phase not in PHASE_DIR:
                errors.append(f"{rel}: nieznana faza '{phase}'")
            elif not rel.startswith(PHASE_DIR[phase] + "/"):
                errors.append(f"{rel}: faza '{phase}', a plik nie leży w {PHASE_DIR[phase]}/")
        if kind not in NO_SECTIONS:
            tldr = section(it["body"], "TL;DR")
            if tldr is None:
                errors.append(f"{rel}: brak sekcji „## TL;DR”")
            elif not tldr or tldr.startswith("<"):
                errors.append(f"{rel}: pusta sekcja TL;DR")
            elif len([l for l in tldr.splitlines() if l.strip()]) > 12:
                warnings.append(f"{rel}: TL;DR dłuższy niż ~10 linii — skróć (czyta go każdy następny agent)")
            handoff = section(it["body"], "Przekazanie")
            if handoff is None and status != "superseded":
                errors.append(f"{rel}: brak sekcji „## Przekazanie”")
            elif handoff is not None and status in ("proposed", "accepted") and (
                    re.search(r"<[^>]+>", handoff) or re.search(r":\*?\*?\s*…\s*$", handoff, re.M)):
                errors.append(f"{rel}: Przekazanie zawiera niewypełnione pola szablonu (<…> lub …)")
        if kind not in ("journal", "decisions") and status in ("proposed", "accepted"):
            leftovers = re.findall(r"^[^|`\n]*<[A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż][^>\n]{3,}>", it["body"], re.M)
            if leftovers:
                warnings.append(f"{rel}: pozostałości szablonu w treści, np. {leftovers[0].strip()[:60]!r}")
        if status == "superseded" and not meta.get("superseded_by"):
            errors.append(f"{rel}: status superseded bez pola superseded_by")
        for inp in meta.get("inputs") or []:
            target = by_rel.get(inp)
            if not (root / inp).exists():
                errors.append(f"{rel}: wejście '{inp}' nie istnieje")
            elif status == "accepted" and target and target["meta"] and target["meta"].get("status") != "accepted":
                warnings.append(f"{rel}: zaakceptowany, ale wejście {inp} ma status '{target['meta'].get('status')}'")
    dec = rec / "decisions.md"
    if dec.exists():
        ids = re.findall(r"^\|\s*(D-\d+)\s*\|", dec.read_text(encoding="utf-8"), re.M)
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            errors.append(f"decisions.md: zduplikowane ID decyzji {dup}")
    warnings += language_warnings(rec)
    for phase, d, _ in PHASES:
        folder = rec / d
        mains = {"discovery": ["brief.md", "pre-flight.md"], "domain": ["strategic.md", "areas.md"], "requirements": ["requirements.md"],
                 "plan": ["plan.md", "test-plan.md"]}.get(phase)
        if mains and folder.exists() and any(folder.rglob("*.md")) and not any((folder / m).exists() for m in mains):
            warnings.append(f"{d}/: są pliki, ale brak głównego artefaktu {' ani '.join(mains)}")
    return errors, warnings


# ───────────── indeks / status / raport ─────────────

def first_line(text: str | None) -> str:
    for line in (text or "").splitlines():
        line = line.strip().lstrip("-* ").strip()
        if line and not line.startswith("<!--"):
            return (line[:140] + "…") if len(line) > 140 else line
    return ""


def journal_rows(rec: Path, n: int) -> list[str]:
    j = rec / "journal.md"
    if not j.exists():
        return []
    rows = [l for l in j.read_text(encoding="utf-8").splitlines() if l.startswith("| 20")]
    return rows[-n:]


def summary(root: Path) -> dict:
    rec = record_dir(root)
    items = [i for i in artifacts(rec) if i["meta"] and i["meta"].get("phase") in PHASE_DIR]
    live = [i for i in items if i["meta"].get("status") not in ("superseded", "rejected")]
    current = max(live, key=lambda i: phase_index(i["meta"]["phase"]), default=None)
    with_handoff = [i for i in live if section(i["body"], "Przekazanie")]
    latest = max(with_handoff, key=lambda i: (i["meta"].get("updated", ""), phase_index(i["meta"]["phase"]),
                                             i["path"].stat().st_mtime), default=None)
    return {
        "items": items,
        "current_phase": current["meta"]["phase"] if current else None,
        "to_accept": [i for i in live if i["meta"].get("status") == "proposed"],
        "latest": latest,
    }


def build_index(root: Path) -> str:
    rec = record_dir(root)
    s = summary(root)
    lines = [
        "<!-- WYGENEROWANO przez .claude/hooks/project_record.py — nie edytuj ręcznie -->",
        "# Dziennik projektu", "",
        f"**Bieżąca faza:** {PHASE_LABEL.get(s['current_phase'], '—')}  ·  "
        f"**Do akceptacji:** {len(s['to_accept'])}  ·  [Dziennik zdarzeń](journal.md)  ·  [Rejestr decyzji](decisions.md)", "",
        "| Faza | Artefakt | Status | Wersja | Autor | Aktualizacja | TL;DR |", "|---|---|---|---|---|---|---|",
    ]
    for it in sorted(s["items"], key=lambda i: (phase_index(i["meta"]["phase"]), i["rel"])):
        m = it["meta"]
        lines.append(f"| {PHASE_LABEL[m['phase']]} | [{title(it['body'], it['rel'])}]({it['rel']}) | {m.get('status')} | "
                     f"{m.get('version', '')} | {m.get('author', '')} | {m.get('updated', '')} | {first_line(section(it['body'], 'TL;DR'))} |")
    wips = wip_items(root)
    if wips:
        lines += ["", "## Praca w toku", "", "| Zadanie | Status | Aktualizacja | Następna czynność |", "|---|---|---|---|"]
        lines += [f"| [{title(w['body'], w['slug'])}](wip/{w['slug']}.md) | {w['meta'].get('status', 'active')} | "
                  f"{w['meta'].get('updated', '')} | {first_line(section(w['body'], 'Następna czynność'))} |" for w in wips]
    if s["latest"]:
        handoff = section(s["latest"]["body"], "Przekazanie")
        if handoff:
            lines += ["", f"## Ostatnie przekazanie — z [{s['latest']['rel']}]({s['latest']['rel']})", "", handoff]
    rows = journal_rows(rec, 5)
    if rows:
        lines += ["", "## Ostatnie zdarzenia", "", "| Kiedy | Kto | Faza | Zdarzenie |", "|---|---|---|---|", *rows]
    return "\n".join(lines) + "\n"


def write_index(root: Path) -> None:
    rec = record_dir(root)
    if rec.exists():
        (rec / "README.md").write_text(build_index(root), encoding="utf-8")


def status_text(root: Path, compact: bool = False) -> str:
    rec = record_dir(root)
    if not rec.exists():
        return ""
    s = summary(root)
    out = wip_lines(root, compact)
    out.append(f"Dziennik projektu: docs/project/README.md · bieżąca faza: {PHASE_LABEL.get(s['current_phase'], 'brak artefaktów')}")
    if s["to_accept"]:
        out.append("Do akceptacji przez człowieka: " + ", ".join(i["rel"] for i in s["to_accept"]))
    if s["latest"]:
        handoff = section(s["latest"]["body"], "Przekazanie") or ""
        h = [l for l in handoff.splitlines() if l.strip()][: 4 if compact else 20]
        if h:
            out.append(f"Ostatnie przekazanie ({s['latest']['rel']}):")
            out += ["  " + l for l in h]
    recent = journal_rows(rec, 3)
    if recent:
        out.append("Ostatnie zdarzenia (journal.md) — uwzględnij decyzje i odpowiedzi użytkownika:")
        out += ["  " + " · ".join(c.strip() for c in r.strip("|").split("|")) for r in recent]
    if not compact:
        out.append("")
        for it in sorted(s["items"], key=lambda i: (phase_index(i["meta"]["phase"]), i["rel"])):
            m = it["meta"]
            out.append(f"  [{m.get('status'):<10}] {it['rel']:<45} {first_line(section(it['body'], 'TL;DR'))[:80]}")
    return "\n".join(out)


def report(root: Path, out: Path | None) -> Path:
    rec = record_dir(root)
    s = summary(root)
    brief = rec / "01-discovery" / "brief.md"
    name = title(parse(brief)[1], root.name) if brief.exists() else root.name
    lines = [f"# Raport projektu: {name}", "", f"Wygenerowano: {datetime.now():%Y-%m-%d %H:%M} · bieżąca faza: "
             f"{PHASE_LABEL.get(s['current_phase'], '—')}", "", "## Stan artefaktów", "",
             "| Faza | Artefakt | Status | Autor | Aktualizacja |", "|---|---|---|---|---|"]
    ordered = sorted(s["items"], key=lambda i: (phase_index(i["meta"]["phase"]), i["rel"]))
    for it in ordered:
        m = it["meta"]
        lines.append(f"| {PHASE_LABEL[m['phase']]} | {it['rel']} | {m.get('status')} | {m.get('author')} | {m.get('updated')} |")
    lines += ["", "## Podsumowania faz"]
    for it in ordered:
        if it["meta"].get("status") in ("superseded", "rejected"):
            continue
        tl = section(it["body"], "TL;DR")
        if tl:
            lines += ["", f"### {title(it['body'], it['rel'])}  ·  _{it['meta'].get('status')}_", "", tl]
    dec = rec / "decisions.md"
    if dec.exists():
        rows = [l for l in dec.read_text(encoding="utf-8").splitlines() if re.match(r"^\|\s*D-\d+", l)]
        if rows:
            lines += ["", "## Decyzje", "", "| ID | Data | Decyzja | Uzasadnienie | Status | Autor | Szczegóły |",
                      "|---|---|---|---|---|---|---|", *rows]
    questions = []
    for it in ordered:
        q = section(it["body"], "Otwarte pytania") if it["meta"].get("status") not in ("superseded", "rejected") else None
        for l in (q or "").splitlines():
            l = l.strip()
            if l.startswith(("- [ ]", "- ", "* ")) and not l.startswith("- [x]") and "…" not in l:
                questions.append(f"{l}  _({it['rel']})_")
    if questions:
        lines += ["", "## Otwarte pytania", "", *questions]
    rows = journal_rows(rec, 15)
    if rows:
        lines += ["", "## Ostatnie zdarzenia", "", "| Kiedy | Kto | Faza | Zdarzenie |", "|---|---|---|---|", *rows]
    target = out or rec / "exports" / f"report-{date.today():%Y-%m-%d}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target


# ───────────── zapis ─────────────

def from_template(name: str) -> str:
    today = f"{date.today():%Y-%m-%d}"
    return (TEMPLATES / name).read_text(encoding="utf-8").replace("<RRRR-MM-DD>", today)


def init(root: Path) -> Path:
    rec = record_dir(root)
    for _, d, _ in PHASES:
        (rec / d).mkdir(parents=True, exist_ok=True)
    (rec / "04-architecture" / "adr").mkdir(exist_ok=True)
    for extra in ("archive", "exports"):
        (rec / extra).mkdir(exist_ok=True)
    for name in ("journal.md", "decisions.md"):
        if not (rec / name).exists():
            (rec / name).write_text(from_template(name), encoding="utf-8")
    log(root, "system", "meta", "Utworzono dziennik projektu (docs/project/)")
    write_index(root)
    return rec


def log(root: Path, by: str, phase: str, text: str) -> None:
    rec = record_dir(root)
    j = rec / "journal.md"
    if not j.exists():
        rec.mkdir(parents=True, exist_ok=True)
        j.write_text(from_template("journal.md"), encoding="utf-8")
    clean = " ".join(text.split()).replace("|", "\\|")
    with j.open("a", encoding="utf-8") as f:
        f.write(f"| {datetime.now():%Y-%m-%d %H:%M} | {by} | {phase} | {clean} |\n")
    content = j.read_text(encoding="utf-8")
    j.write_text(re.sub(r"^updated: .*$", f"updated: {date.today():%Y-%m-%d}", content, count=1, flags=re.M), encoding="utf-8")


# ───────────── praca w toku (wip/) — przerwanie sesji i powrót ─────────────

WIP_ACTIVE = ("active", "paused", "blocked")
AUTO_BEGIN, AUTO_END = "<!-- stan-automatyczny:begin -->", "<!-- stan-automatyczny:end -->"
STALE_MINUTES = 10          # Stop przypomina, gdy zmiany w plikach są o tyle nowsze niż punkt kontrolny
PL = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.translate(PL).lower()).strip("-")
    return s[:40].rstrip("-") or "zadanie"


def git(root: Path, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def changed_files(root: Path) -> list[str] | None:
    """Niezacommitowane zmiany (bez samych punktów kontrolnych); None, gdy to nie repozytorium git."""
    out = git(root, "status", "--porcelain", "-uall")
    if out is None:
        return None
    files = []
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1].strip().strip('"')
        if path and not path.startswith(("docs/project/wip/", ".claude/logs/")) and \
                path not in ("docs/project/README.md", "docs/project/journal.md"):
            files.append(path)
    return files


def wip_items(root: Path, statuses: tuple = WIP_ACTIVE) -> list[dict]:
    folder = record_dir(root) / "wip"
    items = []
    for p in sorted(folder.glob("*.md")) if folder.exists() else []:
        meta, body = parse(p)
        meta = meta or {}
        if meta.get("status", "active") in statuses:
            items.append({"path": p, "slug": p.stem, "meta": meta, "body": body})
    return items


def unchecked(body: str) -> list[str]:
    steps = section(body, "Kroki") or ""
    return [l.strip()[6:].strip() for l in steps.splitlines() if l.strip().startswith("- [ ]")]


def wip_start(root: Path, goal: str, slug: str | None, by: str) -> Path:
    folder = record_dir(root) / "wip"
    folder.mkdir(parents=True, exist_ok=True)
    slug = slugify(slug or goal)
    path = folder / f"{slug}.md"
    if path.exists():
        raise FileExistsError(f"docs/project/wip/{slug}.md już istnieje — wznów go albo podaj inne --slug")
    now = f"{datetime.now():%Y-%m-%d %H:%M}"
    text = (from_template("wip.md").replace("<slug>", slug).replace("<kto>", by).replace("<cel>", goal)
            .replace("<RRRR-MM-DD GG:MM>", now).replace("<gałąź>", git(root, "branch", "--show-current") or "—"))
    path.write_text(text, encoding="utf-8")
    log(root, by, "meta", f"Start pracy w toku: {goal} (docs/project/wip/{slug}.md)")
    write_index(root)
    return path


def wip_set_status(root: Path, slug: str, status: str, by: str) -> Path:
    path = record_dir(root) / "wip" / f"{slug}.md"
    if not path.exists():
        raise FileNotFoundError(f"brak docs/project/wip/{slug}.md")
    text = path.read_text(encoding="utf-8")
    now = f"{datetime.now():%Y-%m-%d %H:%M}"
    text = re.sub(r"^status: .*$", f"status: {status}", text, count=1, flags=re.M)
    text = re.sub(r"^updated: .*$", f"updated: {now}", text, count=1, flags=re.M)
    if status == "done":
        target = record_dir(root) / "archive" / "wip" / f"{datetime.now():%Y%m%d}-{slug}.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        path.unlink()
        path = target
    else:
        path.write_text(text, encoding="utf-8")
    log(root, by, "meta", f"Praca w toku {slug}: {status}")
    write_index(root)
    return path


def snapshot(root: Path, event: str) -> int:
    """Mechaniczny zapis stanu (gałąź, commit, zmienione pliki) w aktywnych punktach kontrolnych; nie zmienia mtime."""
    items = wip_items(root)
    if not items:
        return 0
    files = changed_files(root)
    branch = git(root, "branch", "--show-current") or "—"
    head = git(root, "log", "-1", "--format=%h %s") or "—"
    shown = ", ".join(f"`{f}`" for f in (files or [])[:25]) + (" …" if files and len(files) > 25 else "")
    block = "\n".join([
        AUTO_BEGIN,
        "## Stan automatyczny (zapisuje hook — nie edytuj)",
        f"- Zapisano: {datetime.now():%Y-%m-%d %H:%M} · zdarzenie: {event}",
        f"- Gałąź: {branch} · ostatni commit: {head}",
        f"- Niezacommitowane zmiany ({len(files) if files is not None else 'brak gita'}): {shown or '—'}",
        AUTO_END,
    ])
    for it in items:
        p = it["path"]
        st = p.stat()
        text = p.read_text(encoding="utf-8")
        if AUTO_BEGIN in text and AUTO_END in text:
            text = text[:text.index(AUTO_BEGIN)] + block + text[text.index(AUTO_END) + len(AUTO_END):]
        else:
            text = text.rstrip() + "\n\n" + block + "\n"
        p.write_text(text, encoding="utf-8")
        os.utime(p, (st.st_atime, st.st_mtime))      # migawka nie udaje aktualizacji przez agenta
    return len(items)


def stop_reminder(root: Path, data: dict) -> str | None:
    """Powód do kontynuacji, gdy punkt kontrolny jest wyraźnie starszy niż zmiany w plikach."""
    if data.get("stop_hook_active"):
        return None
    items = [i for i in wip_items(root, ("active",))]
    files = changed_files(root) if items else None
    if not items or not files:
        return None
    newest = max(((root / f).stat().st_mtime for f in files if (root / f).exists()), default=0)
    checkpoint = max(i["path"].stat().st_mtime for i in items)
    if newest - checkpoint < STALE_MINUTES * 60:
        return None
    names = ", ".join(f"docs/project/wip/{i['slug']}.md" for i in items)
    return (f"Punkt kontrolny ({names}) jest starszy niż zmiany w plikach o ponad {STALE_MINUTES} min. Zanim skończysz, "
            "zaktualizuj go krótko: odhacz zakończone kroki z dowodem, wpisz „Następną czynność” i nowe ustalenia "
            "z rozmowy. Jeśli zadanie jest skończone: `project_record.py wip done <nazwa>`; jeśli wstrzymane: `wip pause <nazwa>`.")


def wip_lines(root: Path, compact: bool) -> list[str]:
    out = []
    for it in wip_items(root):
        m, body = it["meta"], it["body"]
        nxt = first_line(section(body, "Następna czynność"))
        todo = unchecked(body)
        out.append(f"Praca w toku [{m.get('status', 'active')}]: docs/project/wip/{it['slug']}.md — "
                   f"{title(body, it['slug'])} (aktualizacja {m.get('updated', '?')}, kroki do zrobienia: {len(todo)})")
        if nxt:
            out.append(f"  Następna czynność: {nxt}")
        out += [f"  - [ ] {t[:120]}" for t in todo[: 3 if compact else 20]]
    if out:
        out.append("  Wznawiając: przeczytaj cały plik punktu kontrolnego i `git status` — zmiany po ostatnim zapisie mogą "
                   "być niedokończone; sprawdź je, zanim zaczniesz następny krok.")
    return out


# ───────────── CLI ─────────────

# ───────────── dowody (ddd-discovery-intake) ─────────────

SRC_RE = re.compile(r"^##\s+(S\d+)\s+[—-]\s+(.+?)\s*$", re.M)
ENTRY_RE = re.compile(r"^-\s+\*\*(E\d+)\*\*\s*>\s*[„\"“](.+?)[”\"“]\s*[—-]\s*([^\[\n]*?)\s*((?:\[[^\]]*\]\s*)*)$", re.M)
WEAK_TAGS = ("wzmianka", "zastąpiony", "niezweryfikowany")


def _norm(text: str) -> str:
    text = text.replace("„", '"').replace("”", '"').replace("“", '"').replace("’", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip().lower()


def corpus_entries(corpus: Path) -> tuple[dict, list[str]]:
    text = corpus.read_text(encoding="utf-8")
    entries, errors = {}, []
    heads = [(m.start(), m.group(1), m.group(2).strip()) for m in SRC_RE.finditer(text)]
    for m in ENTRY_RE.finditer(text):
        src = next(((sid, path) for pos, sid, path in reversed(heads) if pos < m.start()), (None, None))
        eid = m.group(1)
        if eid in entries:
            errors.append(f"corpus.md: zduplikowane id {eid}")
        tags = [t.strip().lower() for t in re.findall(r"\[([^\]]*)\]", m.group(4) or "")]
        entries[eid] = {"quote": m.group(2), "loc": m.group(3).strip(), "source": src[0], "path": src[1], "tags": tags}
    return entries, errors


def evidence(root: Path) -> tuple[list[str], list[str], dict]:
    rec = record_dir(root)
    corpus = rec / "02-domain" / "corpus.md"
    if not corpus.exists():
        return ["brak docs/project/02-domain/corpus.md"], [], {}
    entries, errors = corpus_entries(corpus)
    warnings: list[str] = []
    cache: dict[str, str | None] = {}
    for eid, e in entries.items():
        if not e["path"]:
            errors.append(f"{eid}: cytat poza sekcją źródła (## S1 — ścieżka)"); continue
        if e["path"] not in cache:
            f = (root / e["path"])
            cache[e["path"]] = f.read_text(encoding="utf-8", errors="ignore") if f.is_file() else None
        src = cache[e["path"]]
        if src is None:
            errors.append(f"{eid}: źródło '{e['path']}' nie istnieje (ścieżka względem katalogu projektu)"); continue
        frags = [f for f in re.split(r"\[(?:…|\.\.\.)\]|…", e["quote"]) if len(f.strip()) >= 3]
        nsrc = _norm(src)
        missing = [f for f in frags if _norm(f) not in nsrc]
        if missing and "niezweryfikowany" not in e["tags"]:
            errors.append(f"{eid}: cytat nie występuje dosłownie w {e['path']}: „{missing[0].strip()[:60]}”")
            continue
        m = re.fullmatch(r"L(\d+)(?:\s*-\s*L?(\d+))?", e["loc"])
        if m and not missing:
            a = int(m.group(1)); b = int(m.group(2) or a)
            window = _norm("\n".join(src.splitlines()[max(0, a - 3): b + 2]))
            if not all(_norm(f) in window for f in frags):
                warnings.append(f"{eid}: cytat jest w źródle, ale nie w miejscu {e['loc']}")
    areas = rec / "02-domain" / "areas.md"
    if areas.exists():
        _, body = parse(areas)
        main_part = re.split(r"^##\s+Kandydaci poniżej progu", body, flags=re.M)[0]
        for m in re.finditer(r"^###\s+(A\d+)\b(.*?)(?=^###\s|^##\s|\Z)", main_part, re.M | re.S):
            aid, block = m.group(1), m.group(2)
            ids = re.findall(r"E\d+", (re.search(r"Dowody:\*?\*?(.*)", block) or [None, ""])[1])
            unknown = [i for i in ids if i not in entries]
            if unknown:
                errors.append(f"areas.md {aid}: nieznane dowody {unknown}")
            strong = [i for i in ids if i in entries and not any(t.startswith(WEAK_TAGS) for t in entries[i]["tags"])]
            sources = {entries[i]["source"] for i in strong}
            user = re.search(r"Wskazany przez człowieka:\*?\*?\s*tak", block, re.I)
            if len(strong) < 3 or len(sources) < 2:
                msg = f"areas.md {aid}: {len(strong)} mocnych cytatów z {len(sources)} źródeł (próg: 3 z 2)"
                (warnings if user else errors).append(msg + (" — wskazany przez człowieka" if user else " — przenieś do „Kandydaci poniżej progu”"))
    contra = rec / "02-domain" / "contradictions.md"
    if contra.exists():
        for i in sorted(set(re.findall(r"\bE\d+\b", contra.read_text(encoding="utf-8")))):
            if i not in entries:
                warnings.append(f"contradictions.md: odwołanie do nieistniejącego cytatu {i}")
    return errors, warnings, {"cytatów": len(entries), "źródeł": len({e["path"] for e in entries.values()})}


def main(argv: list[str]) -> int:
    args = argv[1:]
    root = root_dir()
    if "--hook-session" in args:
        try:
            print(status_text(root, compact=True))
        except Exception:
            pass
        return 0
    if "--hook-snapshot" in args:
        try:
            i = args.index("--hook-snapshot")
            snapshot(root, args[i + 1] if len(args) > i + 1 else "hook")
        except Exception:
            pass
        return 0
    if "--hook-stop" in args:
        try:
            reason = stop_reminder(root, json.load(sys.stdin))
            if reason:
                print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
        except Exception:
            pass
        return 0
    if "--hook-index" in args:
        try:
            data = json.load(sys.stdin)
            path = Path((data.get("tool_input") or {}).get("file_path", "")).resolve()
            rec = record_dir(root)
            if rec in path.parents and path.name != "README.md" and "exports" not in path.parts:
                write_index(root)
        except Exception:
            pass
        return 0
    cmd = args[0] if args else "status"
    if cmd == "init":
        print(f"✓ Utworzono {init(root).relative_to(root)}")
        return 0
    if cmd == "index":
        write_index(root)
        print("✓ Zaktualizowano docs/project/README.md")
        return 0
    if cmd == "status":
        print(status_text(root) or "Brak docs/project/ — uruchom: project_record.py init")
        return 0
    if cmd == "check":
        errors, warnings = check(root)
        for w in warnings:
            print(f"⚠ {w}")
        for e in errors:
            print(f"✗ {e}")
        write_index(root)
        print("✓ Dziennik projektu poprawny" if not errors else f"✗ {len(errors)} błędów")
        return 1 if errors else 0
    if cmd == "log":
        by = args[args.index("--by") + 1] if "--by" in args else "nieznany"
        phase = args[args.index("--phase") + 1] if "--phase" in args else "meta"
        skip = {i for i, a in enumerate(args) if a in ("--by", "--phase")}
        skip |= {i + 1 for i in skip}
        text = " ".join(a for i, a in enumerate(args[1:], 1) if i not in skip)
        if not text:
            print("Podaj treść wpisu"); return 2
        log(root, by, phase, text)
        write_index(root)
        print("✓ Dopisano do journal.md")
        return 0
    if cmd == "wip":
        sub = args[1] if len(args) > 1 else "list"
        by = args[args.index("--by") + 1] if "--by" in args else "nieznany"
        try:
            if sub == "start":
                slug = args[args.index("--slug") + 1] if "--slug" in args else None
                skip = {i for i, a in enumerate(args) if a in ("--by", "--slug")}
                skip |= {i + 1 for i in skip}
                goal = " ".join(a for i, a in enumerate(args[2:], 2) if i not in skip).strip()
                if not goal:
                    print("Podaj cel zadania, np. wip start \"Logowanie przez Google\""); return 2
                print(f"✓ Punkt kontrolny: {wip_start(root, goal, slug, by).relative_to(root)} — uzupełnij cel, kroki i następną czynność")
                return 0
            if sub in ("done", "pause", "block", "resume"):
                if len(args) < 3 or args[2].startswith("--"):
                    print(f"Podaj nazwę: wip {sub} <nazwa>"); return 2
                status = {"done": "done", "pause": "paused", "block": "blocked", "resume": "active"}[sub]
                print(f"✓ {wip_set_status(root, args[2], status, by).relative_to(root)} — status {status}")
                return 0
            if sub == "snapshot":
                print(f"✓ Migawka stanu w {snapshot(root, 'ręcznie')} punktach kontrolnych"); return 0
            if sub == "show":
                items = [i for i in wip_items(root) if len(args) < 3 or i["slug"] == args[2]]
                for it in items:
                    print(it["path"].read_text(encoding="utf-8"))
                if not items:
                    print("Brak pracy w toku")
                return 0
            print("\n".join(wip_lines(root, compact=False)) or "Brak pracy w toku")
            return 0
        except (FileExistsError, FileNotFoundError) as e:
            print(f"✗ {e}"); return 1
    if cmd == "evidence":
        errors, warnings, stats = evidence(root)
        for w in warnings:
            print(f"⚠ {w}")
        for e in errors:
            print(f"✗ {e}")
        print((f"✓ Dowody poprawne ({stats.get('cytatów', 0)} cytatów, {stats.get('źródeł', 0)} źródeł)") if not errors else f"✗ {len(errors)} błędów")
        return 1 if errors else 0
    if cmd == "report":
        out = Path(args[args.index("--out") + 1]) if "--out" in args else None
        print(f"✓ Raport: {report(root, out).relative_to(root) if not out else out}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
