"""The benches' budgets (HARDEN-07, DEC-184).

Every bench exits 1 when a number is over its budget and 0 when it is under, on a library
of a few hundred tracks with the clock faked: a clock that runs a millisecond a call is
under every budget, and one that runs a thousand seconds a call is over all of them. The
budgets themselves (``scripts/budgets.json``) are held to their rules: four legs that are
the desktop workflow's four legs, the Intel Mac's scale, no override for a metric that does
not exist.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPTS = _REPO_ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import budget_check  # noqa: E402

pytestmark = pytest.mark.unit

UNDER = 1e-3
OVER = 1000.0


class Clock:
    """A ``time.perf_counter`` that moves ``step`` seconds every time it is read."""

    def __init__(self, step: float) -> None:
        self.step = step
        self.now = 0.0

    def __call__(self) -> float:
        self.now += self.step
        return self.now


@pytest.fixture(scope="module")
def data() -> dict:
    return budget_check.load()


# ---------------------------------------------------------------------------
# The rules
# ---------------------------------------------------------------------------

FILE = {
    "provisional": "test",
    "legs": {
        "linux-x64": {"scale": 1.0, "overrides": {}},
        "macos-x64": {"scale": 2.5, "overrides": {"demo": {"fixed_s": 99}}},
    },
    "benches": {
        "demo": {
            "reference": 1000,
            "metrics": {"load_s": 10, "page_ms": 20, "size_mb": 100, "fixed_s": 5},
        }
    },
}


class TestTheRules:
    def test_times_are_scaled_for_a_leg_and_sizes_are_not(self):
        linux = budget_check.budgets_for("demo", "linux-x64", FILE)
        intel = budget_check.budgets_for("demo", "macos-x64", FILE)
        assert linux == {"load_s": 10, "page_ms": 20, "size_mb": 100, "fixed_s": 5}
        assert intel["load_s"] == 25 and intel["page_ms"] == 50
        assert intel["size_mb"] == 100

    def test_an_override_replaces_the_scaled_budget(self):
        assert budget_check.budgets_for("demo", "macos-x64", FILE)["fixed_s"] == 99

    def test_a_leg_the_file_does_not_know_is_not_scaled(self):
        assert budget_check.budgets_for("demo", "plan9-x64", FILE)["load_s"] == 10

    def test_over_is_named_and_under_is_quiet(self):
        under = budget_check.evaluate(
            "demo",
            {"load_s": 9, "page_ms": 20},
            size=1000,
            leg="linux-x64",
            data=FILE,
            optional=["size_mb", "fixed_s"],
        )
        assert under["problems"] == []
        over = budget_check.evaluate(
            "demo",
            {"load_s": 11, "page_ms": 20},
            size=1000,
            leg="linux-x64",
            data=FILE,
            optional=["size_mb", "fixed_s"],
        )
        assert len(over["problems"]) == 1
        assert "load_s" in over["problems"][0] and "linux-x64" in over["problems"][0]
        assert over["metrics"]["load_s"]["over"] is True

    def test_a_slower_leg_gets_its_scale(self):
        measured = {"load_s": 20, "page_ms": 20, "size_mb": 1, "fixed_s": 1}
        assert budget_check.evaluate(
            "demo", measured, size=1000, leg="linux-x64", data=FILE
        )["problems"]
        assert (
            budget_check.evaluate(
                "demo", measured, size=1000, leg="macos-x64", data=FILE
            )["problems"]
            == []
        )

    def test_a_run_above_the_reference_size_is_recorded_and_not_held(self):
        result = budget_check.evaluate(
            "demo", {"load_s": 1e6}, size=2000, leg="linux-x64", data=FILE
        )
        assert result["enforced"] is False
        assert result["problems"] == []
        assert result["metrics"]["load_s"] == {
            "value": 1e6,
            "budget": 10.0,
            "over": False,
        }

    def test_a_smaller_run_is_held_to_the_same_budget(self):
        result = budget_check.evaluate(
            "demo",
            {"load_s": 11},
            size=10,
            leg="linux-x64",
            data=FILE,
            optional=["page_ms", "size_mb", "fixed_s"],
        )
        assert result["enforced"] and result["problems"]

    def test_a_budget_the_run_did_not_measure_is_a_problem_unless_optional(self):
        result = budget_check.evaluate(
            "demo", {"load_s": 1}, size=1000, leg="linux-x64", data=FILE
        )
        assert {p.split(":")[1].split()[0] for p in result["problems"]} == {
            "page_ms",
            "size_mb",
            "fixed_s",
        }
        result = budget_check.evaluate(
            "demo",
            {"load_s": 1},
            size=1000,
            leg="linux-x64",
            data=FILE,
            optional=["page_ms", "size_mb", "fixed_s"],
        )
        assert result["problems"] == []

    def test_a_metric_without_a_budget_is_recorded(self):
        result = budget_check.evaluate(
            "demo",
            {"load_s": 1, "extra_ms": 5},
            size=1000,
            leg="linux-x64",
            data=FILE,
            optional=["page_ms", "size_mb", "fixed_s"],
        )
        assert result["metrics"]["extra_ms"]["budget"] is None

    def test_the_leg_is_named_by_the_system_and_the_chip(self, monkeypatch):
        monkeypatch.delenv(budget_check.LEG_ENV)
        for system, machine, leg in (
            ("Windows", "AMD64", "windows-x64"),
            ("Linux", "x86_64", "linux-x64"),
            ("Darwin", "arm64", "macos-arm64"),
            ("Darwin", "x86_64", "macos-x64"),
        ):
            monkeypatch.setattr(budget_check.platform, "system", lambda s=system: s)
            monkeypatch.setattr(budget_check.platform, "machine", lambda m=machine: m)
            assert budget_check.current_leg() == leg

    def test_a_report_is_stamped_with_who_ran_it(self, monkeypatch, tmp_path):
        monkeypatch.setenv("GITHUB_SHA", "abcdef1234567890")
        out = tmp_path / "r.json"
        budget_check.write_json(out, {"tracks": 1})
        run = json.loads(out.read_text())["run"]
        assert run["leg"] == "linux-x64" and run["commit"] == "abcdef1234567890"
        assert len(run["date"]) == 10

    def test_the_command_line_holds_a_report_to_a_bench(self, tmp_path, capsys):
        report = tmp_path / "e2e.json"
        report.write_text(
            json.dumps({"tracks": 50000, "measured": {"launch_s": 1, "main_mb": 10}}),
            encoding="utf-8",
        )
        everything_else = [
            name
            for name in budget_check.load()["benches"]["e2e"]["metrics"]
            if name not in ("launch_s", "main_mb")
        ]
        assert (
            budget_check.main(
                ["check", "e2e", str(report), "--optional", *everything_else]
            )
            == 0
        )
        written = json.loads(report.read_text())
        assert (
            written["budget"]["problems"] == [] and written["run"]["leg"] == "linux-x64"
        )

        report.write_text(
            json.dumps({"tracks": 50000, "measured": {"launch_s": 9999}}),
            encoding="utf-8",
        )
        assert (
            budget_check.main(
                ["check", "e2e", str(report), "--optional", *everything_else, "main_mb"]
            )
            == 1
        )
        assert "OVER BUDGET" in capsys.readouterr().err


class TestTheBudgetsFile:
    def test_the_legs_are_the_desktop_workflows(self, data):
        workflow = yaml.safe_load(
            (_REPO_ROOT / ".github" / "workflows" / "desktop-electron.yml").read_text(
                encoding="utf-8"
            )
        )
        matrix = workflow["jobs"]["desktop-electron"]["strategy"]["matrix"]["include"]
        assert (
            set(data["legs"])
            == {leg["leg"] for leg in matrix}
            == set(budget_check.LEGS)
        )

    def test_the_intel_mac_has_the_largest_scale_and_the_rest_one(self, data):
        scales = {leg: entry["scale"] for leg, entry in data["legs"].items()}
        assert scales["macos-x64"] == 2.5
        assert all(scale == 1.0 for leg, scale in scales.items() if leg != "macos-x64")

    def test_every_budget_is_provisional_and_every_bench_says_where_its_numbers_came_from(
        self, data
    ):
        assert "first green scale run" in data["provisional"]
        for name, bench in data["benches"].items():
            assert bench["_basis"], name
            assert bench["metrics"], name

    def test_metric_names_end_in_a_unit_and_every_budget_is_positive(self, data):
        for name, bench in data["benches"].items():
            for metric, value in bench["metrics"].items():
                assert metric.rsplit("_", 1)[-1] in ("s", "ms", "mb", "x"), (
                    name,
                    metric,
                )
                assert value > 0, (name, metric)

    def test_an_override_is_for_a_bench_and_a_metric_that_exist(self, data):
        for leg, entry in data["legs"].items():
            for bench, overrides in entry["overrides"].items():
                assert bench in data["benches"], (leg, bench)
                for metric in overrides:
                    assert metric in data["benches"][bench]["metrics"], (
                        leg,
                        bench,
                        metric,
                    )

    def test_a_time_under_ten_milliseconds_is_floored_there(self, data):
        for name, bench in data["benches"].items():
            for metric, value in bench["metrics"].items():
                if metric.endswith("_ms"):
                    assert value >= 10, (name, metric)

    def test_the_references_are_the_sizes_the_guide_states(self, data):
        for name, bench in data["benches"].items():
            assert bench["reference"] == (1000 if name == "tag_write" else 50000), name

    def test_the_phase_15_and_16_budgets_are_kept(self, data):
        library = data["benches"]["library"]["metrics"]
        assert (
            library["statistics_plays_ms"],
            library["statistics_spreads_ms"],
            library["statistics_health_ms"],
        ) == (500, 1000, 500)
        assert data["benches"]["migrations"]["metrics"]["m0025_s"] == 1.0


class TestTheBenchesWithTheirOwnBudgets:
    """The benches that already had budgets take the leg's allowance for time, never for size."""

    def test_the_waveform_store_timings_are_scaled_and_its_size_is_not(
        self, monkeypatch
    ):
        import bench_waveform_store as store

        monkeypatch.setenv(budget_check.LEG_ENV, "linux-x64")
        assert dict(store._timing_budgets())["states_200"] == store.BATCH_BUDGET_MS
        monkeypatch.setenv(budget_check.LEG_ENV, "macos-x64")
        assert (
            dict(store._timing_budgets())["states_200"] == store.BATCH_BUDGET_MS * 2.5
        )
        assert store.SIZE_BUDGET_MB == 260.0

    def test_the_waveform_rows_scale_in_milliseconds_only(self, monkeypatch):
        import bench_waveforms

        monkeypatch.setenv(budget_check.LEG_ENV, "macos-x64")
        assert bench_waveforms._row("a", 1, "ms p95", 50.0, "")["budget"] == 125.0
        assert bench_waveforms._row("b", 1, "MB", 26.0, "")["budget"] == 26.0
        assert bench_waveforms._row("c", 1, "×", 1.3, "")["budget"] == 1.3


# ---------------------------------------------------------------------------
# Each bench exits 1 over its budget and 0 under it
# ---------------------------------------------------------------------------

#: name -> (module, arguments for a few hundred tracks, the budgets file's bench)
BENCHES = {
    "library": (
        "bench_library",
        ["--tracks", "300", "--playlists", "3", "--statistics"],
        "library",
    ),
    "clean": ("bench_clean", ["--tracks", "1000"], "clean"),
    "migrations": ("bench_migrations", ["--tracks", "300"], "migrations"),
    "search_keys": ("bench_search_keys", ["--tracks", "300"], "search_keys"),
    "tag_write": ("bench_tag_write", ["--files", "4"], "tag_write"),
}


@pytest.mark.parametrize("name", sorted(BENCHES))
class TestEachBenchHoldsItsBudget:
    def _run(self, name, step, monkeypatch, tmp_path, capsys):
        import importlib

        module_name, arguments, bench = BENCHES[name]
        module = importlib.import_module(module_name)
        out = tmp_path / f"{name}.json"
        monkeypatch.setattr(time, "perf_counter", Clock(step))
        status = module.main([*arguments, "--json", str(out)])
        capsys.readouterr()
        return status, json.loads(out.read_text(encoding="utf-8")), bench

    def test_under_its_budget_it_exits_zero(self, name, monkeypatch, tmp_path, capsys):
        status, report, bench = self._run(name, UNDER, monkeypatch, tmp_path, capsys)
        assert status == 0
        assert report["budget"]["problems"] == []
        assert report["budget"]["enforced"] is True
        assert report["run"]["leg"] == "linux-x64"
        # Everything the file budgets was measured (the statistics only with the flag).
        measured = set(report["budget"]["metrics"])
        assert measured >= set(budget_check.load()["benches"][bench]["metrics"])

    def test_over_its_budget_it_exits_one_and_says_what(
        self, name, monkeypatch, tmp_path, capsys
    ):
        status, report, bench = self._run(name, OVER, monkeypatch, tmp_path, capsys)
        assert status == 1
        over = [m for m, entry in report["budget"]["metrics"].items() if entry["over"]]
        assert over, (
            "nothing was over a budget on a clock that ran a thousand seconds a call"
        )
        assert all(
            f"{bench}: {m} " in " ".join(report["budget"]["problems"]) for m in over
        )


class TestEngineStartHoldsItsBudget:
    """The engine start bench on a stand-in for the library and the engine."""

    @pytest.fixture()
    def bench(self, monkeypatch, tmp_path):
        import bench_engine_start as bench

        def build(total, home):
            home.mkdir(parents=True, exist_ok=True)
            (home / "cuepoint.db").write_bytes(b"x")
            return {"build_seconds": 0.0, "database_mb": 0.0, "waveform_store_mb": 0.0}

        monkeypatch.setattr(bench, "build_library_home", build)
        monkeypatch.setattr(bench, "time_quick_check", lambda path: 0.5)
        monkeypatch.setattr(bench, "make_one_pending", lambda path: 33)
        return bench

    def _timeline(self, scale):
        return {
            "first_health_ms": 700.0 * scale,
            "backup_made_ms": 2000.0 * scale,
            "state_ok_ms": 2100.0 * scale,
        }

    def test_under_its_budget_it_exits_zero(self, bench, monkeypatch, tmp_path, capsys):
        monkeypatch.setattr(
            bench, "measure_library_once", lambda *a, **k: self._timeline(1)
        )
        out = tmp_path / "start.json"
        assert bench.main(["--library", "1000", "--runs", "1", "--json", str(out)]) == 0
        report = json.loads(out.read_text(encoding="utf-8"))
        assert report["budget"]["problems"] == []
        assert report["measured"]["state_ok_s"] == pytest.approx(2.1)
        assert report["measured"]["pending_migrate_s"] == pytest.approx(0.1)

    def test_over_its_budget_it_exits_one(self, bench, monkeypatch, tmp_path, capsys):
        monkeypatch.setattr(
            bench, "measure_library_once", lambda *a, **k: self._timeline(1000)
        )
        assert bench.main(["--library", "1000", "--runs", "1"]) == 1
        assert "OVER BUDGET" in capsys.readouterr().err

    def test_a_run_above_50000_is_recorded_and_not_held(
        self, bench, monkeypatch, tmp_path
    ):
        monkeypatch.setattr(
            bench, "measure_library_once", lambda *a, **k: self._timeline(1000)
        )
        out = tmp_path / "start.json"
        assert (
            bench.main(["--library", "100000", "--runs", "1", "--json", str(out)]) == 0
        )
        assert (
            json.loads(out.read_text(encoding="utf-8"))["budget"]["enforced"] is False
        )

    def test_every_migration_that_may_be_newest_can_be_taken_back_off(self, bench):
        # A migration added after m0033 needs its entry in DOWNGRADES, or the "one pending"
        # launch is skipped for good.
        assert bench.head_version() in bench.DOWNGRADES


class TestMissingReports:
    def test_a_report_the_spec_never_wrote_is_a_message_and_not_a_traceback(
        self, tmp_path, capsys
    ):
        assert budget_check.main(["check", "e2e", str(tmp_path / "e2e.json")]) == 1
        out = capsys.readouterr().out
        assert out.startswith("::error::") and "was not written" in out

    def test_a_report_that_is_not_one_is_a_message_too(self, tmp_path, capsys):
        report = tmp_path / "e2e.json"
        report.write_text("{}", encoding="utf-8")
        assert budget_check.main(["check", "e2e", str(report)]) == 1
        assert "::error::" in capsys.readouterr().out
        report.write_text("not json", encoding="utf-8")
        assert budget_check.main(["check", "e2e", str(report)]) == 1


class TestEveryBenchIsAccountedFor:
    def test_each_bench_script_is_budgeted_or_recorded_only_and_says_which(self):
        data = budget_check.load()
        recorded = set(data["recorded_only"])
        budgeted = set(data["benches"])
        stems = {p.stem.removeprefix("bench_") for p in _SCRIPTS.glob("bench_*.py")}
        stems.discard("")
        # bench.py is the matching benchmark; the rest are named bench_<name>.py
        accounted = (
            budgeted
            | recorded
            | {"tag_write", "waveform_store", "waveforms", "sets", "marks"}
        )
        assert stems <= accounted, stems - accounted
        assert {"match_storage", "decoder", "waveform_analysis"} <= recorded
        assert not recorded & budgeted

    def test_ratio_budgets_are_stated_as_not_scaling_per_leg(self):
        how = " ".join(budget_check.load()["_how"])
        assert "Ratio budgets" in how and "no scale applies" in how

    @pytest.mark.parametrize("name", ["decoder", "waveform_analysis", "match_storage"])
    def test_these_write_their_json_through_the_stamp(self, name):
        source = (_SCRIPTS / f"bench_{name}.py").read_text(encoding="utf-8")
        assert "budget_check.write_json(" in source

    def test_the_tag_write_report_carries_its_size_as_tracks(self, tmp_path):
        import bench_tag_write

        out = tmp_path / "tag.json"
        assert bench_tag_write.main(["--files", "4", "--json", str(out)]) == 0
        report = json.loads(out.read_text(encoding="utf-8"))
        assert report["tracks"] == 4 and report["run"]["leg"] == "linux-x64"
