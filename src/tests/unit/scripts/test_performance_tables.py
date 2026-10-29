"""The performance guide's tables, written from a scale run's JSON (HARDEN-07).

The run is a recorded one: the three reports under ``src/tests/fixtures/performance/linux-x64/``
are what ``bench_library.py --statistics``, ``bench_clean.py`` and
``bench_engine_start.py --library 50000`` wrote on a Linux machine. The packaged-app report is
written here, by hand, because no run of the spec has been made yet.
"""

from __future__ import annotations

import copy
import json
import shutil
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPTS = _REPO_ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import performance_tables as tables  # noqa: E402

pytestmark = pytest.mark.unit

FIXTURE = _REPO_ROOT / "src" / "tests" / "fixtures" / "performance"
GUIDE = _REPO_ROOT / "docs" / "user-guide" / "performance.md"


@pytest.fixture()
def results(tmp_path) -> Path:
    """The recorded Linux run, with a commit, in the layout the artifacts download into."""
    folder = tmp_path / "results"
    shutil.copytree(FIXTURE, folder)
    for report in folder.rglob("*.json"):
        data = json.loads(report.read_text(encoding="utf-8"))
        data["run"]["commit"] = "8e16ec2f8a1b"
        report.write_text(json.dumps(data), encoding="utf-8")
    return folder


def _leg(results: Path, leg: str, scale: float, tracks: int | None = None) -> None:
    """A second system: the recorded run with every time multiplied (a test of columns only)."""
    target = results / leg
    shutil.copytree(results / "linux-x64", target)
    for report in target.rglob("*.json"):
        data = json.loads(report.read_text(encoding="utf-8"))
        data["run"]["leg"] = leg
        data["run"]["date"] = "2026-11-02"
        if tracks:
            data["tracks"] = tracks
        for entry in data.get("budget", {}).get("metrics", {}).values():
            entry["value"] = round(entry["value"] * scale, 3)
        report.write_text(json.dumps(data), encoding="utf-8")


def _section(text: str, title: str) -> list[list[str]]:
    """The cells of the table under ``### title``, a list of rows."""
    block = text.split(f"### {title}\n", 1)[1].split("\n### ", 1)[0]
    rows = [
        [cell.strip() for cell in line.strip("|").split("|")]
        for line in block.splitlines()
        if line.startswith("|")
    ]
    return rows[2:]


def _written(results: Path | None) -> str:
    return tables.render(tables.load_runs(results))


class TestTheTables:
    def test_every_area_is_a_table_with_a_column_for_each_system(self):
        text = _written(None)
        for area in tables.AREAS:
            rows = _section(text, area.title)
            assert rows, area.title
            assert all(len(row) == 1 + len(tables.SYSTEMS) for row in rows), area.title
        header = text.split("### Importing and refreshing\n", 1)[1].splitlines()[3]
        assert (
            header == "| What | Windows | Linux | Mac (Apple silicon) | Mac (Intel) |"
        )

    def test_a_guide_with_no_run_says_so_everywhere_and_invents_nothing(self):
        text = _written(None)
        cells = [
            cell
            for area in tables.AREAS
            for row in _section(text, area.title)
            for cell in row[1:]
        ]
        assert set(cells) == {tables.PLACEHOLDER}
        assert "not measured yet" in text
        assert text.count(
            "Runs: Windows: not measured yet; Linux: not measured yet"
        ) == len(tables.AREAS)

    def test_the_recorded_run_fills_the_linux_column_from_its_numbers(self, results):
        text = _written(results)
        library = json.loads(
            (FIXTURE / "linux-x64" / "library.json").read_text(encoding="utf-8")
        )
        metrics = library["budget"]["metrics"]

        imports = {row[0]: row for row in _section(text, "Importing and refreshing")}
        assert imports["Import"][2] == tables.format_value(
            metrics["import_s"]["value"], "s"
        )
        assert imports["Import"][1] == tables.PLACEHOLDER  # no Windows run
        assert imports["The library file"][2] == f"{library['database_mb']:,.0f} MB"

        browse = {row[0]: row for row in _section(text, "Browsing the library")}
        assert browse["Sort by another column"][2] == tables.format_value(
            metrics["browse_sort_ms"]["value"], "ms"
        )

        clean = {row[0]: row for row in _section(text, "Clean")}
        assert clean["Check every file"][2].endswith(" s")
        assert clean["Look for duplicates"][2] == tables.format_value(
            json.loads((FIXTURE / "linux-x64" / "clean.json").read_text())["budget"][
                "metrics"
            ]["duplicates_s"]["value"],
            "s",
        )

    def test_the_start_table_reads_the_launch_timelines(self, results):
        start = {
            row[0]: row
            for row in _section(
                _written(results), "Starting the engine with a full library"
            )
        }
        recorded = json.loads((FIXTURE / "linux-x64" / "engine_start.json").read_text())
        assert start["First `/health`"][2] == "687 ms"
        assert start["A quick check of the library file"][2] == tables.format_value(
            recorded["measured"]["quick_check_s"], "s"
        )
        assert start["The library is ready, one upgrade pending"][2] == "3.6 s"

    def test_the_date_and_the_commit_are_under_the_table(self, results):
        text = _written(results)
        section = text.split("### Clean\n", 1)[1].split("\n### ", 1)[0]
        assert (
            "*Runs: Windows: not measured yet; Linux: 2026-10-29, commit `8e16ec2`;"
            in section
        )

    def test_each_system_has_its_own_column_and_the_newest_run_wins(self, results):
        _leg(results, "macos-x64", 2.5)
        text = _written(results)
        imports = {row[0]: row for row in _section(text, "Importing and refreshing")}
        linux, intel = imports["Import"][2], imports["Import"][4]
        assert linux != intel and intel != tables.PLACEHOLDER
        assert "Mac (Intel): 2026-11-02" in text

        newer = results / "linux-x64-again"
        shutil.copytree(results / "linux-x64", newer)
        for report in newer.rglob("*.json"):
            data = json.loads(report.read_text(encoding="utf-8"))
            data["run"]["date"] = "2026-11-09"
            for entry in data.get("budget", {}).get("metrics", {}).values():
                entry["value"] = 1.0
            report.write_text(json.dumps(data), encoding="utf-8")
        again = {
            row[0]: row
            for row in _section(_written(results), "Importing and refreshing")
        }
        assert again["Import"][2] == "1.0 s"

    def test_a_hundred_thousand_track_run_has_its_own_tables_and_not_the_main_ones(
        self, results
    ):
        _leg(results, "linux-x64-big", 3.0, tracks=100_000)
        for report in (results / "linux-x64-big").rglob("*.json"):
            data = json.loads(report.read_text(encoding="utf-8"))
            data["run"]["leg"] = "linux-x64"
            report.write_text(json.dumps(data), encoding="utf-8")
        shutil.rmtree(results / "linux-x64")
        text = _written(results)
        main = {row[0]: row for row in _section(text, "Importing and refreshing")}
        assert main["Import"][2] == tables.PLACEHOLDER
        above = {
            row[0]: row
            for row in _section(text, "Above 50,000: the library at 100,000 tracks")
        }
        assert above["Import"][2] != tables.PLACEHOLDER

    def test_the_packaged_app_tables_read_the_specs_report(self, results):
        (results / "linux-x64" / "e2e.json").write_text(
            json.dumps(
                {
                    "tracks": 50000,
                    "run": {
                        "leg": "linux-x64",
                        "date": "2026-11-02",
                        "commit": "abc1234",
                    },
                    "measured": {
                        "launch_s": 4.2,
                        "import_s": 19.0,
                        "scroll_end_s": 0.4,
                    },
                    "steps": [
                        {
                            "name": "import",
                            "ms": 19000,
                            "rss": {
                                "main_mb": 90.5,
                                "renderer_mb": 160.0,
                                "engine_mb": 520.2,
                                "mpv_mb": None,
                            },
                        }
                    ],
                    "budget": {
                        "metrics": {
                            "launch_s": {"value": 4.2},
                            "import_s": {"value": 19.0},
                            "scroll_end_s": {"value": 0.4},
                        }
                    },
                }
            ),
            encoding="utf-8",
        )
        text = _written(results)
        app = {row[0]: row for row in _section(text, "The packaged app")}
        assert app["Launch to a usable Library"][2] == "4.2 s"
        assert app["Scroll to the end"][2] == "400 ms"
        assert app["Sort"][2] == tables.PLACEHOLDER  # the report has no such number
        memory = {row[0]: row for row in _section(text, "Memory in the packaged app")}
        assert memory["After the import"][2] == "90 / 160 / 520 / -"
        assert memory["After launch"][2] == tables.PLACEHOLDER

    def test_a_row_a_bench_grew_is_added_to_a_table_of_labelled_rows(self, results):
        report = {
            "tracks": 50000,
            "run": {"leg": "linux-x64", "date": "2026-11-02", "commit": "abc1234"},
            "rows": [
                {
                    "label": "The plan",
                    "value": 12.0,
                    "unit": "ms",
                    "note": "",
                    "budget": None,
                    "over_budget": False,
                },
                {
                    "label": "Something new (3 of them)",
                    "value": 7.0,
                    "unit": "ms",
                    "note": "",
                    "budget": None,
                    "over_budget": False,
                },
            ],
        }
        (results / "linux-x64" / "sets.json").write_text(
            json.dumps(report), encoding="utf-8"
        )
        rows = {row[0]: row for row in _section(_written(results), "Prepare")}
        assert rows["The plan"][2] == "12.0 ms"
        assert rows["Something new"][2] == "7.0 ms"
        assert rows["A gap nothing bridges"][2] == tables.PLACEHOLDER

    def test_the_waveforms_report_reads_its_last_run_and_ignores_the_numbers_in_labels(
        self, results
    ):
        def run(plan):
            return {
                "rows": [
                    {
                        "label": "The store, 50,000 waveforms",
                        "value": 252.1,
                        "unit": "MB",
                        "budget": 260,
                        "over_budget": False,
                    },
                    {
                        "label": "200 states",
                        "value": plan,
                        "unit": "ms p95",
                        "budget": 50,
                        "over_budget": False,
                    },
                ]
            }

        report = {
            "tracks": 50000,
            "run": {"leg": "linux-x64", "date": "2026-11-02", "commit": "abc1234"},
            "runs": [run(30.0), run(23.0)],
        }
        (results / "linux-x64" / "waveforms.json").write_text(
            json.dumps(report), encoding="utf-8"
        )
        rows = {row[0]: row for row in _section(_written(results), "Waveforms")}
        assert rows["The store"][2] == "252 MB"
        assert rows["200 states"][2] == "23.0 ms"


class TestFormatting:
    @pytest.mark.parametrize(
        ("value", "unit", "text"),
        [
            (0.0123, "s", "12 ms"),
            (2.34, "s", "2.3 s"),
            (123.4, "s", "123 s"),
            (1.65, "ms", "1.6 ms"),
            (130.0, "ms", "130 ms"),
            (2112.2, "ms", "2.11 s"),
            (307.6, "mb", "308 MB"),
        ],
    )
    def test_values(self, value, unit, text):
        assert tables.format_value(value, unit) == text


class TestTheGuide:
    def test_the_guide_has_the_markers_and_is_what_the_script_writes(self):
        assert tables.main(["--check"]) == 0

    def test_a_guide_out_of_date_fails_the_check(self, tmp_path, capsys):
        guide = tmp_path / "guide.md"
        text = GUIDE.read_text(encoding="utf-8").replace(
            "| Import |", "| Import (edited) |", 1
        )
        guide.write_text(text, encoding="utf-8")
        assert tables.main(["--guide", str(guide), "--check"]) == 1
        assert "out of date" in capsys.readouterr().err

    def test_the_script_rewrites_only_between_the_markers(self, tmp_path):
        guide = tmp_path / "guide.md"
        guide.write_text(
            f"before\n{tables.BEGIN}\nSTALE-TEXT\n{tables.END}\nafter\n",
            encoding="utf-8",
        )
        assert tables.main(["--guide", str(guide)]) == 0
        written = guide.read_text(encoding="utf-8")
        assert written.startswith(f"before\n{tables.BEGIN}\n\n")
        assert written.endswith(f"{tables.END}\nafter\n")
        assert "STALE-TEXT" not in written

    def test_a_guide_without_the_markers_is_refused(self, tmp_path):
        guide = tmp_path / "guide.md"
        guide.write_text("# nothing\n", encoding="utf-8")
        with pytest.raises(ValueError, match="scale-tables"):
            tables.main(["--guide", str(guide)])

    def test_the_stale_tables_and_the_old_intro_are_gone(self):
        text = GUIDE.read_text(encoding="utf-8")
        assert "10k+" not in text
        assert "## Performance Budgets" not in text
        assert "## Benchmark Targets" not in text
        assert "Startup to ready" not in text
        assert "| 1k tracks |" not in text

    def test_reports_without_a_run_stamp_are_ignored(self, tmp_path):
        (tmp_path / "library.json").write_text(
            json.dumps({"tracks": 50000}), encoding="utf-8"
        )
        (tmp_path / "broken.json").write_text("{", encoding="utf-8")
        assert tables.load_runs(tmp_path) == []

    def test_the_recorded_fixture_is_not_changed_by_a_render(self, results):
        before = copy.deepcopy(
            json.loads(
                (results / "linux-x64" / "library.json").read_text(encoding="utf-8")
            )
        )
        _written(results)
        after = json.loads(
            (results / "linux-x64" / "library.json").read_text(encoding="utf-8")
        )
        assert before == after


class TestTagWrite:
    def test_the_recorded_run_fills_the_tag_write_table(self, results):
        text = _written(results)
        rows = {row[0]: row for row in _section(text, "Writing tags")}
        report = json.loads(
            (FIXTURE / "linux-x64" / "tag_write.json").read_text(encoding="utf-8")
        )
        assert report["tracks"] == 1000
        cell = rows["1,000 files, through the checked copy"][2]
        assert cell == tables.format_value(
            report["budget"]["metrics"]["via_copy_s"]["value"], "s"
        )
        assert rows["1,000 files, through the checked copy"][1] == tables.PLACEHOLDER

    def test_a_leg_with_no_reports_leaves_its_column_as_it_was(self, results):
        text = _written(results)
        windows = {
            row[1] for area in tables.AREAS for row in _section(text, area.title)
        }
        assert windows == {tables.PLACEHOLDER}
