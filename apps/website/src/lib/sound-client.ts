import { AUDIO_LEVEL_EVENT, loopLevel } from "./loop";

/**
 * The speaker button's behavior (DEC-191). Nothing here runs until the visitor presses the button: no
 * AudioContext is made and no file is fetched before that. Pressed, it plays the loop and publishes the
 * sound's level on `document` as AUDIO_LEVEL_EVENT, which the 3D scene reads to move its voxels. Pressed
 * again, or when the tab is hidden, it stops, and the level goes back to 0.
 */

interface Playing {
  audio: HTMLAudioElement;
  context: AudioContext;
  analyser: AnalyserNode;
  frame: number;
}

let playing: Playing | undefined;
let prepared: Omit<Playing, "frame"> | undefined;

function publish(level: number): void {
  document.dispatchEvent(new CustomEvent<number>(AUDIO_LEVEL_EVENT, { detail: level }));
}

function prepare(src: string): Omit<Playing, "frame"> {
  if (prepared) return prepared;
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;
  context.createMediaElementSource(audio).connect(analyser);
  analyser.connect(context.destination);
  prepared = { audio, context, analyser };
  return prepared;
}

function setState(button: HTMLElement, on: boolean): void {
  // the label stays "Sound"; aria-pressed says whether it is on
  button.setAttribute("aria-pressed", String(on));
}

async function start(button: HTMLElement, src: string): Promise<void> {
  const p = prepare(src);
  await p.context.resume();
  await p.audio.play();
  const bins = new Uint8Array(p.analyser.frequencyBinCount);
  const tick = (): void => {
    p.analyser.getByteFrequencyData(bins);
    publish(loopLevel(bins.subarray(0, 24))); // the low end carries the beat
    if (playing) playing.frame = requestAnimationFrame(tick);
  };
  playing = { ...p, frame: requestAnimationFrame(tick) };
  setState(button, true);
}

function stop(button: HTMLElement): void {
  if (!playing) return;
  cancelAnimationFrame(playing.frame);
  playing.audio.pause();
  playing = undefined;
  publish(0);
  setState(button, false);
}

function init(): void {
  const button = document.querySelector<HTMLElement>("[data-sound-toggle]");
  const src = button?.dataset["loopSrc"];
  if (!button || !src) return;
  button.addEventListener("click", () => {
    if (playing) stop(button);
    else void start(button, src).catch(() => setState(button, false)); // a blocked or failed play leaves it off
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(button);
  });
}

init();
