#!/usr/bin/env bash
# Turns the README's raw captures into the GIFs and PNGs in .github/readme/.
#
#   cd apps/desktop-electron
#   xvfb-run -a -s "-screen 0 2700x1800x24" npm run capture:readme
#   cd ../.. && scripts/readme-gifs.sh
#
# Needs ffmpeg; gifsicle and pngquant shrink the files further when they are installed.
# RAW (default .github/readme/raw) holds what the capture wrote; it is not committed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="${RAW:-$ROOT/.github/readme/raw}"
OUT="${OUT:-$ROOT/.github/readme}"
WIDTH="${WIDTH:-1280}"
FPS="${FPS:-15}"
mkdir -p "$OUT"

for clip in "$RAW"/*.mkv; do
  id="$(basename "$clip" .mkv)"
  speed=1
  [ "$id" = "tour" ] && speed=1.15
  filters="setpts=PTS/$speed,fps=$FPS,scale=$WIDTH:-1:flags=lanczos"
  ffmpeg -loglevel error -y -i "$clip" \
    -vf "$filters,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    "$OUT/$id.gif"
  if command -v gifsicle >/dev/null; then gifsicle -O3 --batch "$OUT/$id.gif"; fi
  echo "$id.gif $(du -h "$OUT/$id.gif" | cut -f1)"
done

for still in "$RAW"/*.png; do
  id="$(basename "$still" .png)"
  ffmpeg -loglevel error -y -i "$still" -vf "scale=1600:-1:flags=lanczos" "$OUT/$id.png"
  if command -v pngquant >/dev/null; then pngquant --force --skip-if-larger --quality 80-95 --output "$OUT/$id.png" "$OUT/$id.png" || true; fi
  echo "$id.png $(du -h "$OUT/$id.png" | cut -f1)"
done
