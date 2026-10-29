#!/usr/bin/env python3
"""Check the v1 acceptance checklist (HARDEN-09, DEC-188).

``docs/release/v1-acceptance.md`` holds one table: every check owed since Phase 5, the
runbook's checks on the built installers and the screen-reader pass, each with where it comes
from, the systems it must pass on, how it is run, its result and the date of the result.

    python scripts/check_acceptance.py             # the table is well formed
    python scripts/check_acceptance.py --release   # ...and nothing is still owed or failing

Without ``--release`` the script only checks the table's shape, so ordinary CI stays green while
checks are owed. With ``--release`` it also exits 1 for every row whose result is ``owed`` or
``fail``: that is the rule that holds back the ``v1.0.0`` tag (DEC-188). ``release.yml`` runs it
for a normal tag and never for a ``-test.N`` tag.

A row's result is one of ``owed``, ``pass``, ``fail`` or ``not applicable (reason)``. Anything
but ``owed`` carries the date it was recorded, as ``YYYY-MM-DD``.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import List, Optional, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOC = PROJECT_ROOT / "docs" / "release" / "v1-acceptance.md"

#: The systems a check can name. Linux is only for automated checks (Q-198, DEC-187).
SYSTEMS = ("Windows", "macOS Apple Silicon", "macOS Intel", "Linux")
#: How a check is run: by CI, by a Claude session driving the machine, or by a person.
HOW = ("CI", "Remote Control", "by hand")
#: What stands in a date cell that has no date yet.
NO_DATE = "-"

HEADER = ("check", "from", "systems", "how", "result", "date")

_NOT_APPLICABLE_RE = re.compile(r"^not applicable \(.+\)$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
#: ``docs/v1/PHASE5_PLAYER.md:1334`` or ``...:1317-1421``.
_REFERENCE_RE = re.compile(r"^(?P<path>[^\s:]+):(?P<first>\d+)(?:-(?P<last>\d+))?$")


@dataclass(frozen=True)
class Row:
    """One checklist row, as written."""

    line: int
    check: str
    sources: str
    systems: str
    how: str
    result: str
    date: str

    @property
    def system_list(self) -> List[str]:
        return _split(self.systems)

    @property
    def how_list(self) -> List[str]:
        return _split(self.how)

    @property
    def references(self) -> List[str]:
        return _split(self.sources)

    @property
    def is_owed(self) -> bool:
        return self.result == "owed"


def _split(cell: str) -> List[str]:
    return [part.strip() for part in re.split(r"[;,]", cell) if part.strip()]


def _cells(line: str) -> List[str]:
    """The cells of a Markdown table row; ``\\|`` is a pipe inside a cell."""
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|") and not body.endswith("\\|"):
        body = body[:-1]
    cells = re.split(r"(?<!\\)\|", body)
    return [cell.replace("\\|", "|").strip() for cell in cells]


def parse(text: str) -> List[Row]:
    """The table's rows. Raises ``ValueError`` when there is no table with the right header."""
    rows: List[Row] = []
    in_table = False
    for number, line in enumerate(text.splitlines(), 1):
        if not line.lstrip().startswith("|"):
            if in_table and rows:
                # A table ends at its first line that is not a row; later tables are prose.
                break
            continue
        cells = _cells(line)
        if not in_table:
            if tuple(cell.lower() for cell in cells) == HEADER:
                in_table = True
            continue
        if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            continue
        if len(cells) != len(HEADER):
            raise ValueError(
                f"line {number}: {len(cells)} cells, the table has {len(HEADER)} columns"
            )
        rows.append(Row(number, *cells))
    if not in_table:
        raise ValueError("no table headed: " + " | ".join(HEADER))
    return rows


def reference_problems(row: Row, root: Path) -> List[str]:
    """Every reference in ``from`` must name a file that exists, at lines it has."""
    problems: List[str] = []
    if not row.references:
        return ["has no reference in `from`"]
    for reference in row.references:
        match = _REFERENCE_RE.match(reference)
        if not match:
            problems.append(
                f"reference '{reference}' is not file:line or file:first-last"
            )
            continue
        path = root / match["path"]
        if not path.is_file():
            problems.append(f"reference '{reference}': {match['path']} does not exist")
            continue
        first = int(match["first"])
        last = int(match["last"] or first)
        count = len(path.read_text(encoding="utf-8").splitlines())
        if first < 1 or last < first or last > count:
            problems.append(
                f"reference '{reference}': {match['path']} has {count} lines"
            )
    return problems


def structure_problems(rows: Sequence[Row], root: Path = PROJECT_ROOT) -> List[str]:
    """What is wrong with the table's shape, one sentence each, row by row."""
    problems: List[str] = []
    if not rows:
        return ["the table has no rows"]
    for row in rows:
        where = f"line {row.line}"
        if not row.check:
            problems.append(f"{where}: no check")
        problems.extend(f"{where}: {p}" for p in reference_problems(row, root))
        systems = row.system_list
        if not systems:
            problems.append(f"{where}: no systems")
        for system in systems:
            if system not in SYSTEMS:
                problems.append(
                    f"{where}: '{system}' is not a system ({', '.join(SYSTEMS)})"
                )
        if len(set(systems)) != len(systems):
            problems.append(f"{where}: a system is named twice")
        hows = row.how_list
        if not hows:
            problems.append(f"{where}: no how")
        for how in hows:
            if how not in HOW:
                problems.append(f"{where}: '{how}' is not a how ({', '.join(HOW)})")
        if not (
            row.result in ("owed", "pass", "fail")
            or _NOT_APPLICABLE_RE.match(row.result)
        ):
            problems.append(
                f"{where}: result '{row.result}' is not owed, pass, fail "
                "or not applicable (reason)"
            )
        problems.extend(f"{where}: {p}" for p in date_problems(row))
    return problems


def date_problems(row: Row) -> List[str]:
    if row.is_owed:
        if row.date not in ("", NO_DATE):
            return [f"owed, so it has no date (write '{NO_DATE}')"]
        return []
    if not _ISO_DATE_RE.match(row.date):
        return [f"date '{row.date}' is not YYYY-MM-DD"]
    try:
        date.fromisoformat(row.date)
    except ValueError:
        return [f"date '{row.date}' is not a real day"]
    return []


def _short(text: str, width: int = 90) -> str:
    return text if len(text) <= width else text[: width - 3].rstrip() + "..."


def release_problems(rows: Sequence[Row]) -> List[str]:
    """Rows that hold back a normal tag: anything still owed or failing."""
    problems = []
    for row in rows:
        if row.is_owed or row.result == "fail":
            problems.append(
                f"line {row.line}: {row.result}: {_short(row.check)} "
                f"({', '.join(row.system_list)})"
            )
    return problems


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Check the v1 acceptance checklist")
    parser.add_argument(
        "--release",
        action="store_true",
        help="Also fail while any check is owed or failing (the rule for a normal tag).",
    )
    parser.add_argument(
        "--doc", type=Path, default=DEFAULT_DOC, help="The checklist file."
    )
    args = parser.parse_args(argv)

    try:
        rows = parse(args.doc.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"{args.doc}: {exc}", file=sys.stderr)
        return 1

    problems = structure_problems(rows)
    if problems:
        print(f"{args.doc} is not well formed:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    owed = [row for row in rows if row.is_owed]
    print(f"{len(rows)} checks; {len(owed)} owed.")
    if args.release:
        held = release_problems(rows)
        if held:
            print(
                f"v1.0.0 cannot be tagged: {len(held)} check(s) are not passing (DEC-188).",
                file=sys.stderr,
            )
            for problem in held:
                print(f"  - {problem}", file=sys.stderr)
            return 1
        print("Every check has passed or does not apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
