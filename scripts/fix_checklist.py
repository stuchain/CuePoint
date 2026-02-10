#!/usr/bin/env python3
"""One-off script to fix release-readiness checklist checkboxes. Run from repo root or scripts/."""
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
path = project_root / "docs" / "future-features" / "prerelease" / "release-readiness.md"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

result = []
for line in lines:
    if "[ ]" in line and "unmatched" in line and "recommended actions" in line:
        line = line.replace("[ ]", "[x]")
    elif "[ ]" in line and "review mode" in line and "low-confidence" in line:
        line = line.replace("[ ]", "[x]")
    result.append(line)

with open(path, "w", encoding="utf-8") as f:
    f.writelines(result)
print("Done")
