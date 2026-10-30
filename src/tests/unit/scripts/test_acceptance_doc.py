"""The v1 acceptance checklist and the script that holds it (HARDEN-09, DEC-188).

Two things are tested. The real ``docs/release/v1-acceptance.md`` must always be well formed, so a
row cannot lose its source, system or date. And ``scripts/check_acceptance.py --release`` must fail
while a row is owed or failing, which is what holds back the ``v1.0.0`` tag, without that rule
failing ordinary CI today: the real document is only ever tested for its shape.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "check_acceptance.py"
_DOC = _REPO_ROOT / "docs" / "release" / "v1-acceptance.md"
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"

pytestmark = pytest.mark.unit


def _load():
    spec = importlib.util.spec_from_file_location("check_acceptance", _SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ca = _load()


# ---------------------------------------------------------------------------------------------
# The real document


@pytest.fixture(scope="module")
def rows():
    return ca.parse(_DOC.read_text(encoding="utf-8"))


class TestTheDocument:
    def test_it_has_rows(self, rows):
        assert len(rows) >= 30

    def test_it_is_well_formed(self, rows):
        assert ca.structure_problems(rows, _REPO_ROOT) == []

    def test_every_row_has_a_check_a_source_systems_a_how_and_a_result(self, rows):
        for row in rows:
            assert row.check, row.line
            assert row.references, row.line
            assert row.system_list, row.line
            assert row.how_list, row.line
            assert row.result, row.line

    def test_systems_are_the_four_named_ones(self, rows):
        used = {system for row in rows for system in row.system_list}
        assert used <= {"Windows", "macOS Apple Silicon", "macOS Intel", "Linux"}
        # The three that block a tag (DEC-188) are all used.
        assert {"Windows", "macOS Apple Silicon", "macOS Intel"} <= used

    def test_every_source_is_a_file_that_exists_at_lines_it_has(self, rows):
        for row in rows:
            for reference in row.references:
                name, _, lines = reference.partition(":")
                path = _REPO_ROOT / name
                assert path.is_file(), f"line {row.line}: {name}"
                count = len(path.read_text(encoding="utf-8").splitlines())
                last = int(lines.split("-")[-1])
                assert 1 <= last <= count, f"line {row.line}: {reference}"

    def test_a_result_that_is_not_owed_carries_an_iso_date(self, rows):
        for row in rows:
            outcome = row.per_system()
            assert outcome is not None, row.line
            for system, (result, when) in outcome.items():
                if result != "owed":
                    assert ca._ISO_DATE_RE.match(when), (row.line, system)

    def test_linux_is_only_ever_checked_by_ci(self, rows):
        # Q-198, DEC-187: Linux has its automated checks and nothing by hand.
        for row in rows:
            if "Linux" in row.system_list:
                assert row.how_list == ["CI"], f"line {row.line}: {row.check}"

    def test_a_hand_check_names_a_system_that_blocks_the_tag(self, rows):
        for row in rows:
            if "by hand" in row.how_list:
                assert set(row.system_list) - {"Linux"}, row.line

    def test_ordinary_ci_passes_with_checks_still_owed(self):
        # The shape check is what every workflow may run; only `--release` minds an owed row.
        assert ca.main(["--doc", str(_DOC)]) == 0


class TestWhatTheChecklistMustHold:
    """The checks fact 9 of Phase 18 lists, the runbook's, and HARDEN-08's, by their source."""

    def _sources(self, rows):
        return {
            reference.partition(":")[0] for row in rows for reference in row.references
        }

    @pytest.mark.parametrize(
        "phase_file",
        [
            "PHASE5_PLAYER.md",
            "PHASE7_CLEAN.md",
            "PHASE8_EXPORT.md",
            "PHASE9_DISCOVER.md",
            "PHASE10_PREPARE.md",
            "PHASE11_WAVEFORMS.md",
            "PHASE12_CLEANUP.md",
            "PHASE13_REPORTING.md",
        ],
    )
    def test_every_phase_with_owed_checks_has_a_row(self, rows, phase_file):
        assert f"docs/v1/archive/{phase_file}" in self._sources(rows)

    def test_the_runbooks_manual_checks_are_rows(self, rows):
        text = " ".join(row.check for row in rows)
        for word in (
            "install",
            "launch",
            "happy path",
            "player",
            "errors",
            "Help menu",
            "uninstall",
            "update from the previous release",
        ):
            assert word.lower() in text.lower(), word
        assert "docs/release/release-deployment-runbook.md" in self._sources(rows)

    def test_the_screen_reader_passes_are_rows(self, rows):
        by_name = {
            "NVDA": ["Windows"],
            # A screen reader needs a person at hardware: Apple Silicon only (DEC-308).
            "VoiceOver": ["macOS Apple Silicon"],
        }
        for name, systems in by_name.items():
            [row] = [r for r in rows if name in r.check]
            assert row.system_list == systems
            assert row.how_list == ["by hand"]

    def test_notarization_is_not_applicable_and_the_first_install_stands_in(self, rows):
        notarization = [
            r
            for r in rows
            if "notariz" in r.check.lower() or "notarytool" in r.check.lower()
        ]
        assert len(notarization) == 2
        sources = {r.references[0].partition(":")[0] for r in notarization}
        assert sources == {
            "docs/v1/archive/PHASE5_PLAYER.md",
            "docs/v1/archive/PHASE8_EXPORT.md",
        }
        for row in notarization:
            assert row.result == "not applicable (DEC-170)"
        first_install = [r for r in rows if r.check.startswith("First install by hand")]
        assert len(first_install) == 1
        assert set(first_install[0].system_list) == {
            "macOS Apple Silicon",
            "macOS Intel",
        }
        # The by-hand pass is on Apple Silicon; the Intel runner covers Intel (DEC-308).
        outcome = first_install[0].per_system()
        assert outcome["macOS Apple Silicon"][0] == "owed"
        assert outcome["macOS Intel"][0].startswith("covered by CI (")

    def test_the_hardware_only_checks_are_run_by_hand(self, rows):
        for words in (
            "exclusive output",
            "unplug",
            "no gap",
            "USB drive",
            "Rekordbox 6",
            "live Beatport",
        ):
            [row] = [r for r in rows if words in r.check]
            assert "by hand" in row.how_list, words

    def test_no_by_hand_row_leaves_intel_owed(self, rows):
        # DEC-308: the owner's by-hand checks run on Apple Silicon; Intel is covered by CI.
        for row in rows:
            if row.how_list == ["by hand"] and "macOS Intel" in row.system_list:
                result = row.per_system()["macOS Intel"][0]
                assert result != "owed", f"line {row.line}: {row.check}"

    def test_the_hardware_checks_do_not_name_intel(self, rows):
        for words in (
            "exclusive output",
            "unplug",
            "no gap",
            "Rekordbox 6",
            "VoiceOver",
        ):
            [row] = [r for r in rows if words in r.check]
            assert "macOS Intel" not in row.system_list, words

    def test_the_known_reds_are_written_down(self):
        text = _DOC.read_text(encoding="utf-8")
        assert "## Known reds" in text
        for word in ("rows.nth(1)", "bash 4", "StatusStrip.test.tsx"):
            assert word in text, word


# ---------------------------------------------------------------------------------------------
# The script, on documents made here


def _doc(*rows: str) -> str:
    header = "| Check | From | Systems | How | Result | Date |\n| --- | --- | --- | --- | --- | --- |\n"
    return "# Title\n\nSome words.\n\n" + header + "\n".join(rows) + "\n"


GOOD = "| Do the thing | README.md:1 | Windows, macOS Intel | by hand | owed | - |"


class TestParse:
    def test_reads_the_rows_of_the_table(self):
        [row] = ca.parse(_doc(GOOD))
        assert row.check == "Do the thing"
        assert row.references == ["README.md:1"]
        assert row.system_list == ["Windows", "macOS Intel"]
        assert row.how_list == ["by hand"]
        assert (row.result, row.date) == ("owed", "-")

    def test_a_document_without_the_table_is_refused(self):
        with pytest.raises(ValueError, match="no table"):
            ca.parse("# Nothing here\n")

    def test_a_row_with_a_missing_cell_is_refused(self):
        with pytest.raises(ValueError, match="5 cells"):
            ca.parse(_doc("| a | README.md:1 | Windows | CI | owed |"))

    def test_prose_after_the_table_is_not_a_row(self):
        text = _doc(GOOD) + "\nA later paragraph.\n\n| x | y |\n| - | - |\n"
        assert len(ca.parse(text)) == 1


def _problems(*rows: str) -> list[str]:
    return ca.structure_problems(ca.parse(_doc(*rows)), _REPO_ROOT)


class TestStructure:
    def test_a_good_row_has_no_problem(self):
        assert _problems(GOOD) == []

    def test_every_allowed_result_is_accepted(self):
        passed = "| c | README.md:1 | Windows | CI | pass | 2026-10-29 |"
        failed = "| c | README.md:1 | Windows | CI | fail | 2026-10-29 |"
        na = (
            "| c | README.md:1 | Windows | CI | not applicable (DEC-170) | 2026-10-29 |"
        )
        assert _problems(GOOD, passed, failed, na) == []

    def test_intel_may_be_covered_by_ci_and_no_other_system(self):
        intel = "| c | README.md:1 | macOS Intel | by hand | covered by CI (the Intel runner) | 2026-10-29 |"
        win = "| c | README.md:1 | Windows | by hand | covered by CI (the Intel runner) | 2026-10-29 |"
        assert _problems(intel) == []
        assert any("covered by CI" in p for p in _problems(win))

    def test_each_system_has_its_own_result_and_date(self):
        row = (
            "| c | README.md:1 | Windows, macOS Intel | by hand "
            "| Windows: pass; macOS Intel: owed | Windows: 2026-10-12; macOS Intel: - |"
        )
        assert _problems(row) == []
        [parsed] = ca.parse(_doc(row))
        assert parsed.per_system() == {
            "Windows": ("pass", "2026-10-12"),
            "macOS Intel": ("owed", "-"),
        }
        assert parsed.is_owed

    def test_a_per_system_date_must_fit_its_result(self):
        row = (
            "| c | README.md:1 | Windows, macOS Intel | by hand "
            "| Windows: pass; macOS Intel: owed | Windows: -; macOS Intel: 2026-10-12 |"
        )
        problems = _problems(row)
        assert any("Windows: date" in p for p in problems)
        assert any("macOS Intel: owed, so it has no date" in p for p in problems)

    def test_per_system_cells_must_name_exactly_the_rows_systems(self):
        missing = (
            "| c | README.md:1 | Windows, macOS Intel | by hand "
            "| Windows: pass | Windows: 2026-10-12 |"
        )
        twice = (
            "| c | README.md:1 | Windows | by hand "
            "| Windows: pass; Windows: fail | Windows: 2026-10-12; Windows: 2026-10-12 |"
        )
        for row in (missing, twice):
            assert any("exactly the row's systems" in p for p in _problems(row))

    def test_a_row_is_held_only_for_the_systems_still_owed(self):
        row = (
            "| c | README.md:1 | Windows, macOS Intel | by hand "
            "| Windows: pass; macOS Intel: owed | Windows: 2026-10-12; macOS Intel: - |"
        )
        [held] = ca.release_problems(ca.parse(_doc(row)))
        assert "macOS Intel owed" in held and "Windows" not in held

    def test_a_row_needs_a_check(self):
        row = "|  | README.md:1 | Windows | CI | owed | - |"
        assert any("no check" in p for p in _problems(row))

    def test_a_row_needs_a_source(self):
        row = "| c |  | Windows | CI | owed | - |"
        assert any("no reference" in p for p in _problems(row))

    def test_a_source_must_be_file_and_line(self):
        row = "| c | README.md | Windows | CI | owed | - |"
        assert any("not file:line" in p for p in _problems(row))

    def test_a_source_must_be_a_file_that_exists(self):
        row = "| c | docs/v1/NOPE.md:3 | Windows | CI | owed | - |"
        assert any("does not exist" in p for p in _problems(row))

    def test_a_source_line_must_be_in_the_file(self):
        row = "| c | README.md:999999 | Windows | CI | owed | - |"
        assert any("has" in p and "lines" in p for p in _problems(row))
        backwards = "| c | README.md:5-2 | Windows | CI | owed | - |"
        assert any("lines" in p for p in _problems(backwards))

    def test_a_range_of_lines_is_accepted(self):
        row = "| c | README.md:1-3 | Windows | CI | owed | - |"
        assert _problems(row) == []

    def test_a_row_can_have_several_sources(self):
        row = "| c | README.md:1; AGENTS.md:2-3 | Windows | CI | owed | - |"
        assert _problems(row) == []

    def test_a_row_needs_systems_from_the_allowed_set(self):
        none = "| c | README.md:1 |  | CI | owed | - |"
        wrong = "| c | README.md:1 | Solaris | CI | owed | - |"
        twice = "| c | README.md:1 | Windows, Windows | CI | owed | - |"
        assert any("no systems" in p for p in _problems(none))
        assert any("'Solaris' is not a system" in p for p in _problems(wrong))
        assert any("named twice" in p for p in _problems(twice))

    def test_a_row_needs_a_how_from_the_allowed_set(self):
        none = "| c | README.md:1 | Windows |  | owed | - |"
        wrong = "| c | README.md:1 | Windows | magic | owed | - |"
        assert any("no how" in p for p in _problems(none))
        assert any("'magic' is not a how" in p for p in _problems(wrong))

    def test_several_hows_are_accepted(self):
        row = "| c | README.md:1 | Windows | CI, by hand | owed | - |"
        assert _problems(row) == []

    @pytest.mark.parametrize(
        "result", ["", "done", "Pass", "not applicable", "not applicable ()"]
    )
    def test_a_result_must_be_one_of_the_four(self, result):
        row = f"| c | README.md:1 | Windows | CI | {result} | 2026-10-29 |"
        assert any("is not owed, pass, fail" in p for p in _problems(row))

    @pytest.mark.parametrize("result", ["pass", "fail", "not applicable (DEC-170)"])
    @pytest.mark.parametrize("day", ["", "-", "29/10/2026", "2026-13-40", "yesterday"])
    def test_a_result_that_is_not_owed_needs_an_iso_date(self, result, day):
        row = f"| c | README.md:1 | Windows | CI | {result} | {day} |"
        assert any("date" in p for p in _problems(row))

    def test_an_owed_row_has_no_date(self):
        row = "| c | README.md:1 | Windows | CI | owed | 2026-10-29 |"
        assert any("owed, so it has no date" in p for p in _problems(row))
        assert _problems("| c | README.md:1 | Windows | CI | owed |  |") == []

    def test_an_empty_table_is_a_problem(self):
        assert ca.structure_problems([], _REPO_ROOT) == ["the table has no rows"]


class TestReleaseRule:
    """`--release` is the rule that holds back the tag: nothing owed, nothing failing."""

    def _held(self, *rows: str) -> list[str]:
        return ca.release_problems(ca.parse(_doc(*rows)))

    def test_an_owed_row_holds_the_tag_back(self):
        assert len(self._held(GOOD)) == 1

    def test_a_failing_row_holds_the_tag_back(self):
        row = "| c | README.md:1 | Windows | CI | fail | 2026-10-29 |"
        [held] = self._held(row)
        assert "fail" in held

    def test_a_passing_row_and_a_row_that_does_not_apply_do_not(self):
        passed = "| c | README.md:1 | Windows | CI | pass | 2026-10-29 |"
        na = (
            "| c | README.md:1 | Windows | CI | not applicable (DEC-170) | 2026-10-29 |"
        )
        assert self._held(passed, na) == []

    def test_each_held_row_is_named_with_its_systems(self):
        [held] = self._held(GOOD)
        assert "Do the thing" in held
        assert "Windows owed" in held and "macOS Intel owed" in held

    def test_a_long_check_is_shortened_in_the_report(self):
        row = "| " + "word " * 60 + "| README.md:1 | Windows | CI | owed | - |"
        [held] = self._held(row)
        assert len(held) < 200 and "..." in held


class TestMain:
    def _write(self, tmp_path, *rows: str) -> str:
        path = tmp_path / "acceptance.md"
        path.write_text(_doc(*rows), encoding="utf-8")
        return str(path)

    def test_without_release_owed_rows_are_fine(self, tmp_path, capsys):
        assert ca.main(["--doc", self._write(tmp_path, GOOD)]) == 0
        assert "1 checks; 1 owed" in capsys.readouterr().out

    def test_with_release_an_owed_row_fails(self, tmp_path, capsys):
        assert ca.main(["--release", "--doc", self._write(tmp_path, GOOD)]) == 1
        err = capsys.readouterr().err
        assert "v1.0.0 cannot be tagged" in err and "Do the thing" in err

    def test_with_release_a_failing_row_fails(self, tmp_path):
        row = "| c | README.md:1 | Windows | CI | fail | 2026-10-29 |"
        assert ca.main(["--release", "--doc", self._write(tmp_path, row)]) == 1

    def test_with_release_a_finished_list_passes(self, tmp_path, capsys):
        done = "| c | README.md:1 | Windows | CI | pass | 2026-10-29 |"
        na = "| c | README.md:1 | macOS Intel | by hand | not applicable (DEC-170) | 2026-10-29 |"
        assert ca.main(["--release", "--doc", self._write(tmp_path, done, na)]) == 0
        assert "Every check has passed" in capsys.readouterr().out

    @pytest.mark.parametrize("flags", [[], ["--release"]])
    def test_a_malformed_list_fails_either_way(self, tmp_path, capsys, flags):
        row = "| c | README.md:1 | Solaris | CI | pass | 2026-10-29 |"
        assert ca.main([*flags, "--doc", self._write(tmp_path, row)]) == 1
        assert "not well formed" in capsys.readouterr().err

    def test_a_missing_file_fails(self, tmp_path):
        assert ca.main(["--doc", str(tmp_path / "nope.md")]) == 1

    def test_the_default_document_is_the_checklist(self):
        assert ca.DEFAULT_DOC == _DOC


class TestItIsReached:
    """The dead-code guard wants a workflow to run the script, and the README to list it."""

    def test_release_workflow_runs_it_with_the_release_flag(self):
        text = (_WORKFLOWS / "release.yml").read_text(encoding="utf-8")
        assert "python scripts/check_acceptance.py --release" in text

    def test_the_scripts_readme_lists_it(self):
        text = (_REPO_ROOT / "scripts" / "README.md").read_text(encoding="utf-8")
        assert "`check_acceptance.py`" in text

    def test_the_release_job_is_for_a_normal_tag_only(self):
        data = yaml.safe_load((_WORKFLOWS / "release.yml").read_text(encoding="utf-8"))
        assert data["jobs"]["acceptance"]["if"] == (
            "${{ needs.gate.outputs.prerelease != 'true' }}"
        )
