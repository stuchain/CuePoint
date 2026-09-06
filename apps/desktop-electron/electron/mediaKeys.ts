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

/**
 * Whether this OS will let the process take global media keys at all (macOS).
 *
 * Windows hands them to whoever asks first. macOS gates them behind the
 * Accessibility permission, and until it is granted `register` simply returns
 * `false` — the same answer it gives when another app owns the key. Those two
 * cases need opposite responses: one is "their key, their rules" and correct to
 * ignore, the other is "this feature does not work and never will until the
 * user is told", and CuePoint told nobody. Injected rather than imported so the
 * policy stays testable without an Electron runtime.
 */
export interface MediaKeyPermission {
  /** True when the OS has granted it. Called on every acquire; must be cheap. */
  granted(): boolean;
  /**
   * Ask for it, which on macOS opens System Settings' prompt.
   *
   * Called at most once per session: the prompt is modal to the user's
   * attention, and one that reappears on every focus is worse than the missing
   * feature it is about.
   */
  request(): void;
}

/**
 * What the binding is currently doing, for whoever has to explain it.
 *
 * `unavailable` is the only value that deserves telling the user about: the
 * others are either working or a key legitimately owned by something else.
 */
export type MediaKeyState =
  /** Holding at least one accelerator. */
  | "held"
  /** The OS refuses global media keys to this process (macOS Accessibility). */
  | "unavailable"
  /** Everything asked for is owned by another application. */
  | "taken"
  /** Nothing held because nothing has been asked for yet. */
  | "idle";

export interface MediaKeyHandlers {
  playPause(): unknown;
  next(): unknown;
  previous(): unknown;
}

export interface MediaKeyBindingOptions {
  /** Absent on platforms that gate nothing, which is every one but macOS. */
  permission?: MediaKeyPermission;
  /**
   * Called when the state changes, so the app can say the keys are unavailable
   * rather than leaving the user to discover it by pressing one.
   */
  onStateChange?: (state: MediaKeyState) => void;
}

export class MediaKeyBinding {
  private held: string[] = [];
  private state: MediaKeyState = "idle";
  private requestedPermission = false;

  constructor(
    private readonly registry: ShortcutRegistry,
    private readonly handlers: MediaKeyHandlers,
    private readonly options: MediaKeyBindingOptions = {},
  ) {}

  /** Which accelerators this binding currently holds. */
  get accelerators(): readonly string[] {
    return [...this.held];
  }

  /** What happened the last time the keys were asked for. */
  get status(): MediaKeyState {
    return this.state;
  }

  private setState(next: MediaKeyState): void {
    if (this.state === next) return;
    this.state = next;
    this.options.onStateChange?.(next);
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

    // Asking the OS for a key it has already decided to refuse burns nothing,
    // but it does make "registration failed" ambiguous. Settle the permission
    // question first so the outcome can be attributed.
    const permission = this.options.permission;
    if (permission && !permission.granted()) {
      this.setState("unavailable");
      if (!this.requestedPermission) {
        this.requestedPermission = true;
        try {
          permission.request();
        } catch {
          // Asking is best-effort; a refusal to even ask is still "unavailable".
        }
      }
      return;
    }

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

    // "taken" rather than "unavailable": on a platform that gates nothing, or
    // once the gate is open, holding none of them means other applications got
    // there first — which is the documented, acceptable outcome.
    this.setState(this.held.length > 0 ? "held" : "taken");
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
    // Not "unavailable": giving the keys back on blur says nothing about
    // whether they could be taken again, and a permission problem already
    // reported must not be re-reported every time the window loses focus.
    if (this.state !== "unavailable") this.setState("idle");
  }

  private bindings(): Array<[string, () => unknown]> {
    return [
      [MEDIA_PLAY_PAUSE, () => this.handlers.playPause()],
      [MEDIA_NEXT, () => this.handlers.next()],
      [MEDIA_PREVIOUS, () => this.handlers.previous()],
    ];
  }
}
