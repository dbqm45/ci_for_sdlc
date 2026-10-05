#!/usr/bin/env python3
"""
Wykrywa stack projektu (wersje frameworków i języków) i porównuje go z wersjami, na których oparte są skille.

  python3 .claude/hooks/detect_stack.py [KATALOG_PROJEKTU]      # raport tekstowy
  python3 .claude/hooks/detect_stack.py --json [KATALOG]        # raport JSON (dla agentów/CI)
  python3 .claude/hooks/detect_stack.py --latest [KATALOG]      # + najnowsze wersje z rejestru npm (sieć)
  python3 .claude/hooks/detect_stack.py --hook                  # tryb hooka SessionStart: tylko gdy jest coś do zrobienia

Źródła wersji: node_modules/<pakiet>/package.json → package-lock.json → zakres w package.json;
Java: pom.xml / build.gradle(.kts) / .java-version; Python: requires-python w pyproject.toml / .python-version;
pakiety PyPI: uv.lock / poetry.lock / pylock.toml / requirements*.txt / pyproject.toml. Wersję skilla opisuje plik skill.meta.json obok SKILL.md.
Tylko biblioteka standardowa — działa bez instalowania pakietów.
"""
from __future__ import annotations

import glob as globmod
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parent
CLAUDE_DIR = HOOKS_DIR.parent
SKILLS_DIR = CLAUDE_DIR / "skills"
REGISTRY = SKILLS_DIR / "core-stack-sync" / "references" / "technologies.json"


# ───────────── wersje ─────────────

def parse_version(text: str | None) -> tuple[int, ...] | None:
    if not text:
        return None
    m = re.search(r"(\d+)(?:\.(\d+))?(?:\.(\d+))?", str(text))
    if not m:
        return None
    return tuple(int(x) for x in m.groups() if x is not None)


def fmt(v: tuple[int, ...] | None) -> str:
    return ".".join(map(str, v)) if v else "?"


def cmp_at(project: tuple[int, ...], ref: tuple[int, ...]) -> int:
    """Porównuje z dokładnością wersji referencyjnej ('22' → major, '6.0' → major.minor)."""
    n = len(ref)
    a = tuple(project[:n]) + (0,) * (n - len(project[:n]))
    return (a > ref) - (a < ref)


def satisfies(version: tuple[int, ...], spec: str) -> bool:
    """Prosty zakres: '>=6.0 <6.1', '>=21', '<7'."""
    for part in spec.split():
        m = re.match(r"(>=|<=|>|<|=)?(.+)", part)
        op, ref = (m.group(1) or "="), parse_version(m.group(2))
        if ref is None:
            continue
        c = cmp_at(version, ref)
        if not {"=": c == 0, ">=": c >= 0, "<=": c <= 0, ">": c > 0, "<": c < 0}[op]:
            return False
    return True


# ───────────── wykrywanie ─────────────

def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def npm_version(root: Path, pkg: str) -> tuple[str | None, str]:
    installed = read_json(root / "node_modules" / pkg / "package.json").get("version")
    if installed:
        return installed, "node_modules"
    lock = read_json(root / "package-lock.json")
    locked = (lock.get("packages") or {}).get(f"node_modules/{pkg}", {}).get("version")
    if locked:
        return locked, "package-lock.json"
    pj = read_json(root / "package.json")
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        spec = (pj.get(section) or {}).get(pkg)
        if spec:
            return spec, f"package.json ({section})"
    return None, ""


def java_version(root: Path) -> tuple[str | None, str]:
    pom = root / "pom.xml"
    if pom.exists():
        text = pom.read_text(encoding="utf-8", errors="ignore")
        for tag in ("maven.compiler.release", "java.version", "maven.compiler.source", "release"):
            m = re.search(rf"<{re.escape(tag)}>\s*([\d.]+)\s*</{re.escape(tag)}>", text)
            if m:
                return m.group(1), f"pom.xml <{tag}>"
        return "", "pom.xml"
    for name in ("build.gradle.kts", "build.gradle"):
        f = root / name
        if f.exists():
            text = f.read_text(encoding="utf-8", errors="ignore")
            for rx in (r"JavaLanguageVersion\.of\((\d+)\)", r"sourceCompatibility\s*=\s*['\"]?(?:JavaVersion\.VERSION_)?([\d_.]+)",
                       r"jvmTarget\s*=\s*['\"]?([\d.]+)"):
                m = re.search(rx, text)
                if m:
                    return m.group(1).replace("_", "."), f"{name}"
            return "", name
    jv = root / ".java-version"
    if jv.exists():
        return jv.read_text().strip(), ".java-version"
    return None, ""


def spring_boot_version(root: Path) -> tuple[str | None, str]:
    pom = root / "pom.xml"
    if pom.exists():
        text = pom.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"<artifactId>spring-boot-starter-parent</artifactId>\s*<version>([^<]+)</version>", text)
        if m:
            return m.group(1), "pom.xml parent"
        if "spring-boot" in text:
            return "", "pom.xml"
    for name in ("build.gradle.kts", "build.gradle"):
        f = root / name
        if f.exists():
            text = f.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"org\.springframework\.boot['\"]?\)?\s*version\s*['\"]([^'\"]+)", text)
            if m:
                return m.group(1), name
            if "org.springframework.boot" in text:
                return "", name
    return None, ""


def kotlin_present(root: Path) -> tuple[str | None, str]:
    for name in ("build.gradle.kts", "build.gradle"):
        f = root / name
        if f.exists():
            text = f.read_text(encoding="utf-8", errors="ignore")
            m = re.search(r"(?:kotlin\(\"jvm\"\)|org\.jetbrains\.kotlin[\w.]*['\"]?\)?)\s*version\s*['\"]([^'\"]+)", text)
            if m:
                return m.group(1), name
            if "org.jetbrains.kotlin" in text or 'kotlin("jvm")' in text:
                return "", name
    return None, ""


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def python_version(root: Path) -> tuple[str | None, str]:
    """Dolna granica requires-python (składnia, której wolno używać) → .python-version (interpreter deweloperski)."""
    m = re.search(r'^\s*requires-python\s*=\s*["\']\s*(?:>=|~=|==)\s*([\d.]+)', _read(root / "pyproject.toml"), re.M)
    if m:
        return m.group(1), "pyproject.toml requires-python"
    pv = _read(root / ".python-version").strip().splitlines()
    if pv and re.match(r"\d", pv[0]):
        return pv[0].strip(), ".python-version"
    for name in ("pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "uv.lock"):
        if (root / name).exists():
            return "", name
    return None, ""


def pypi_version(root: Path, pkg: str) -> tuple[str | None, str]:
    """Wersja pakietu PyPI: uv.lock / poetry.lock / pylock.toml → requirements*.txt → specyfikator w pyproject.toml."""
    for lock in ("uv.lock", "poetry.lock", "pylock.toml"):
        m = re.search(rf'name\s*=\s*"{re.escape(pkg)}"\s*\nversion\s*=\s*"([^"]+)"', _read(root / lock))
        if m:
            return m.group(1), lock
    spec = rf'(?<![\w.-]){re.escape(pkg)}(?:\[[^\]]*\])?\s*(?:==|>=|~=|<=|>)\s*([\d][\w.]*)'
    for req in sorted(root.glob("requirements*.txt")):
        m = re.search(spec, _read(req), re.I)
        if m:
            return m.group(1), req.name
    text = _read(root / "pyproject.toml")
    m = re.search(rf'["\']{spec}', text, re.I)
    if m:
        return m.group(1), "pyproject.toml"
    if re.search(rf'["\']{re.escape(pkg)}["\'\[ ]', text):
        return "", "pyproject.toml"
    return None, ""


def detect(root: Path, tech: dict) -> tuple[bool, str | None, str]:
    d = tech.get("detect", {})
    for pkg in d.get("npm", []):
        v, src = npm_version(root, pkg)
        if v:
            return True, v, src
    for pkg in d.get("pypi", []):
        v, src = pypi_version(root, pkg)
        if v is not None:
            return True, v or None, src
    if d.get("python"):
        v, src = python_version(root)
        if v is not None:
            return True, v or None, src
    if d.get("java"):
        v, src = java_version(root)
        if v is not None:
            return True, v or None, src
    if d.get("spring_boot"):
        v, src = spring_boot_version(root)
        if v is not None:
            return True, v or None, src
    if d.get("kotlin_plugin"):
        v, src = kotlin_present(root)
        if v is not None:
            return True, v or None, src
    for f in d.get("files", []):
        if (root / f).exists():
            return True, None, f
    for pattern in d.get("glob", []):
        if globmod.glob(str(root / pattern)):
            return True, None, pattern
    return False, None, ""


def latest_npm(pkg: str) -> str | None:
    try:
        out = subprocess.run(["npm", "view", pkg, "version"], capture_output=True, text=True, timeout=30)
        return out.stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        return None


# ───────────── analiza ─────────────

def analyze(root: Path, with_latest: bool = False) -> dict:
    registry = read_json(REGISTRY).get("technologies", [])
    found = []
    for tech in registry:
        present, raw, source = detect(root, tech)
        if not present:
            continue
        skill = tech["skill"]
        meta_path = SKILLS_DIR / skill / "skill.meta.json"
        item = {"technology": tech["name"], "skill": skill, "project_version": raw, "source": source}
        if not (SKILLS_DIR / skill / "SKILL.md").exists():
            item["status"] = "MISSING_SKILL"
        elif tech.get("versionless"):
            item["status"] = "OK"
        else:
            meta = read_json(meta_path)
            item["skill_based_on"] = meta.get("based_on")
            item["skill_min_supported"] = meta.get("min_supported")
            pv, based, minimum = parse_version(raw), parse_version(meta.get("based_on")), parse_version(meta.get("min_supported"))
            if not meta:
                item["status"] = "NO_META"
            elif pv is None:
                item["status"] = "UNKNOWN_VERSION"
            elif based and cmp_at(pv, based) > 0:
                item["status"] = "SKILL_OUTDATED"
            elif minimum and cmp_at(pv, minimum) < 0:
                item["status"] = "PROJECT_OLDER"
            else:
                item["status"] = "OK"
            item["_meta"] = meta
            if with_latest and tech.get("detect", {}).get("npm"):
                item["latest"] = latest_npm(tech["detect"]["npm"][0])
        found.append(item)

    # ograniczenia między skillami (np. Angular 22 wymaga TypeScript 6.0.x)
    by_skill = {f["skill"]: f for f in found}
    constraints = []
    for f in found:
        pv = parse_version(f.get("project_version"))
        for major, reqs in ((f.get("_meta") or {}).get("constraints") or {}).items():
            if pv and cmp_at(pv, parse_version(major)) == 0:
                for other, spec in reqs.items():
                    o = by_skill.get(other)
                    ov = parse_version(o.get("project_version")) if o else None
                    constraints.append({
                        "from": f"{f['technology']} {major}", "skill": other, "requires": spec,
                        "project_version": fmt(ov) if ov else None,
                        "ok": bool(ov and satisfies(ov, spec)) if ov else None,
                    })
    for f in found:
        f.pop("_meta", None)
    return {
        "project": str(root),
        "technologies": found,
        "constraints": constraints,
        "suggested_stack": [f["skill"] for f in found if f["status"] != "MISSING_SKILL"],
        "actions_needed": any(f["status"] in ("SKILL_OUTDATED", "PROJECT_OLDER", "MISSING_SKILL", "NO_META") for f in found)
                          or any(c["ok"] is False for c in constraints),
    }


LABEL = {
    "OK": "✓ zgodny",
    "SKILL_OUTDATED": "↑ skill starszy niż projekt — zaktualizuj skill (core-stack-sync)",
    "PROJECT_OLDER": "↓ projekt starszy niż zakres skilla — stosuj tylko funkcje dostępne w tej wersji",
    "MISSING_SKILL": "+ brak skilla — rozważ utworzenie (build.py new-skill)",
    "NO_META": "? skill bez skill.meta.json — nie wiadomo, na jakiej wersji się opiera",
    "UNKNOWN_VERSION": "? nie udało się ustalić wersji w projekcie",
}


def to_text(r: dict) -> str:
    lines = [f"Stack projektu: {r['project']}"]
    for t in r["technologies"]:
        based = f" | skill: {t.get('skill_min_supported', '?')}–{t['skill_based_on']}" if t.get("skill_based_on") else ""
        latest = f" | najnowsza: {t['latest']}" if t.get("latest") else ""
        lines.append(f"  {t['technology']:<12} {str(t['project_version'] or '-'):<14} ({t['source']}){based}{latest}")
        lines.append(f"    {t['skill']}: {LABEL[t['status']]}")
    for c in r["constraints"]:
        mark = "✓" if c["ok"] else ("✗" if c["ok"] is False else "?")
        lines.append(f"  {mark} {c['from']} wymaga {c['skill']} {c['requires']} (w projekcie: {c['project_version'] or 'brak'})")
    lines.append(f"Sugerowany stack persony: {', '.join(r['suggested_stack']) or '—'}")
    return "\n".join(lines)


def to_hook(r: dict) -> str:
    if not r["actions_needed"]:
        return ""
    lines = ["Wykryto stack projektu, który wymaga uwagi przy korzystaniu ze skilli:"]
    for t in r["technologies"]:
        if t["status"] != "OK":
            lines.append(f"- {t['technology']} {t['project_version'] or ''} → {t['skill']}: {LABEL[t['status']]}"
                         + (f" (skill opisuje {t.get('skill_min_supported')}–{t.get('skill_based_on')})" if t.get("skill_based_on") else ""))
    for c in r["constraints"]:
        if c["ok"] is False:
            lines.append(f"- Niezgodność: {c['from']} wymaga {c['skill']} {c['requires']}, a projekt ma {c['project_version']}.")
    lines.append("Przed pracą w tych obszarach zastosuj skill core-stack-sync (nie aktualizuj zależności projektu bez prośby użytkownika).")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = {a for a in argv[1:] if a.startswith("--")}
    if "--hook" in flags:
        try:
            data = json.load(sys.stdin)
        except (json.JSONDecodeError, ValueError):
            data = {}
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or ".")
        try:
            out = to_hook(analyze(root))
        except Exception:  # hook nigdy nie może zablokować startu sesji
            return 0
        if out:
            print(out)
        return 0
    root = Path(args[0] if args else os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
    report = analyze(root, with_latest="--latest" in flags)
    print(json.dumps(report, ensure_ascii=False, indent=2) if "--json" in flags else to_text(report))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
