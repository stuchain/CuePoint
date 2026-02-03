#!/usr/bin/env python3
"""Update release-readiness.md Step 7 checkboxes."""
from pathlib import Path

path = Path(__file__).parent.parent / "DOCS" / "prerelease" / "release-readiness.md"
content = path.read_text(encoding="utf-8")

# Mark Step 7 items as complete (uses Unicode curly quotes from file)
content = content.replace(
    " - [ ] Add a \u201cCollect Diagnostics\u201d feature that bundles logs and settings.",
    " - [x] Add a \u201cCollect Diagnostics\u201d feature that bundles logs and settings.",
)
content = content.replace(
    "- [ ] Add a \u201creport issue\u201d link in-app that pre-fills environment details.",
    "- [x] Add a \u201creport issue\u201d link in-app that pre-fills environment details.",
)

path.write_text(content, encoding="utf-8")
print("Updated release-readiness.md")
