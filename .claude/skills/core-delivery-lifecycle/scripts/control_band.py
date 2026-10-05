#!/usr/bin/env python3
"""
Pasma kontrolne dla metryk produkcji i procesu (faza 9 — utrzymanie). Wykrywanie jest deterministyczne;
model jest wołany dopiero wtedy, gdy ten skrypt zwróci poziom wyższy niż „ok”.

  python3 control_band.py metryka.csv --baseline 30 [--column nazwa] [--side both|upper|lower] [--format json|text]

Wejście: CSV z nagłówkiem (domyślnie pierwsza kolumna liczbowa) albo jedna liczba w wierszu. Pierwsze N punktów
(--baseline) to linia bazowa: z niej średnia i odchylenie standardowe. Reguły Western Electric sprawdzane są na
punktach po linii bazowej:
  1. punkt poza 3σ                                → poziom act      (agent może działać: PR, zatwierdzony runbook)
  2. 2 z 3 kolejnych poza 2σ po tej samej stronie → poziom diagnose (agent diagnozuje tylko do odczytu)
  3. 4 z 5 kolejnych poza 1σ po tej samej stronie → poziom log      (tylko zapis)
  4. 8 kolejnych po jednej stronie średniej       → poziom log
--side upper: liczą się tylko wzrosty (np. odsetek błędów 5xx), lower — tylko spadki (np. odsetek udanych wdrożeń).
Poziomy i progi to propozycja z „The AI-Native SDLC Playbook” (Anthropic, 2026); zmień je w konfiguracji projektu.
Kod wyjścia: 0 — wynik policzony, 2 — błędne dane (np. zerowe odchylenie linii bazowej). Tylko biblioteka standardowa.
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path

TIER_OF_RULE = {1: "act", 2: "diagnose", 3: "log", 4: "log"}
ORDER = ["ok", "log", "diagnose", "act"]
RULE_TEXT = {1: "punkt poza 3σ", 2: "2 z 3 kolejnych poza 2σ po tej samej stronie",
             3: "4 z 5 kolejnych poza 1σ po tej samej stronie", 4: "8 kolejnych po jednej stronie średniej"}


def read_values(path: Path, column: str | None) -> list[float]:
    rows = list(csv.reader(path.read_text(encoding="utf-8").splitlines()))
    if not rows:
        return []
    idx = 0
    start = 0
    try:
        float(rows[0][0])
    except (ValueError, IndexError):
        start = 1
        if column:
            idx = rows[0].index(column)
    return [float(r[idx]) for r in rows[start:] if len(r) > idx and r[idx].strip()]


def counts(side: str, z: float) -> int:
    """+1 / -1 dla strony, którą liczymy; 0 dla strony ignorowanej."""
    s = 1 if z > 0 else -1 if z < 0 else 0
    if side == "upper" and s < 0 or side == "lower" and s > 0:
        return 0
    return s


def evaluate(values: list[float], baseline: int, side: str = "both") -> dict:
    base = values[:baseline]
    if len(base) < 2:
        raise ValueError("linia bazowa musi mieć co najmniej 2 punkty")
    mean = statistics.fmean(base)
    sd = statistics.pstdev(base)
    if sd == 0:
        raise ValueError("odchylenie standardowe linii bazowej wynosi 0 — wydłuż linię bazową albo zmień metrykę")
    pts = values[baseline:]
    z = [(v - mean) / sd for v in pts]
    violations = []

    def add(rule: int, i: int) -> None:
        if not any(v["rule"] == rule and v["index"] == baseline + i for v in violations):
            violations.append({"rule": rule, "index": baseline + i, "value": pts[i], "z": round(z[i], 2),
                               "opis": RULE_TEXT[rule]})

    for i, zi in enumerate(z):
        if counts(side, zi) and abs(zi) > 3:
            add(1, i)
        for rule, window, need, limit in ((2, 3, 2, 2.0), (3, 5, 4, 1.0)):
            if i + 1 >= window:
                w = z[i + 1 - window:i + 1]
                for s in (1, -1):
                    if sum(1 for x in w if counts(side, x) == s and abs(x) > limit) >= need:
                        add(rule, i)
        if i + 1 >= 8:
            w = [counts(side, x) for x in z[i - 7:i + 1]]
            if all(s == 1 for s in w) or all(s == -1 for s in w):
                add(4, i)
    tier = max((TIER_OF_RULE[v["rule"]] for v in violations), key=ORDER.index, default="ok")
    return {"mean": round(mean, 6), "sd": round(sd, 6), "evaluated": len(pts), "side": side,
            "violations": sorted(violations, key=lambda v: (v["index"], v["rule"])), "tier": tier}


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Pasma kontrolne metryki (reguły Western Electric).")
    ap.add_argument("file", type=Path)
    ap.add_argument("--baseline", type=int, required=True, help="liczba pierwszych punktów tworzących linię bazową")
    ap.add_argument("--column")
    ap.add_argument("--side", choices=["both", "upper", "lower"], default="both")
    ap.add_argument("--format", choices=["json", "text"], default="json")
    a = ap.parse_args(argv[1:])
    try:
        result = evaluate(read_values(a.file, a.column), a.baseline, a.side)
    except (ValueError, OSError) as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        return 2
    if a.format == "text":
        print(f"poziom: {result['tier']} · średnia {result['mean']} · σ {result['sd']} · punkty {result['evaluated']}")
        for v in result["violations"]:
            print(f"  reguła {v['rule']} ({v['opis']}): punkt {v['index']}, wartość {v['value']}, z = {v['z']}")
    else:
        print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
