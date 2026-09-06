/**
 * The machine's media keys, borrowed rather than taken (PLAYER-12).
 *
 * Electron's `globalShortcut` is global to the *operating system*: a registered
 * accelerator fires wherever the user is, and nothing else on the machine sees
 * that key while it is held. For Play/Pause, Next and Previous that is a strong
 * claim to make — every other media player wants the same three keys, and the
 * one that registers them last wins.
 *
 * So CuePoint holds them only while its window has focus, and gives them back
 * on blur. The user's keyboard behaves the way they expect: the media keys
 * drive whatever they are looking at, and CuePoint stops answering them the
 * moment they switch to something else. The alternative — holding them for the
 * whole session — means a player minimised three hours ago silently swallowing
 * the keys meant for the browser playing a video.
 *
 * Registration can also simply fail, because something else got there first.
 * That is not an error worth showing anyone: the keys keep working for whatever
 * holds them, and CuePoint's own transport is unaffected.
 *
 * Electron-free on purpose, so the policy above can be tested without a window.
 */

export const MEDIA_PLAY_PAUSE = "MediaPlayPause";
export const MEDIA_NEXT = "MediaNextTrack";
export const MEDIA_PREVIOUS = "MediaPreviousTrack";

/** The accelerators taken, in the order they are asked for. */
export const MEDIA_KEYS: readonly string[] = [MEDIA_PLAY_PAUSE, MEDIA_NEXT, MEDIA_PREVIOUS];

/** The shape of Electron's `globalShortcut`, narrowed to what is used. */
export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  isRegistered(accelerator: string): boolean;
}

export interface MediaKeyHandlers {
  playPause(): unknown;
  next(): unknown;
  previous(): unknown;
}

export class MediaKeyBinding {
  private held: string[] = [];

  constructor(
    private readonly registry: ShortcutRegistry,
    private readonly handlers: MediaKeyHandlers,
  ) {}

  /** Which accelerators this binding currently holds. */
  get accelerators(): readonly string[] {
    return [...this.held];
  }

  /**
   * Take the media keys, on focus.
   *
   * Idempotent: `focus` fires more than once in ordinary use — a window that is
   * restored, a dialog that closes — and registering twice would leave a
   * duplicate to unregister.
   */
  acquire(): void {
    if (this.held.length > 0) return;
    for (const [accelerator, handler] of this.bindings()) {
      // Something else on the machine already owns it. Their key, their rules.
      if (this.registry.isRegistered(accelerator)) continue;
      let taken = false;
      try {
        taken = this.registry.register(accelerator, () => {
          // A throw here would surface inside Electron's shortcut dispatch,
          // where nothing is listening for it.
          try {
            void handler();
          } catch {
            // Reported by the transport itself, if at all.
          }
        });
      } catch {
        taken = false;
      }
      if (taken) this.held.push(accelerator);
    }
  }

  /** Give them back, on blur or at quit. Safe to call when holding nothing. */
  release(): void {
    for (const accelerator of this.held.splice(0)) {
      try {
        this.registry.unregister(accelerator);
      } catch {
        // Already gone, or the registry is being torn down at quit.
      }
    }
  }

  private bindings(): Array<[string, () => unknown]> {
    return [
      [MEDIA_PLAY_PAUSE, () => this.handlers.playPause()],
      [MEDIA_NEXT, () => this.handlers.next()],
      [MEDIA_PREVIOUS, () => this.handlers.previous()],
    ];
  }
}
