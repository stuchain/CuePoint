// The music under a cut, shared by render-demo.mjs and render-film.mjs.
import { spawnSync } from "node:child_process";

/**
 * The loudness filter for the music under the cut: measured first over the stretch used, then applied as one
 * static gain (linear), so a quiet breakdown or the track's own fade-out is not pumped back up.
 */
export function loudness(track, start, total) {
  // a true-peak ceiling the static gain can meet (a tighter one makes loudnorm fall back to dynamic gain)
  const target = "I=-14:TP=-1.0:LRA=11";
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(start), "-t", String(total), "-i", track, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"]);
  const text = r.stderr.toString();
  const m = JSON.parse(text.slice(text.lastIndexOf("{")));
  return `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}
