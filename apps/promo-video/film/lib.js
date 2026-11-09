// Small helpers the two films share: easing, a smooth camera through keyframes, frame loading.
export const FPS = 30;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** smootherstep: starts and stops with no jolt */
export const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
export const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
export const lerp = (a, b, k) => a + (b - a) * k;
export const $ = (id) => document.getElementById(id);

/**
 * A curve through keyframes [[t, v], ...] that never overshoots and keeps its speed across keyframes
 * (monotone cubic, Fritsch-Carlson), so a camera through several points moves as one gesture.
 */
export function curve(keys) {
  const n = keys.length;
  const t = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (t[i + 1] - t[i]));
  const m = [d[0] ?? 0];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]));
  m.push(d[n - 2] ?? 0);
  // keyframes that start or end a move start and end at rest
  m[0] = 0;
  m[n - 1] = 0;
  return (x) => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0;
    while (x > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    const s = (x - t[i]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

/** Put src into img and wait until it can be drawn. */
export async function show(img, src) {
  if (img.getAttribute("src") === src) return;
  img.setAttribute("src", src);
  await img.decode().catch(() => undefined);
}

/**
 * Frame a 1280 x 800 window picture into a box W x H: the window point (cx, cy) kept centred at zoom z (1 = the
 * whole window across the box's width), never showing past the picture's edges once it fills the box.
 */
export function place(img, W, H, cx, cy, z) {
  const scale = (W / 1280) * z;
  const iw = 1280 * scale;
  const ih = 800 * scale;
  const left = iw <= W ? (W - iw) / 2 : clamp(W / 2 - cx * scale, W - iw, 0);
  const top = ih <= H ? (H - ih) / 2 : clamp(H / 2 - cy * scale, H - ih, 0);
  Object.assign(img.style, { width: `${iw}px`, height: `${ih}px`, transform: `translate(${left}px, ${top}px)` });
  return { scale, left, top };
}

/** Lines that rise in, each from its own second. */
export function reveal(els, starts, t) {
  els.forEach((el, i) => {
    const k = (t - starts[i]) / 0.5;
    el.style.opacity = String(smooth(k));
    el.style.transform = `translateY(${(1 - easeOut(k)) * 28}px)`;
  });
}
