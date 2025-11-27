#!/usr/bin/env python3
"""Fix processor.py by removing broken duplicate function."""

with open("SRC/cuepoint/services/processor.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False
in_broken_function = False

for i, line in enumerate(lines, 1):
    # Check if we're entering the broken function (line 2240)
    if i == 2240 and "def process_playlist_async(" in line:
        # Check if this is the broken one (next line should be empty or have code without proper indentation)
        if i + 1 < len(lines) and lines[i].strip() and not lines[i].strip().startswith(("xml_path", ")")):
            in_broken_function = True
            skip = True
            continue
    
    # Check if we're exiting the broken function (next proper function starts around 2411)
    if skip and i >= 2410 and "def process_playlist_async(" in line:
        # Check if this is a proper function definition
        if i + 1 < len(lines) and "xml_path: str" in lines[i]:
            skip = False
            in_broken_function = False
    
    if not skip:
        new_lines.append(line)

with open("SRC/cuepoint/services/processor.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print(f"Fixed processor.py: removed {len(lines) - len(new_lines)} lines")


