#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Budgets for the benches, per leg (HARDEN-07, DEC-184).

Every bench measures a few named metrics and hands them to :func:`evaluate`,
which holds each against the budget in ``scripts/budgets.json`` for the machine
it runs on and says what went over. A bench exits 1 when anything did.

**Where a number comes from.** A budget is the Windows number recorded in
``docs/user-guide/performance.md`` times 1.5, or the Phase 15/16 budget where
one exists, or (where nothing was ever recorded) a first estimate from a Linux
run, marked so in ``budgets.json``. Every budget is provisional: it is set per
leg after the first green scale run, and a leg more than twice as slow as the
others is investigated, never loosened.

**Legs.** The four builds the desktop workflow has: ``windows-x64``,
``linux-x64``, ``macos-arm64`` and ``macos-x64``. A leg has a ``scale`` that
multiplies every time budget (the Intel Mac is 2.5, as its runner is) and
``overrides`` that replace single budgets. A size or a ratio is never scaled.

**Sizes.** A budget is for its bench's reference size (50,000 tracks, or 1,000
files for a tag write). A smaller run is held to the same budget (a smaller
library can only be faster); a larger one is recorded and not held, which is
what the 100,000-track run is for.

**Metric names** end in their unit: ``_s`` and ``_ms`` are times, ``_mb`` a size
and ``_x`` a ratio.
"""

from __future__ import annotations

import json
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

BUDGETS_PATH = Path(__file__).with_name("budgets.json")

#: The four legs of ``desktop-electron.yml``.
LEGS = ("windows-x64", "linux-x64", "macos-arm64", "macos-x64")

#: Units whose budgets a slower leg's ``scale`` multiplies.
_TIMED = ("_s", "_ms")

#: ``CUEPOINT_BENCH_LEG`` names the leg when the machine cannot (a test, a run
#: of one leg's budgets on another).
LEG_ENV = "CUEPOINT_BENCH_LEG"


def current_leg() -> str:
    """The leg this machine is, from its system and chip."""
    named = os.environ.get(LEG_ENV, "").strip()
    if named:
        return named
    system = {"Windows": "windows", "Linux": "linux", "Darwin": "macos"}.get(
        platform.system(), platform.system().lower()
    )
    machine = platform.machine().lower()
    chip = "arm64" if machine in ("arm64", "aarch64") else "x64"
    return f"{system}-{chip}"


def load(path: Optional[Path] = None) -> Dict[str, Any]:
    """The budgets file, as written."""
    return json.loads((path or BUDGETS_PATH).read_text(encoding="utf-8"))


def _is_timed(metric: str) -> bool:
    return metric.endswith(_TIMED)


def unit_of(metric: str) -> str:
    """The unit a metric's name ends in (``s``, ``ms``, ``mb`` or ``x``)."""
    return metric.rsplit("_", 1)[-1]


def leg_scale(
    leg: Optional[str] = None, data: Optional[Mapping[str, Any]] = None
) -> float:
    """What a leg multiplies its time budgets by; 1.0 for a leg the file does not know."""
    data = data if data is not None else load()
    return float(data.get("legs", {}).get(leg or current_leg(), {}).get("scale", 1.0))


def scaled_ms(value: float, leg: Optional[str] = None) -> float:
    """``value`` (a time budget a bench already has) with this leg's allowance."""
    return value * leg_scale(leg)


def budgets_for(
    bench: str,
    leg: Optional[str] = None,
    data: Optional[Mapping[str, Any]] = None,
) -> Dict[str, float]:
    """``bench``'s budgets on ``leg``: the base, scaled if timed, then the leg's overrides."""
    data = data if data is not None else load()
    leg = leg or current_leg()
    entry = data["benches"][bench]
    scale = leg_scale(leg, data)
    budgets = {
        name: (float(value) * scale if _is_timed(name) else float(value))
        for name, value in entry["metrics"].items()
    }
    overrides = data.get("legs", {}).get(leg, {}).get("overrides", {}).get(bench, {})
    budgets.update({name: float(value) for name, value in overrides.items()})
    return budgets


def reference_size(bench: str, data: Optional[Mapping[str, Any]] = None) -> int:
    data = data if data is not None else load()
    return int(data["benches"][bench].get("reference", 50_000))


def evaluate(
    bench: str,
    measured: Mapping[str, float],
    *,
    size: int,
    leg: Optional[str] = None,
    data: Optional[Mapping[str, Any]] = None,
    optional: Iterable[str] = (),
) -> Dict[str, Any]:
    """Hold ``measured`` to the budgets.

    Returns the report a bench puts under ``"budget"`` in its JSON::

        {"leg", "provisional", "enforced", "size", "reference",
         "metrics": {name: {"value", "budget", "over"}}, "problems": [..]}

    ``problems`` is empty when nothing is over (or nothing is enforced, for a
    run above the reference size). A metric the file budgets but the run did not
    measure is a problem unless it is named in ``optional``: a bench that stops
    measuring something must not pass for it.
    """
    data = data if data is not None else load()
    leg = leg or current_leg()
    budgets = budgets_for(bench, leg, data)
    reference = reference_size(bench, data)
    enforced = size <= reference
    optional = set(optional)

    metrics: Dict[str, Dict[str, Any]] = {}
    problems: List[str] = []
    for name, value in measured.items():
        budget = budgets.get(name)
        over = bool(enforced and budget is not None and value > budget)
        metrics[name] = {
            "value": round(float(value), 3),
            "budget": None if budget is None else round(budget, 3),
            "over": over,
        }
        if over:
            problems.append(
                f"{bench}: {name} {value:g} is over its budget of {budget:g} on {leg}"
            )
    if enforced:
        for name in budgets:
            if name not in measured and name not in optional:
                problems.append(f"{bench}: {name} has a budget and was not measured")
    return {
        "leg": leg,
        "provisional": data.get("provisional", ""),
        "enforced": enforced,
        "size": size,
        "reference": reference,
        "metrics": metrics,
        "problems": problems,
    }


def report_lines(evaluation: Mapping[str, Any]) -> List[str]:
    """The budget table a bench prints under its own."""
    lines = [
        f"budgets, leg {evaluation['leg']}"
        + (
            ""
            if evaluation["enforced"]
            else " (recorded, not held: above the reference size)"
        )
    ]
    for name, entry in evaluation["metrics"].items():
        budget = "-" if entry["budget"] is None else f"{entry['budget']:g}"
        flag = "  OVER" if entry["over"] else ""
        lines.append(f"  {name:<28}{entry['value']:>12g}{budget:>12}{flag}")
    return lines


def stamp(result: Dict[str, Any]) -> Dict[str, Any]:
    """Add who ran this: the leg, the commit and the day, for the guide's tables."""
    result["run"] = {
        "leg": current_leg(),
        "commit": os.environ.get("CUEPOINT_BUILD_COMMIT")
        or os.environ.get("GITHUB_SHA", ""),
        "date": datetime.now(timezone.utc).date().isoformat(),
        "platform": platform.platform(),
        "python": platform.python_version(),
    }
    return result


def write_json(path: Path, result: Dict[str, Any]) -> None:
    """Write a bench's report with its ``run`` stamp."""
    stamp(result)
    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


def main(argv: Optional[List[str]] = None) -> int:
    """``budget_check.py check BENCH FILE``: hold a report's ``measured`` to the budgets.

    For a report written by something that is not a Python bench (the packaged-app
    spec): reads ``FILE``, evaluates its ``measured`` against ``BENCH`` at its
    ``tracks`` size, writes the ``budget`` and the ``run`` stamp back, and exits 1
    when anything is over.
    """
    import argparse

    parser = argparse.ArgumentParser(description=main.__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=["check"])
    parser.add_argument("bench")
    parser.add_argument("file", type=Path)
    parser.add_argument(
        "--optional", nargs="*", default=[], help="budgeted metrics that may be absent"
    )
    args = parser.parse_args(argv)

    report = json.loads(args.file.read_text(encoding="utf-8"))
    report["budget"] = evaluate(
        args.bench,
        report["measured"],
        size=int(report["tracks"]),
        optional=args.optional,
    )
    write_json(args.file, report)
    print("\n".join(report_lines(report["budget"])))
    for problem in report["budget"]["problems"]:
        print(f"OVER BUDGET: {problem}", file=sys.stderr)
    return 1 if report["budget"]["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
