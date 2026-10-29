#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Time a tag write over N files, in place and through a checked copy (HARDEN-04).

HARDEN-04 makes every tag write work on a copy of the audio file, check it
(tags read back; audio payload byte-identical) and swap it in with
``os.replace``. That costs a copy, two payload hashes and an ``fsync`` per file.
This measures it against the old in-place write, so the step records "before
and after". HARDEN-07 holds the checked copy to a budget (``scripts/budgets.json``): exit
status 1 when 1,000 files take longer than it allows.

The files are generated in a temporary directory from the small recorded tones
under ``src/tests/fixtures/audio`` (MP3 and FLAC, alternating), optionally with
``--audio-mb`` of extra audio appended to each MP3 to see the cost grow with
size. Nothing touches ``~/.cuepoint`` or any real music.

Usage::

    python scripts/bench_tag_write.py                  # 1,000 files
    python scripts/bench_tag_write.py --files 200
    python scripts/bench_tag_write.py --audio-mb 8     # MP3s ~8 MB each
    python scripts/bench_tag_write.py --json           # one JSON object on stdout
    python scripts/bench_tag_write.py --json out.json  # ...or written to a file
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))
sys.path.insert(0, str(_ROOT / "scripts"))

import budget_check  # noqa: E402

FIXTURES = _ROOT / "src" / "tests" / "fixtures" / "audio"
DEFAULT_FILES = 1000


def make_files(folder: Path, count: int, audio_mb: float) -> List[Path]:
    """``count`` small MP3 and FLAC files, alternating."""
    folder.mkdir(parents=True, exist_ok=True)
    padding = b"\x00" * int(audio_mb * 1024 * 1024)
    files: List[Path] = []
    for index in range(count):
        kind = "mp3" if index % 2 == 0 else "flac"
        target = folder / f"track{index:05d}.{kind}"
        shutil.copyfile(FIXTURES / f"tone.{kind}", target)
        if padding and kind == "mp3":
            with open(target, "ab") as handle:
                handle.write(padding)
        files.append(target)
    return files


def write_all(files: List[Path], round_number: int) -> Dict[str, Any]:
    from cuepoint.data.tag_writer import STATUS_OK, write_key_comment_year_to_file

    durations: List[float] = []
    failed = 0
    started = time.perf_counter()
    for index, path in enumerate(files):
        begin = time.perf_counter()
        status, _message = write_key_comment_year_to_file(
            str(path),
            f"{(index % 12) + 1}A",
            f"bench round {round_number}",
            str(2000 + index % 25),
            "Bench Label",
            str(100 + index % 60),
            "House",
        )
        durations.append(time.perf_counter() - begin)
        failed += status != STATUS_OK
    total = time.perf_counter() - started
    durations.sort()
    return {
        "files": len(files),
        "failed": failed,
        "total_seconds": round(total, 3),
        "files_per_second": round(len(files) / total, 1) if total else None,
        "median_ms": round(statistics.median(durations) * 1000, 3),
        "p95_ms": round(durations[int(len(durations) * 0.95) - 1] * 1000, 3),
        "max_ms": round(durations[-1] * 1000, 3),
    }


def run(files: int, audio_mb: float) -> Dict[str, Any]:
    from cuepoint.data import tag_save, tag_writer

    report: Dict[str, Any] = {
        "files": files,
        "audio_mb_added_to_mp3": audio_mb,
        "platform": platform.platform(),
        "python": platform.python_version(),
    }
    with tempfile.TemporaryDirectory(prefix="cuepoint-bench-tags-") as root:
        base = Path(root)
        report["file_bytes_total"] = 0

        original = tag_writer.save_via_copy
        # Before: the writer saves into the file where it lies.
        tag_writer.save_via_copy = lambda path, operation, **_kw: operation(Path(path))
        try:
            before_files = make_files(base / "in_place", files, audio_mb)
            report["file_bytes_total"] = sum(p.stat().st_size for p in before_files)
            report["in_place"] = write_all(before_files, 1)
        finally:
            tag_writer.save_via_copy = original

        # After: copy, check, swap.
        after_files = make_files(base / "via_copy", files, audio_mb)
        report["via_copy"] = write_all(after_files, 1)
        assert tag_writer.save_via_copy is tag_save.save_via_copy

    before = report["in_place"]["total_seconds"]
    after = report["via_copy"]["total_seconds"]
    report["slowdown_factor"] = round(after / before, 2) if before else None
    return report


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--files", type=int, default=DEFAULT_FILES)
    parser.add_argument("--audio-mb", type=float, default=0.0)
    parser.add_argument(
        "--json",
        nargs="?",
        const="-",
        default=None,
        help="print one JSON object, or write it to the file named",
    )
    args = parser.parse_args(argv)

    report = run(args.files, args.audio_mb)
    # The size every report carries as `tracks` (the guide's tables select by it).
    report["tracks"] = args.files
    # The mean 1,000 files take; padded MP3s (--audio-mb) are a different question.
    measured = {"via_copy_s": report["via_copy"]["total_seconds"]}
    report["budget"] = budget_check.evaluate(
        "tag_write",
        measured,
        size=args.files
        if not args.audio_mb
        else budget_check.reference_size("tag_write") + 1,
    )
    problems = report["budget"]["problems"]
    for problem in problems:
        print(f"OVER BUDGET: {problem}", file=sys.stderr)
    if args.json == "-":
        print(json.dumps(report, indent=2))
        return 1 if problems else 0
    if args.json:
        budget_check.write_json(Path(args.json), report)
    print(f"Tag write over {report['files']} files ({report['platform']})")
    for label in ("in_place", "via_copy"):
        row = report[label]
        print(
            f"  {label:9s} {row['total_seconds']:8.2f} s  {row['files_per_second']:8.1f} files/s"
            f"  median {row['median_ms']:.2f} ms  p95 {row['p95_ms']:.2f} ms"
            f"  max {row['max_ms']:.2f} ms  failed {row['failed']}"
        )
    print(f"  checked copy is {report['slowdown_factor']}x the in-place time")
    print("\n".join(budget_check.report_lines(report["budget"])))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
