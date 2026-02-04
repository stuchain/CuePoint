#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Step 13: Post-Launch Operations and Support - Validation Script

Validates that all Step 13 artifacts exist and links are valid.
Run: python scripts/check_step13_ops.py
"""

import sys
from pathlib import Path

# Project root
ROOT = Path(__file__).resolve().parent.parent
DOCS_RELEASE = ROOT / "DOCS" / "RELEASE"
GITHUB = ROOT / ".github"


def check_file(path: Path, desc: str) -> bool:
    """Check that a file exists."""
    if path.exists():
        print(f"  [OK] {desc}: {path.relative_to(ROOT)}")
        return True
    print(f"  [FAIL] {desc} MISSING: {path.relative_to(ROOT)}")
    return False


def check_doc_links() -> bool:
    """Check that key internal doc links resolve."""
    import re
    ok = True
    ops_index = DOCS_RELEASE / "ops-index.md"
    if ops_index.exists():
        content = ops_index.read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(r'\]\(([^)#]+)', content):
            link = match.group(1).strip()
            if link.startswith("http"):
                continue
            target = (ops_index.parent / link).resolve()
            if not target.exists():
                print(f"  [WARN] Broken link in ops-index.md: {link}")
                ok = False
    return ok


def main() -> int:
    """Run Step 13 validation."""
    print("Step 13: Post-Launch Operations and Support - Validation")
    print("=" * 55)

    all_ok = True

    # Required docs
    print("\n1. Documentation")
    docs = [
        (DOCS_RELEASE / "ops-index.md", "Ops index"),
        (DOCS_RELEASE / "ops-support-channels.md", "Support channels"),
        (DOCS_RELEASE / "triage-workflow.md", "Triage workflow"),
        (DOCS_RELEASE / "release-deployment-runbook.md", "Release deployment runbook"),
        (DOCS_RELEASE / "incident-response-runbook.md", "Incident response runbook"),
        (DOCS_RELEASE / "update-feed-recovery-runbook.md", "Update feed recovery runbook"),
        (DOCS_RELEASE / "backup-disaster-recovery.md", "Backup & disaster recovery"),
        (DOCS_RELEASE / "ops-kpis.md", "Ops KPIs"),
        (DOCS_RELEASE / "known-issues.md", "Known issues"),
    ]
    for path, desc in docs:
        if not check_file(path, desc):
            all_ok = False

    # Issue templates
    print("\n2. Issue templates")
    templates = [
        (GITHUB / "ISSUE_TEMPLATE" / "bug_report.yml", "Bug report"),
        (GITHUB / "ISSUE_TEMPLATE" / "feature_request.yml", "Feature request"),
        (GITHUB / "ISSUE_TEMPLATE" / "security_vulnerability.yml", "Security"),
    ]
    for path, desc in templates:
        if not check_file(path, desc):
            all_ok = False

    # Bug report has support bundle hint
    bug_report = GITHUB / "ISSUE_TEMPLATE" / "bug_report.yml"
    if bug_report.exists():
        content = bug_report.read_text(encoding="utf-8", errors="replace")
        if "support bundle" in content.lower() and "run_id" in content:
            print("  [OK] Bug report has support bundle and run_id fields")
        else:
            print("  [WARN] Bug report may be missing support bundle/run_id fields")
            all_ok = False

    # Labels config
    print("\n3. Labels config")
    if not check_file(GITHUB / "labels.yml", "Labels config"):
        all_ok = False

    # Doc links
    print("\n4. Documentation links")
    if check_doc_links():
        print("  [OK] Doc links valid")
    else:
        all_ok = False

    # CLI flag (check main.py)
    print("\n5. CLI --export-support-bundle")
    main_py = ROOT / "SRC" / "main.py"
    if main_py.exists():
        content = main_py.read_text(encoding="utf-8", errors="replace")
        if "--export-support-bundle" in content and "SupportBundleGenerator" in content:
            print("  [OK] CLI --export-support-bundle implemented")
        else:
            print("  [FAIL] CLI --export-support-bundle not found")
            all_ok = False

    print("\n" + "=" * 55)
    if all_ok:
        print("[PASS] Step 13 validation passed")
        return 0
    print("[FAIL] Step 13 validation failed - fix issues above")
    return 1


if __name__ == "__main__":
    sys.exit(main())
