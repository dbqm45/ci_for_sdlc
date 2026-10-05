#!/usr/bin/env python3
"""
Semantic Versioning 2.0.0 (semver.org) bez zgadywania — walidacja, porównanie, podbicie, następna wersja z historii
commitów i kontrola CHANGELOG. Tylko biblioteka standardowa; działa też jako moduł (import).

  python3 semver.py valid 1.0.0-rc.1+build.5          # kod 0 = poprawna, 1 = niepoprawna (z powodem)
  python3 semver.py compare 1.0.0-alpha 1.0.0         # -1 / 0 / 1 (precedencja wg reguły 11; metadane pomijane)
  python3 semver.py sort 1.0.0 1.0.0-rc.1 1.0.0-beta.11 1.0.0-beta.2
  python3 semver.py bump 2.4.1 major|minor|patch      # 3.0.0 / 2.5.0 / 2.4.2
  python3 semver.py bump 1.2.3 pre --id rc            # 1.2.4-rc.1 (kolejne wywołanie na 1.2.4-rc.1 → 1.2.4-rc.2)
  python3 semver.py bump 1.2.4-rc.2 release           # 1.2.4
  python3 semver.py next [--since v1.4.0] [--path packages/api] [--current 1.4.0]
        # podbicie z commitów Conventional Commits od ostatniego tagu vX.Y.Z (lub --since): BREAKING → major,
        # feat → minor, fix/perf → patch; w fazie 0.y.z BREAKING → minor, feat i fix → patch (API niestabilne, reguła 4)
  python3 semver.py check-changelog CHANGELOG.md [--version-file VERSION] [--strict-from 1.35.0]
        # nagłówki „## [X.Y.Z]” poprawne, malejące i bez powtórzeń; najnowszy = plik wersji; od --strict-from rodzaj
        # podbicia zgodny z sekcjami wpisu (Niezgodne/Usunięte → major; Nowe/Wycofywane → co najmniej minor)
"""
from __future__ import annotations

import re
import subprocess
import sys
from functools import cmp_to_key
from pathlib import Path

# Oficjalne wyrażenie z semver.org (wersja z nazwanymi grupami).
SEMVER_RE = re.compile(
    r"^(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+(?P<buildmetadata>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$")


class Version:
    __slots__ = ("major", "minor", "patch", "pre", "build")

    def __init__(self, text: str):
        m = SEMVER_RE.match(text.strip())
        if not m:
            raise ValueError(why_invalid(text))
        self.major, self.minor, self.patch = int(m["major"]), int(m["minor"]), int(m["patch"])
        self.pre = m["prerelease"].split(".") if m["prerelease"] else []
        self.build = m["buildmetadata"] or ""

    def __str__(self) -> str:
        s = f"{self.major}.{self.minor}.{self.patch}"
        return s + (f"-{'.'.join(self.pre)}" if self.pre else "") + (f"+{self.build}" if self.build else "")


def why_invalid(text: str) -> str:
    t = text.strip()
    if t[:1] in "vV" and SEMVER_RE.match(t[1:]):
        return f"„{t}” to nazwa tagu, nie wersja SemVer — wersją jest „{t[1:]}” (FAQ semver.org)"
    core = re.split(r"[-+]", t, maxsplit=1)[0]
    parts = core.split(".")
    if len(parts) != 3:
        return f"„{t}”: wymagane dokładnie trzy liczby X.Y.Z (reguła 2)"
    if any(not p.isdigit() for p in parts):
        return f"„{t}”: X, Y i Z muszą być nieujemnymi liczbami całkowitymi (reguła 2)"
    if any(len(p) > 1 and p.startswith("0") for p in parts):
        return f"„{t}”: liczby bez zer wiodących (reguła 2)"
    return f"„{t}”: niepoprawna wersja przedpremierowa lub metadane — identyfikatory [0-9A-Za-z-], niepuste, liczbowe bez zer wiodących (reguły 9–10)"


def _cmp_ident(a: str, b: str) -> int:
    an, bn = a.isdigit(), b.isdigit()
    if an and bn:
        return (int(a) > int(b)) - (int(a) < int(b))
    if an != bn:
        return -1 if an else 1          # liczbowy identyfikator ma niższą precedencję niż alfanumeryczny
    return (a > b) - (a < b)            # porównanie leksykalne ASCII


def compare(a: str | Version, b: str | Version) -> int:
    """Precedencja wg reguły 11 SemVer 2.0.0; metadane budowania (+…) nie mają znaczenia."""
    va, vb = (a if isinstance(a, Version) else Version(a)), (b if isinstance(b, Version) else Version(b))
    for x, y in ((va.major, vb.major), (va.minor, vb.minor), (va.patch, vb.patch)):
        if x != y:
            return -1 if x < y else 1
    if not va.pre or not vb.pre:
        return 0 if va.pre == vb.pre else (-1 if va.pre else 1)   # wersja przedpremierowa < normalna
    for x, y in zip(va.pre, vb.pre):
        c = _cmp_ident(x, y)
        if c:
            return c
    return (len(va.pre) > len(vb.pre)) - (len(va.pre) < len(vb.pre))


def sort_versions(items: list[str]) -> list[str]:
    return sorted(items, key=cmp_to_key(compare))


def bump(version: str, part: str, pre_id: str = "rc") -> str:
    v = Version(version)
    if part == "major":
        return f"{v.major + 1}.0.0" if not (v.pre and v.minor == 0 and v.patch == 0) else f"{v.major}.0.0"
    if part == "minor":
        return f"{v.major}.{v.minor + 1}.0" if not (v.pre and v.patch == 0) else f"{v.major}.{v.minor}.0"
    if part == "patch":
        return f"{v.major}.{v.minor}.{v.patch + 1}" if not v.pre else f"{v.major}.{v.minor}.{v.patch}"
    if part == "release":
        return f"{v.major}.{v.minor}.{v.patch}"
    if part == "pre":
        if v.pre and v.pre[0] == pre_id and len(v.pre) == 2 and v.pre[1].isdigit():
            return f"{v.major}.{v.minor}.{v.patch}-{pre_id}.{int(v.pre[1]) + 1}"
        if v.pre:
            return f"{v.major}.{v.minor}.{v.patch}-{pre_id}.1"
        return f"{v.major}.{v.minor}.{v.patch + 1}-{pre_id}.1"
    raise ValueError(f"nieznany rodzaj podbicia: {part} (major|minor|patch|pre|release)")


# ───────────── następna wersja z historii commitów (Conventional Commits) ─────────────

HEAD_RE = re.compile(r"^(?P<type>[a-zA-Z]+)(?:\([^)]*\))?(?P<bang>!)?:\s")


def classify(messages: list[str]) -> tuple[str | None, dict]:
    stats = {"breaking": 0, "feat": 0, "fix": 0, "other": 0}
    for msg in messages:
        head = msg.strip().splitlines()[0] if msg.strip() else ""
        m = HEAD_RE.match(head)
        if (m and m["bang"]) or re.search(r"^BREAKING[ -]CHANGE:", msg, re.M):
            stats["breaking"] += 1
        elif m and m["type"].lower() == "feat":
            stats["feat"] += 1
        elif m and m["type"].lower() in ("fix", "perf"):
            stats["fix"] += 1
        else:
            stats["other"] += 1
    kind = "major" if stats["breaking"] else "minor" if stats["feat"] else "patch" if stats["fix"] else None
    return kind, stats


def git(*args: str) -> str:
    r = subprocess.run(["git", *args], capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "git zakończył się błędem")
    return r.stdout


def last_tag() -> str | None:
    tags = [t for t in git("tag", "--list").split() if SEMVER_RE.match(t.lstrip("v"))]
    return max(tags, key=cmp_to_key(lambda a, b: compare(a.lstrip("v"), b.lstrip("v")))) if tags else None


def next_version(current: str, kind: str | None) -> str | None:
    if kind is None:
        return None
    v = Version(current)
    if v.major == 0:                                   # faza 0.y.z: zmiana niezgodna → minor, reszta → patch
        kind = "minor" if kind == "major" else "patch"
    return bump(str(v), kind)


# ───────────── kontrola CHANGELOG ─────────────

ENTRY_RE = re.compile(r"^## \[(?P<v>[^\]]+)\]", re.M)
MAJOR_SECTIONS = re.compile(r"^### (Niezgodne|Usunięte|Breaking|Removed)", re.M | re.I)
MINOR_SECTIONS = re.compile(r"^### (Nowe|Wycofywane|Added|Deprecated)", re.M | re.I)


def bump_kind(prev: Version, new: Version) -> str:
    if new.major != prev.major:
        return "major"
    if new.minor != prev.minor:
        return "minor"
    return "patch"


def check_changelog(text: str, version: str | None = None, strict_from: str | None = None) -> list[str]:
    problems = []
    entries = [(m["v"], m.start()) for m in ENTRY_RE.finditer(text)]
    if not entries:
        return ["brak wpisów „## [X.Y.Z]”"]
    parsed = []
    for i, (v, pos) in enumerate(entries):
        try:
            parsed.append((Version(v), text[pos:entries[i + 1][1] if i + 1 < len(entries) else len(text)]))
        except ValueError as e:
            problems.append(f"wpis [{v}]: {e}")
    for (a, _), (b, _) in zip(parsed, parsed[1:]):
        c = compare(a, b)
        if c == 0:
            problems.append(f"wersja {a} występuje dwa razy — wydanej wersji nie zmienia się (reguła 3)")
        elif c < 0:
            problems.append(f"kolejność: [{a}] stoi nad [{b}], a jest od niej starsza (najnowsza na górze)")
    if version and parsed and str(parsed[0][0]) != version.strip():
        problems.append(f"najnowszy wpis CHANGELOG [{parsed[0][0]}] ≠ wersja w pliku wersji {version.strip()}")
    if strict_from:
        for (new, body), (prev, _) in zip(parsed, parsed[1:]):
            if compare(new, strict_from) < 0 or new.pre:
                continue
            kind = bump_kind(prev, new)
            if MAJOR_SECTIONS.search(body) and kind != "major" and new.major > 0:
                problems.append(f"[{new}]: wpis ma sekcję zmian niezgodnych/usunięć, a wersja podbija {kind} (wymagany major)")
            if MINOR_SECTIONS.search(body) and kind == "patch":
                problems.append(f"[{new}]: wpis ma sekcję Nowe/Wycofywane, a wersja podbija tylko patch (wymagany co najmniej minor)")
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0 if len(argv) >= 2 else 2
    cmd, args = argv[1], argv[2:]

    def opt(name: str, default=None):
        return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default

    try:
        if cmd == "valid":
            Version(args[0])
            print(f"✓ {args[0]}")
            return 0
        if cmd == "compare":
            print(compare(args[0], args[1]))
            return 0
        if cmd == "sort":
            print(" < ".join(sort_versions(args)))
            return 0
        if cmd == "bump":
            print(bump(args[0], args[1], opt("--id", "rc")))
            return 0
        if cmd == "next":
            since = opt("--since") or last_tag()
            current = opt("--current") or (since.lstrip("v") if since else None)
            if not current:
                print("Brak tagu vX.Y.Z — podaj --current <wersja> (nowy projekt zaczyna od 0.1.0).")
                return 2
            rng = [f"{since}..HEAD"] if since else []
            path = ["--", opt("--path")] if opt("--path") else []
            log = git("log", "--format=%B%x00", *rng, *path)
            kind, stats = classify([m for m in log.split("\x00") if m.strip()])
            nxt = next_version(current, kind)
            print(f"od {since or 'początku historii'}: zmiany niezgodne {stats['breaking']}, feat {stats['feat']}, "
                  f"fix/perf {stats['fix']}, inne {stats['other']}")
            print(f"następna wersja: {nxt} ({kind}{', faza 0.y.z' if Version(current).major == 0 else ''})" if nxt
                  else "brak zmian wymagających wydania (tylko docs/chore/test/…)")
            return 0
        if cmd == "check-changelog":
            text = Path(args[0]).read_text(encoding="utf-8")
            vf = opt("--version-file")
            version = Path(vf).read_text(encoding="utf-8").strip() if vf else None
            problems = check_changelog(text, version, opt("--strict-from"))
            for p in problems:
                print(f"✗ {p}")
            print(f"{'✓' if not problems else '✗'} CHANGELOG: {len(ENTRY_RE.findall(text))} wpisów, problemów: {len(problems)}")
            return 1 if problems else 0
    except (ValueError, IndexError, RuntimeError) as e:
        print(f"✗ {e}")
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
