// Film A, the wipe: the same Library before CuePoint and after, split by a slider, three chapters and an end card.
// Every length is beats of the music (sub_clair's "Technology", 125 BPM). seek(t) draws the frame at t seconds.
import { $, FPS, clamp, curve, place, reveal, show, smooth } from "./lib.js";

const BAR = (60 / 125) * 4;
const BEAT = BAR / 4;
const T0 = 0.2;
/** The window rectangles the camera frames (1280 x 800 window pixels, 16:10 like the frame, above the status bar). */
const view = (x0, y0, y1) => {
  const z = 800 / (y1 - y0);
  return { x: x0 + 640 / z, y: (y0 + y1) / 2, z };
};
const FULL = view(30, 0, 762);
const KEYS = view(578, 120, 557);
const DETAILS = view(560, 110, 560);

/** The before/after pictures (wipe-<pair>-before.png and -after.png, from e2e/capture/demo.spec.ts). */
const PAIRS = { library: "frames/wipe-library", details: "frames/wipe-details" };

const OPEN_BARS = 2;
const CHAPTER_BARS = 4;
const END_BARS = 2;
const CHAPTERS = [
  { pair: "library", view: KEYS, chip: "Keys", caption: "No keys in Rekordbox. CuePoint finds them on Beatport." },
  { pair: "details", view: DETAILS, chip: "Matches", caption: "Every match checked against Beatport and confirmed." },
  { pair: "library", view: FULL, chip: "Ready", caption: "Then into your files, and straight back to Rekordbox." },
];
const MOVE = 1.0;
/** Between moves the camera never stops: it creeps in by this much over each chapter (and over the opening). */
const DRIFT = 0.035;
const drift = (cam, k) => ({ ...cam, z: cam.z * (1 + DRIFT * clamp(k, 0, 1)) });
const chapterStart = (i) => T0 + (OPEN_BARS + i * CHAPTER_BARS) * BAR;
const END_START = chapterStart(CHAPTERS.length);
const DURATION = END_START + END_BARS * BAR;

const win = $("window");
const W = 1000;
const H = 625;
const layers = { before: [$("beforeA"), $("beforeB")], after: [$("afterA"), $("afterB")] };

/** Which picture pair and camera at chapter i, u seconds in; k is how far the slider has wiped (0 none, 1 all). */
function chapterState(i, u) {
  const c = CHAPTERS[i];
  // each move starts where the last chapter's creep left the camera
  const from = drift(i === 0 ? FULL : CHAPTERS[i - 1].view, 1);
  const to = drift(c.view, u / (CHAPTER_BARS * BAR));
  const m = smooth(u / MOVE);
  const cam = { x: from.x + (to.x - from.x) * m, y: from.y + (to.y - from.y) * m, z: from.z + (to.z - from.z) * m };
  const prevPair = i === 0 ? "library" : CHAPTERS[i - 1].pair;
  // the pair changes while the camera moves, the old one dissolving into the new
  const swap = prevPair === c.pair ? 1 : smooth((u - 0.2) / 0.5);
  const sweep = smooth((u - BAR) / (2 * BAR));
  // the last chapter's after picture fades back to before as the next one starts
  const reset = i === 0 ? 1 : smooth(u / 0.35);
  return { cam, pair: c.pair, prevPair, swap, sweep, reset };
}

async function drawPair(stack, kind, pair, prevPair, swap, cam) {
  const [a, b] = layers[stack];
  await show(a, `${PAIRS[pair]}-${kind}.png`);
  await show(b, `${PAIRS[prevPair]}-${kind}.png`);
  for (const img of [a, b]) place(img, W, H, cam.x, cam.y, cam.z);
  a.style.opacity = "1";
  b.style.opacity = String(1 - swap);
  b.style.display = swap >= 1 ? "none" : "block";
}

function note(el, c, opacity, rise) {
  if (el.dataset.chip !== c.chip) {
    el.dataset.chip = c.chip;
    el.querySelector(".chip").textContent = c.chip;
    el.querySelector(".caption").textContent = c.caption;
  }
  el.style.opacity = String(opacity);
  el.style.transform = `translateY(${rise}px)`;
}

async function seek(t) {
  $("fade").style.opacity = String(1 - smooth(t / 0.6));
  reveal([...document.querySelectorAll(".title__line")], [T0 + BEAT, T0 + 3 * BEAT], t);

  if (t < chapterStart(0)) {
    // the opening: the whole library, before, the title coming in on the beats
    await drawPair("before", "before", "library", "library", 1, drift(FULL, t / chapterStart(0)));
    $("after").style.display = "none";
    $("bar").style.opacity = "0";
    $("tagBefore").style.opacity = String(smooth((t - (T0 + 5 * BEAT)) / 0.4));
    $("tagAfter").style.opacity = "0";
    $("noteNow").style.opacity = "0";
    $("notePrev").style.opacity = "0";
    $("end").style.display = "none";
    return;
  }

  const i = Math.min(CHAPTERS.length - 1, Math.floor((t - chapterStart(0)) / (CHAPTER_BARS * BAR)));
  const u = t - chapterStart(i);
  const s = chapterState(i, u);
  // in the end card the last chapter holds, wiped all the way
  await drawPair("before", "before", s.pair, s.prevPair, s.swap, s.cam);
  await drawPair("after", "after", s.pair, s.prevPair, s.swap, s.cam);

  // the slider: from the right edge to the left; what it has passed shows after
  const p = W * (1 - s.sweep);
  const after = $("after");
  after.style.display = "block";
  // between chapters the after picture fades away (the previous chapter's, fully wiped) before the next sweep
  const fadingOut = i > 0 && u < 0.35;
  after.style.clipPath = fadingOut ? "none" : `inset(0 0 0 ${p}px)`;
  after.style.opacity = fadingOut ? String(1 - s.reset) : "1";
  const bar = $("bar");
  bar.style.left = `${p}px`;
  const shown = smooth((u - (BAR - 0.55)) / 0.4) * (1 - smooth((u - 3 * BAR) / 0.4));
  bar.style.opacity = String(shown);

  // the tags brighten with the side that grows
  $("tagBefore").style.opacity = String(0.35 + 0.65 * (p / W));
  $("tagAfter").style.opacity = String((i === 0 ? smooth(u / 0.4) : 1) * (0.35 + 0.65 * s.sweep));

  // the chapter's chip and caption: the new one rises in as the old one leaves
  const k = smooth(u / 0.45);
  note($("noteNow"), CHAPTERS[i], k, (1 - k) * 18);
  if (i > 0) note($("notePrev"), CHAPTERS[i - 1], 1 - k, 0);
  else $("notePrev").style.opacity = "0";

  // the end card dissolves over the last chapter, its lines coming in on half beats, then black
  const e = t - END_START;
  const end = $("end");
  end.style.display = e > 0 ? "block" : "none";
  if (e > 0) {
    end.style.opacity = String(smooth(e / 0.6));
    reveal([...end.querySelectorAll(".end__body > *")], [0, 1, 2, 3, 4, 5].map((b) => b * (BEAT / 2)), e);
    $("fade").style.opacity = String(clamp((e - (END_BARS * BAR - 0.9)) / 0.9, 0, 1));
  }
}

await document.fonts.ready;
window.__film = { seek, duration: DURATION, fps: FPS };
document.documentElement.dataset.ready = "1";
