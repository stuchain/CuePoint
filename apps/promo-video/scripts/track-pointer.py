#!/usr/bin/env python3
"""Track the drawn mouse pointer through the demo's extracted raw frames (demo/frames/raw-<shot>/, written by
scripts/render-demo.mjs) into demo/pointer.json: per shot, one [x, y, confidence] per frame in the 1280 x 800
window's coordinates. The camera plan is checked against it by scripts/verify-demo.mjs.

The arrow is found by matching its white body on a thresholded frame, so a purple row or a dialog under it
does not throw the match off; a frame where it is not found keeps the last confident position.

Needs opencv-python-headless and numpy (pip install opencv-python-headless)."""
import json
import os
import sys

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "demo")
FRAMES = os.path.join(ROOT, "frames")
# the arrow as it sits in the Library clip's first frame (frames are 2048 wide, 0.625 of the 1280 window at 2x)
first = cv2.imread(os.path.join(FRAMES, "raw-library", "00001.jpg"), cv2.IMREAD_GRAYSCALE)
if first is None:
    sys.exit("extract the raw frames first: node scripts/render-demo.mjs --raw=<dir> --stills=1")
template = (first[496:566, 1168:1216] > 225).astype(np.uint8) * 255
TIP = (8, 6)
SCALE = 1280 / 2048

out = {}
for d in sorted(os.listdir(FRAMES)):
    if not d.startswith("raw-"):
        continue
    points = []
    for name in sorted(os.listdir(os.path.join(FRAMES, d))):
        grey = cv2.imread(os.path.join(FRAMES, d, name), cv2.IMREAD_GRAYSCALE)
        white = (grey > 225).astype(np.uint8) * 255
        result = cv2.matchTemplate(white, template, cv2.TM_CCOEFF_NORMED)
        _, best, _, loc = cv2.minMaxLoc(result)
        points.append([round((loc[0] + TIP[0]) * SCALE), round((loc[1] + TIP[1]) * SCALE), round(float(best), 2)])
    last = None
    low = 0
    for p in points:
        if p[2] >= 0.7:
            last = p
        elif last:
            p[0], p[1] = last[0], last[1]
            low += 1
    out[d[4:]] = points
    print(f"{d}: {len(points)} frames, {low} filled from the frame before")
with open(os.path.join(ROOT, "pointer.json"), "w") as f:
    json.dump(out, f)
