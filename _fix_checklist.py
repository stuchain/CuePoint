#!/usr/bin/env python3
path = "DOCS/prerelease/release-readiness.md"
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
