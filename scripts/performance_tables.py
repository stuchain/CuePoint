#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Write the performance guide's tables from a scale run's JSON (HARDEN-07, DEC-184).

``scale.yml`` runs every bench and the packaged-app spec on the four build legs and
uploads each bench's JSON. Download them into one folder, one sub-folder a leg (the
artifacts' own layout), and this fills the guide's "Measured on every system" section:
one table for each area, one column for each system, and under each table the date and
the commit of the run behind every column.

Nothing is written that was not measured. A cell whose system has no run reads
"measured at first scale run", and a guide made before any run is all of those.

The tables sit between two marker lines in ``docs/user-guide/performance.md``; the rest of
the guide is prose and is not touched.

Usage::

    python scripts/performance_tables.py scale-results            # rewrite the guide
    python scripts/performance_tables.py scale-results --check    # exit 1 if it is out of date
    python scripts/performance_tables.py                          # no results yet: the placeholders

A report is a JSON file written by a bench with ``--json`` (it carries a ``run`` stamp with
the leg, the commit and the day, and a ``tracks`` size); the bench is the file's name
(``library.json``, ``clean.json``, ``engine_start.json``, ``e2e.json`` ...). The 50,000-track
tables use the runs of 50,000 tracks and the "Above 50,000" table those of 100,000.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parent.parent
GUIDE = ROOT / "docs" / "user-guide" / "performance.md"

BEGIN = "<!-- scale-tables:begin (written by scripts/performance_tables.py; do not edit) -->"
END = "<!-- scale-tables:end -->"

PLACEHOLDER = "measured at first scale run"

#: The four legs, in the order the columns run, and what the guide calls them.
SYSTEMS: Tuple[Tuple[str, str], ...] = (
    ("windows-x64", "Windows"),
    ("linux-x64", "Linux"),
    ("macos-arm64", "Mac (Apple silicon)"),
    ("macos-x64", "Mac (Intel)"),
)

REFERENCE_TRACKS = 50_000
ABOVE_TRACKS = 100_000


@dataclass(frozen=True)
class Run:
    """One bench's report from one leg."""

    bench: str
    leg: str
    tracks: int
    date: str
    commit: str
    data: Dict[str, Any]


# ---------------------------------------------------------------------------
# Reading the runs
# ---------------------------------------------------------------------------


def load_runs(root: Optional[Path]) -> List[Run]:
    """Every report under ``root`` that carries a ``run`` stamp."""
    runs: List[Run] = []
    if root is None or not root.exists():
        return runs
    for path in sorted(root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        stamp = data.get("run") if isinstance(data, dict) else None
        if not isinstance(stamp, dict) or "tracks" not in data:
            continue
        runs.append(
            Run(
                bench=path.stem,
                leg=str(stamp.get("leg", "")),
                tracks=int(data["tracks"]),
                date=str(stamp.get("date", "")),
                commit=str(stamp.get("commit", ""))[:7],
                data=data,
            )
        )
    return runs


def newest(runs: Sequence[Run], bench: str, leg: str, tracks: int) -> Optional[Run]:
    """The latest run of ``bench`` on ``leg`` at ``tracks`` (a later date wins)."""
    found = [r for r in runs if (r.bench, r.leg, r.tracks) == (bench, leg, tracks)]
    return max(found, key=lambda r: r.date) if found else None


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------


def format_value(value: float, unit: str) -> str:
    """``value`` in ``unit`` (``s``, ``ms`` or ``mb``) the way the guide writes it."""
    if unit == "mb":
        return f"{value:,.0f} MB"
    if unit == "ms":
        if value >= 1000:
            return f"{value / 1000:,.2f} s"
        return f"{value:.1f} ms" if value < 100 else f"{value:.0f} ms"
    if unit == "s":
        if value < 1:
            return f"{value * 1000:.0f} ms"
        return f"{value:.1f} s" if value < 100 else f"{value:.0f} s"
    return f"{value:g} {unit}"


Getter = Callable[[Dict[str, Any]], Optional[str]]


def metric(name: str) -> Getter:
    """A cell that reads a budgeted metric from the report's ``budget``."""

    def read(data: Dict[str, Any]) -> Optional[str]:
        entry = data.get("budget", {}).get("metrics", {}).get(name)
        if entry is None:
            return None
        unit = name.rsplit("_", 1)[-1]
        return format_value(float(entry["value"]), unit)

    return read


def field(key: str, unit: str) -> Getter:
    """A cell that reads a top-level number."""

    def read(data: Dict[str, Any]) -> Optional[str]:
        value = data.get(key)
        return None if value is None else format_value(float(value), unit)

    return read


def timeline(key: str, which: str) -> Getter:
    """The median of a launch timeline's ``which`` (milliseconds) over its runs."""

    def read(data: Dict[str, Any]) -> Optional[str]:
        values = [r[which] for r in data.get(key, []) if r.get(which) is not None]
        if not values:
            return None
        values.sort()
        return format_value(float(values[len(values) // 2]), "ms")

    return read


def step_memory(step: str) -> Getter:
    """``main / renderer / engine / mpv`` in MB after one step of the packaged-app run."""

    def read(data: Dict[str, Any]) -> Optional[str]:
        for entry in data.get("steps", []):
            if entry.get("name") == step:
                rss = entry["rss"]
                parts = [
                    "-" if rss.get(key) is None else f"{rss[key]:,.0f}"
                    for key in ("main_mb", "renderer_mb", "engine_mb", "mpv_mb")
                ]
                return " / ".join(parts)
        return None

    return read


_LABEL_NUMBERS = re.compile(r"\s*\(.*\)$")


def normal_label(label: str) -> str:
    """A row's label without the numbers a run puts in it (its size, its marks a track)."""
    label = _LABEL_NUMBERS.sub("", label)
    label = re.sub(r"^The store, .* waveforms$", "The store", label)
    label = re.sub(
        r"^A detail written at a full cap.*$", "A detail written at a full cap", label
    )
    return re.sub(r"^The work list, a refill of \d+$", "The work list, a refill", label)


def rows_of(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The labelled rows of a report; a waveforms report holds its last run's."""
    if "runs" in data:
        return list(data["runs"][-1]["rows"])
    return list(data.get("rows", []))


def row_cell(data: Dict[str, Any], label: str) -> Optional[str]:
    for row in rows_of(data):
        if normal_label(row["label"]) == label:
            unit = str(row["unit"])
            value = float(row["value"])
            if unit.startswith("ms"):
                return format_value(value, "ms")
            if unit in ("s", "MB"):
                return format_value(value, unit.lower())
            return f"{value:g} {unit}"
    return None


# ---------------------------------------------------------------------------
# The areas
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Area:
    """One table: a bench, a size, and the rows."""

    title: str
    bench: str
    note: str
    rows: Tuple[Tuple[str, Getter], ...]
    tracks: int = REFERENCE_TRACKS


def _by_label(labels: Sequence[str]) -> Tuple[Tuple[str, Getter], ...]:
    return tuple(
        (label, (lambda data, label=label: row_cell(data, label))) for label in labels
    )


IMPORT_AND_REFRESH = Area(
    "Importing and refreshing",
    "library",
    "`scripts/bench_library.py`: a generated 50,000-track collection, 250 playlists and 175,000 playlist entries.",
    (
        ("Import", metric("import_s")),
        ("Re-import the same file", metric("reimport_s")),
        ("Check for changes, nothing changed", metric("refresh_unchanged_ms")),
        ("Check for changes, something changed", metric("refresh_diff_s")),
        ("Apply a refresh", metric("refresh_apply_s")),
        ("The library file", field("database_mb", "mb")),
    ),
)

BROWSING = Area(
    "Browsing the library",
    "library",
    "The queries behind the Library table, `scripts/bench_library.py`; the slowest of the cases in each row.",
    (
        ("Open the library", metric("browse_first_page_ms")),
        ("Scroll to the very end", metric("browse_deep_page_ms")),
        ("Sort by another column", metric("browse_sort_ms")),
        ("Type a search term", metric("search_page_ms")),
        ("Count what a search finds", metric("search_count_ms")),
        ("Select a playlist", metric("browse_playlist_ms")),
        ("Select a folder of playlists", metric("browse_folder_ms")),
    ),
)

FILTERING = Area(
    "Filtering the library",
    "library",
    "Filters and the lists of choices behind them, `scripts/bench_library.py`.",
    (
        ("Apply a filter, or add rules to it", metric("filter_ms")),
        ("Open the rating or artist list", metric("facet_small_ms")),
        ("Open the genre or label list", metric("facet_list_ms")),
        ("Re-open a list while other filters are on", metric("facet_filtered_ms")),
        ("Read the BPM range", metric("facet_range_ms")),
    ),
)

STATISTICS = Area(
    "The Statistics page",
    "library",
    "`scripts/bench_library.py --statistics`: a year of weekly play history and a waveform store; the slowest case of each route.",
    (
        ("Plays", metric("statistics_plays_ms")),
        ("Spreads", metric("statistics_spreads_ms")),
        ("Health", metric("statistics_health_ms")),
    ),
)

CLEAN = Area(
    "Clean",
    "clean",
    "`scripts/bench_clean.py`: 50,000 tracks with 30,000 matched (40 candidates each), 8,000 decisions, 10,000 of your own values, 2,000 missing files and 1,500 duplicate groups.",
    (
        ("Open Health, every count", metric("health_report_ms")),
        ("One Health count (the slowest)", metric("health_count_ms")),
        ("Check every file", metric("file_check_s")),
        ("Look for duplicates", metric("duplicates_s")),
    ),
)

SETS = Area(
    "Prepare",
    "sets",
    "`scripts/bench_sets.py`: a Set at its largest, 1,000 entries in 10 chapters.",
    _by_label(
        (
            "m0025 on a version-24 library",
            "The plan",
            "The running order, as the route sends it",
            "The checks",
            "The checks, with their wire object",
            "Suggestions at a dense gap, the whole library",
            "The same, as the route sends it",
            "The same, 200 suggestions",
            "After the last entry",
            "A gap nothing bridges",
        )
    ),
)

MARKS = Area(
    "Cue points and beat grids",
    "marks",
    "`scripts/bench_marks.py`: a typical collection and one where every track is prepared. A read is shown as its multiple of reading the tracks alone.",
    _by_label(
        (
            "Read, typical",
            "Read, prepared",
            "Import, prepared",
            "Refresh preview, prepared, one cue moved",
            "Backfill, prepared",
        )
    ),
)

WAVEFORMS = Area(
    "Waveforms",
    "waveforms",
    "`scripts/bench_waveforms.py`: every file has a waveform, its loudness and eight marks; a timing is the slowest of the common case (p95).",
    _by_label(
        (
            "The store",
            "200 states",
            "200 pictures at width 120",
            "One picture at 1,200",
            "One picture at 1,200 with its marks",
            "The work list, a refill",
            "The work list, a count",
            "A six-minute detail, reduce and encode",
            "One detail, read and decode",
            "The marks read, typical",
            "The marks read, prepared",
        )
    ),
)

MIGRATIONS = Area(
    "Upgrading a library",
    "migrations",
    "`scripts/bench_migrations.py` and `scripts/bench_search_keys.py`: the first start after an update waits for these.",
    (
        ("Sets: m0025 rebuilds the Collection tables", metric("m0025_s")),
        ("Play history: m0027 seeds the baseline read", metric("m0027_s")),
    ),
)

SEARCH_KEYS = Area(
    "Accents and search keys",
    "search_keys",
    "`scripts/bench_search_keys.py`: path keys in one Unicode form (m0032) and the folded search and sort keys (m0033).",
    (
        ("m0032 rewrites the path keys", metric("m0032_s")),
        ("m0033 fills the search and sort keys", metric("m0033_s")),
        ("Search for a name", metric("search_ms")),
        ("Count what a search finds", metric("search_count_ms")),
        ("Open the library", metric("browse_first_page_ms")),
        ("Scroll to the very end", metric("browse_deep_page_ms")),
    ),
)

START = Area(
    "Starting the engine with a full library",
    "engine_start",
    "`scripts/bench_engine_start.py --library 50000`: the packaged engine on a library with Clean's data and waveforms. The engine answers `/health` as soon as it is listening, then takes the launch backup and works out the library's state.",
    (
        ("First `/health`", timeline("none_pending", "first_health_ms")),
        ("The launch backup is made", metric("launch_backup_s")),
        ("The library is ready, nothing to upgrade", metric("state_ok_s")),
        ("The library is ready, one upgrade pending", metric("pending_state_ok_s")),
        (
            "Of that, the upgrade and the checks after the copy",
            metric("pending_migrate_s"),
        ),
        ("A quick check of the library file", metric("quick_check_s")),
    ),
)

TAG_WRITE = Area(
    "Writing tags",
    "tag_write",
    "`scripts/bench_tag_write.py`: 1,000 files written in place and through the checked copy.",
    (
        ("1,000 files, through the checked copy", metric("via_copy_s")),
        ("1,000 files, in place", lambda data: _in_place(data)),
    ),
    tracks=1000,
)


def _in_place(data: Dict[str, Any]) -> Optional[str]:
    seconds = data.get("in_place", {}).get("total_seconds")
    return None if seconds is None else format_value(float(seconds), "s")


APP_TIMES = Area(
    "The packaged app",
    "e2e",
    "`e2e/libraryScale.spec.ts` against the packaged app, one session.",
    (
        ("Launch to a usable Library", metric("launch_s")),
        ('Import 50,000 tracks, to "Imported"', metric("import_s")),
        ("Scroll to the end", metric("scroll_end_s")),
        ("Type a search and see its first row", metric("search_s")),
        ("Sort", metric("sort_s")),
        ("Open the Statistics page", metric("statistics_s")),
        ("Open its Health tab", metric("statistics_health_s")),
        ("Quit and launch again on the full library", metric("relaunch_s")),
    ),
)

APP_MEMORY = Area(
    "Memory in the packaged app",
    "e2e",
    "Resident memory read from the operating system after each step, in MB: main / renderer / engine / mpv (`-` when no player was running).",
    (
        ("After launch", step_memory("launch")),
        ("After the import", step_memory("import")),
        ("After scrolling to the end", step_memory("scroll_end")),
        ("After the search", step_memory("search")),
        ("After the sort", step_memory("sort")),
        ("After the Statistics page", step_memory("statistics")),
        ("After launching again on the full library", step_memory("relaunch")),
    ),
)

ABOVE_50K = (
    Area(
        "Above 50,000: the library at 100,000 tracks",
        "library",
        "The same run at 100,000 tracks, recorded and not held to a budget. The largest library CuePoint supports stays 50,000.",
        (
            ("Import", metric("import_s")),
            ("Apply a refresh", metric("refresh_apply_s")),
            ("Scroll to the very end", metric("browse_deep_page_ms")),
            ("Sort by another column", metric("browse_sort_ms")),
            ("Type a search term", metric("search_page_ms")),
        ),
        tracks=ABOVE_TRACKS,
    ),
    Area(
        "Above 50,000: the engine's start at 100,000 tracks",
        "engine_start",
        "A full library at 100,000 tracks, as above.",
        (
            ("The library is ready", metric("state_ok_s")),
            ("A quick check of the library file", metric("quick_check_s")),
        ),
        tracks=ABOVE_TRACKS,
    ),
    Area(
        "Above 50,000: the packaged app at 100,000 tracks",
        "e2e",
        "A full library at 100,000 tracks, as above.",
        (
            ("Import", metric("import_s")),
            ("Scroll to the end", metric("scroll_end_s")),
            ("Type a search and see its first row", metric("search_s")),
            ("Sort", metric("sort_s")),
            ("Open the Statistics page", metric("statistics_s")),
            (
                "Resident memory after the Statistics page: main / renderer / engine / mpv",
                step_memory("statistics"),
            ),
        ),
        tracks=ABOVE_TRACKS,
    ),
)

AREAS: Tuple[Area, ...] = (
    IMPORT_AND_REFRESH,
    BROWSING,
    FILTERING,
    STATISTICS,
    CLEAN,
    SETS,
    MARKS,
    WAVEFORMS,
    MIGRATIONS,
    SEARCH_KEYS,
    START,
    TAG_WRITE,
    APP_TIMES,
    APP_MEMORY,
) + ABOVE_50K


# ---------------------------------------------------------------------------
# Building the tables
# ---------------------------------------------------------------------------


#: The benches whose report is a list of labelled rows rather than named metrics.
LABELLED_BENCHES = ("sets", "marks", "waveforms")


def _extra_labels(area: Area, runs: Sequence[Run]) -> List[str]:
    """Rows a report has that the area did not list (a bench grew a measurement)."""
    if area.bench not in LABELLED_BENCHES:
        return []
    known = {label for label, _ in area.rows}
    extra: List[str] = []
    for leg, _ in SYSTEMS:
        run = newest(runs, area.bench, leg, area.tracks)
        if run is None:
            continue
        for row in rows_of(run.data):
            label = normal_label(row["label"])
            if label not in known and label not in extra:
                extra.append(label)
    return extra


def table(area: Area, runs: Sequence[Run]) -> str:
    """One area as a heading, its note, a table and the line saying which runs it shows."""
    rows = list(area.rows)
    for label in _extra_labels(area, runs):
        rows.append((label, lambda data, label=label: row_cell(data, label)))
    found = {leg: newest(runs, area.bench, leg, area.tracks) for leg, _ in SYSTEMS}

    lines = [f"### {area.title}", "", area.note, ""]
    lines.append("| What | " + " | ".join(name for _, name in SYSTEMS) + " |")
    lines.append("| --- | " + " | ".join("---" for _ in SYSTEMS) + " |")
    for label, getter in rows:
        cells = []
        for leg, _ in SYSTEMS:
            run = found[leg]
            cell = getter(run.data) if run is not None else None
            cells.append(cell if cell is not None else PLACEHOLDER)
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    lines += ["", _caption(found)]
    return "\n".join(lines)


def _caption(found: Dict[str, Optional[Run]]) -> str:
    parts = []
    for leg, name in SYSTEMS:
        run = found[leg]
        if run is None:
            parts.append(f"{name}: not measured yet")
        else:
            commit = f", commit `{run.commit}`" if run.commit else ""
            parts.append(f"{name}: {run.date}{commit}")
    return "*Runs: " + "; ".join(parts) + ".*"


def render(runs: Sequence[Run]) -> str:
    """Everything between the markers."""
    parts = [
        "Every number in this section is from one scale run (`.github/workflows/scale.yml`), "
        "made on the same commit for every system. The tables are written by "
        "`scripts/performance_tables.py` from the run's JSON; a cell that says "
        f'"{PLACEHOLDER}" has no run behind it yet.',
    ]
    parts += [table(area, runs) for area in AREAS]
    return "\n\n".join(parts)


def rewrite(guide_text: str, runs: Sequence[Run]) -> str:
    """``guide_text`` with the section between the markers replaced."""
    begin = guide_text.find(BEGIN)
    end = guide_text.find(END)
    if begin == -1 or end == -1 or end < begin:
        raise ValueError(f"the guide needs the lines {BEGIN!r} and {END!r}")
    return (
        guide_text[: begin + len(BEGIN)]
        + "\n\n"
        + render(runs)
        + "\n\n"
        + guide_text[end:]
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "results",
        nargs="?",
        type=Path,
        default=None,
        help="a folder of the run's JSON reports",
    )
    parser.add_argument("--guide", type=Path, default=GUIDE)
    parser.add_argument(
        "--check", action="store_true", help="exit 1 if the guide is out of date"
    )
    args = parser.parse_args(argv)

    runs = load_runs(args.results)
    current = args.guide.read_text(encoding="utf-8")
    updated = rewrite(current, runs)
    if args.check:
        if updated != current:
            print(
                f"{args.guide} is out of date: run scripts/performance_tables.py",
                file=sys.stderr,
            )
            return 1
        return 0
    args.guide.write_text(updated, encoding="utf-8", newline="\n")
    print(f"{args.guide}: {len(runs)} reports, {len(AREAS)} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
