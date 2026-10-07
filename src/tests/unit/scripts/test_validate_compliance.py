"""The compliance check holds the privacy disclosures to what the app does (REPORT-08, DEC-128).

Released builds send error reports unless the user turns them off, so a notice or the in-app
dialog that still says "no telemetry" is wrong, and the two notices must say the same thing.
"""

from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCRIPT = _REPO_ROOT / "scripts" / "validate_compliance.py"

_spec = importlib.util.spec_from_file_location("validate_compliance", _SCRIPT)
assert _spec is not None and _spec.loader is not None
validate_compliance = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(validate_compliance)

_FILES = [
    "PRIVACY_NOTICE.md",
    "docs/policy/privacy-notice.md",
    "apps/desktop-electron/renderer/src/components/PrivacyDialog.tsx",
]


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    for rel in _FILES:
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(_REPO_ROOT / rel, target)
    return tmp_path


def test_the_real_disclosures_pass():
    assert validate_compliance.check_privacy_disclosures(_REPO_ROOT) == []


def test_the_two_notices_are_equal():
    assert (_REPO_ROOT / "PRIVACY_NOTICE.md").read_text(encoding="utf-8") == (
        _REPO_ROOT / "docs/policy/privacy-notice.md"
    ).read_text(encoding="utf-8")


def test_notices_that_differ_fail(tree: Path):
    path = tree / "docs/policy/privacy-notice.md"
    path.write_text(path.read_text(encoding="utf-8") + "\nextra\n", encoding="utf-8")
    assert any(
        "equal" in p for p in validate_compliance.check_privacy_disclosures(tree)
    )


@pytest.mark.parametrize(
    "old", ["No telemetry or analytics in v1.0", "No background data collection"]
)
def test_a_dialog_that_still_says_nothing_is_collected_fails(tree: Path, old: str):
    path = tree / _FILES[2]
    path.write_text(
        path.read_text(encoding="utf-8").replace(
            "Data collection:", f"Data collection:\n- {old}"
        ),
        encoding="utf-8",
    )
    assert any(
        "PrivacyDialog" in p
        for p in validate_compliance.check_privacy_disclosures(tree)
    )


def test_a_dialog_without_the_error_report_sentence_fails(tree: Path):
    path = tree / _FILES[2]
    path.write_text(
        path.read_text(encoding="utf-8").replace("Sentry", "somebody"), encoding="utf-8"
    )
    assert any(
        "Sentry" in p for p in validate_compliance.check_privacy_disclosures(tree)
    )


@pytest.mark.parametrize(
    "old",
    [
        "CuePoint v1.0 **does not** include telemetry or analytics.",
        "CuePoint v1.0 does **not** collect telemetry, analytics, or usage tracking data.",
        "### v1.0 — no telemetry / analytics",
    ],
)
def test_a_notice_with_the_old_wording_fails(tree: Path, old: str):
    for rel in _FILES[:2]:
        path = tree / rel
        path.write_text(
            path.read_text(encoding="utf-8") + f"\n{old}\n", encoding="utf-8"
        )
    assert any(
        "error reports" in p
        for p in validate_compliance.check_privacy_disclosures(tree)
    )


def test_the_dialog_words_are_checked_in_the_literal_not_the_file(tree: Path):
    path = tree / _FILES[2]
    text = path.read_text(encoding="utf-8")
    # Sentry removed from the disclosure, but still mentioned in a comment elsewhere in the file.
    text = text.replace("Sentry (EU region)", "somebody").replace(
        "export function PrivacyDialog", "// Sentry\nexport function PrivacyDialog"
    )
    path.write_text(text, encoding="utf-8")
    assert any(
        "Sentry" in p for p in validate_compliance.check_privacy_disclosures(tree)
    )


def test_a_dialog_with_no_literal_fails(tree: Path):
    path = tree / _FILES[2]
    path.write_text(
        path.read_text(encoding="utf-8").replace("const PRIVACY_TEXT", "const OTHER"),
        encoding="utf-8",
    )
    assert any(
        "PRIVACY_TEXT" in p for p in validate_compliance.check_privacy_disclosures(tree)
    )


def test_a_notice_must_name_sentry_the_switch_and_the_region(tree: Path):
    for rel in _FILES[:2]:
        path = tree / rel
        text = path.read_text(encoding="utf-8").replace(
            "Settings → Privacy → Send error reports", "somewhere"
        )
        path.write_text(text, encoding="utf-8")
    assert any(
        "Send error reports" in p
        for p in validate_compliance.check_privacy_disclosures(tree)
    )
