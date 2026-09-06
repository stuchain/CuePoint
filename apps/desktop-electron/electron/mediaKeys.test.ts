import { describe, expect, it, vi } from "vitest";

import {
  MEDIA_KEYS,
  MEDIA_NEXT,
  MEDIA_PLAY_PAUSE,
  MEDIA_PREVIOUS,
  MediaKeyBinding,
  type ShortcutRegistry,
} from "./mediaKeys";

/**
 * Borrowing the machine's media keys (PLAYER-12).
 *
 * These accelerators are global to the operating system, which makes the
 * *release* the part worth testing rather than the register. A binding that
 * held Play/Pause after CuePoint lost focus would silently swallow the key
 * meant for the browser playing a video — a bug nobody would attribute to a
 * music player they minimised an hour ago.
 */

function registry() {
  const held = new Map<string, () => void>();
  const attempts: string[] = [];
  const fake: ShortcutRegistry & {
    held: Map<string, () => void>;
    attempts: string[];
    press(accelerator: string): void;
    /** Pretend something else on the machine already owns this key. */
    takenByAnother(accelerator: string): void;
    failOn?: string;
    throwOn?: string;
  } = {
    held,
    attempts,
    register(accelerator, callback) {
      attempts.push(accelerator);
      if (fake.throwOn === accelerator) throw new Error("registry exploded");
      if (fake.failOn === accelerator) return false;
      held.set(accelerator, callback);
      return true;
    },
    unregister(accelerator) {
      held.delete(accelerator);
    },
    isRegistered(accelerator) {
      return held.has(accelerator);
    },
    press(accelerator) {
      held.get(accelerator)?.();
    },
    takenByAnother(accelerator) {
      held.set(accelerator, () => undefined);
    },
  };
  return fake;
}

function handlers() {
  return { playPause: vi.fn(), next: vi.fn(), previous: vi.fn() };
}

describe("holding the keys", () => {
  it("takes all three on focus", () => {
    const fake = registry();
    const binding = new MediaKeyBinding(fake, handlers());

    binding.acquire();

    expect([...fake.held.keys()]).toEqual([...MEDIA_KEYS]);
    expect(binding.accelerators).toEqual([...MEDIA_KEYS]);
  });

  it("drives the transport when a key is pressed", () => {
    const fake = registry();
    const actions = handlers();
    new MediaKeyBinding(fake, actions).acquire();

    fake.press(MEDIA_PLAY_PAUSE);
    fake.press(MEDIA_NEXT);
    fake.press(MEDIA_PREVIOUS);

    expect(actions.playPause).toHaveBeenCalledTimes(1);
    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.previous).toHaveBeenCalledTimes(1);
  });

  it("gives them all back on blur", () => {
    // The whole point: while CuePoint is not in front, the media keys belong
    // to whatever is.
    const fake = registry();
    const binding = new MediaKeyBinding(fake, handlers());
    binding.acquire();

    binding.release();

    expect([...fake.held.keys()]).toEqual([]);
    expect(binding.accelerators).toEqual([]);
  });

  it("takes them again after giving them back", () => {
    const fake = registry();
    const binding = new MediaKeyBinding(fake, handlers());
    binding.acquire();
    binding.release();

    binding.acquire();

    expect([...fake.held.keys()]).toEqual([...MEDIA_KEYS]);
  });

  it("does not register twice when focus fires twice", () => {
    // `focus` fires on a restore, and again when a dialog closes. Registering
    // twice would leave a duplicate that one release does not undo.
    const fake = registry();
    const binding = new MediaKeyBinding(fake, handlers());

    binding.acquire();
    binding.acquire();

    expect(fake.attempts).toEqual([...MEDIA_KEYS]);
  });

  it("does nothing when released without holding anything", () => {
    const fake = registry();

    expect(() => new MediaKeyBinding(fake, handlers()).release()).not.toThrow();
  });
});

describe("when the keys are not available", () => {
  it("leaves a key another application already holds alone", () => {
    const fake = registry();
    fake.takenByAnother(MEDIA_NEXT);
    const binding = new MediaKeyBinding(fake, handlers());

    binding.acquire();

    expect(binding.accelerators).toEqual([MEDIA_PLAY_PAUSE, MEDIA_PREVIOUS]);
    // And releasing does not take away the one that was never ours.
    binding.release();
    expect(fake.isRegistered(MEDIA_NEXT)).toBe(true);
  });

  it("keeps the others when one registration is refused", () => {
    const fake = registry();
    fake.failOn = MEDIA_PLAY_PAUSE;
    const binding = new MediaKeyBinding(fake, handlers());

    binding.acquire();

    expect(binding.accelerators).toEqual([MEDIA_NEXT, MEDIA_PREVIOUS]);
  });

  it("keeps the others when one registration throws", () => {
    const fake = registry();
    fake.throwOn = MEDIA_NEXT;
    const binding = new MediaKeyBinding(fake, handlers());

    expect(() => binding.acquire()).not.toThrow();
    expect(binding.accelerators).toEqual([MEDIA_PLAY_PAUSE, MEDIA_PREVIOUS]);
  });

  it("survives a transport that throws", () => {
    // The callback runs inside Electron's shortcut dispatch, where nothing is
    // listening for a rejected promise or a thrown error.
    const fake = registry();
    const actions = handlers();
    actions.playPause.mockImplementation(() => {
      throw new Error("no player");
    });
    new MediaKeyBinding(fake, actions).acquire();

    expect(() => fake.press(MEDIA_PLAY_PAUSE)).not.toThrow();
  });

  it("survives a transport whose promise rejects", () => {
    const fake = registry();
    const actions = handlers();
    actions.next.mockRejectedValue(new Error("no player"));
    new MediaKeyBinding(fake, actions).acquire();

    expect(() => fake.press(MEDIA_NEXT)).not.toThrow();
  });

  it("survives a registry that throws on unregister", () => {
    // Which is what a registry being torn down at quit does.
    const fake = registry();
    const binding = new MediaKeyBinding(fake, handlers());
    binding.acquire();
    fake.unregister = () => {
      throw new Error("shutting down");
    };

    expect(() => binding.release()).not.toThrow();
    expect(binding.accelerators).toEqual([]);
  });
});

/**
 * The macOS Accessibility gate (PLAYER-12, macOS pass row 8).
 *
 * On macOS `globalShortcut.register` returns `false` for media keys until the
 * user grants Accessibility — the identical answer it gives when another
 * application owns the key. Phase 5 shipped treating both as "their key, their
 * rules", so on macOS the media keys silently never worked and nothing said so.
 * A probe on macOS 26.6 returned `isTrustedAccessibilityClient: false` with all
 * three accelerators refused.
 */
describe("media keys behind a permission the OS may refuse", () => {
  function permission(granted: boolean) {
    return {
      granted: vi.fn(() => granted),
      request: vi.fn(),
    };
  }

  it("does not ask the registry for keys the OS has already refused", () => {
    const fake = registry();
    const gate = permission(false);
    const binding = new MediaKeyBinding(fake, handlers(), { permission: gate });

    binding.acquire();

    // Attempting anyway is not merely wasteful: it makes the failure
    // indistinguishable from another app owning the key.
    expect(fake.attempts).toEqual([]);
    expect(binding.accelerators).toEqual([]);
    expect(binding.status).toBe("unavailable");
  });

  it("reports unavailable rather than leaving the user to press a dead key", () => {
    const states: string[] = [];
    const binding = new MediaKeyBinding(registry(), handlers(), {
      permission: permission(false),
      onStateChange: (state) => states.push(state),
    });

    binding.acquire();

    expect(states).toEqual(["unavailable"]);
  });

  it("asks for the permission once, not on every focus", () => {
    // The prompt is modal to the user's attention. One that reappears whenever
    // the window regains focus is worse than the feature it is about.
    const gate = permission(false);
    const binding = new MediaKeyBinding(registry(), handlers(), { permission: gate });

    binding.acquire();
    binding.release();
    binding.acquire();
    binding.release();
    binding.acquire();

    expect(gate.request).toHaveBeenCalledTimes(1);
  });

  it("reports the permission problem once, however often focus changes", () => {
    const states: string[] = [];
    const binding = new MediaKeyBinding(registry(), handlers(), {
      permission: permission(false),
      onStateChange: (state) => states.push(state),
    });

    binding.acquire();
    binding.release();
    binding.acquire();

    // Not ["unavailable", "idle", "unavailable"]: a permission that is still
    // missing has not changed, and a toast per focus change is noise.
    expect(states).toEqual(["unavailable"]);
  });

  it("takes the keys as soon as the permission is granted", () => {
    // The user grants it in System Settings while CuePoint is running; the next
    // focus has to pick it up without a restart.
    const fake = registry();
    let granted = false;
    const binding = new MediaKeyBinding(fake, handlers(), {
      permission: { granted: () => granted, request: () => undefined },
    });

    binding.acquire();
    expect(binding.accelerators).toEqual([]);

    granted = true;
    binding.release();
    binding.acquire();

    expect(binding.accelerators).toEqual(MEDIA_KEYS);
    expect(binding.status).toBe("held");
  });

  it("still holds the keys where nothing gates them", () => {
    // Windows and Linux pass no permission at all, and must be unaffected.
    const binding = new MediaKeyBinding(registry(), handlers());

    binding.acquire();

    expect(binding.accelerators).toEqual(MEDIA_KEYS);
    expect(binding.status).toBe("held");
  });

  it("separates a refused permission from keys another app owns", () => {
    // Both look like "registered nothing". Only one is worth telling anyone.
    const fake = registry();
    for (const key of MEDIA_KEYS) fake.takenByAnother(key);
    const binding = new MediaKeyBinding(fake, handlers(), { permission: permission(true) });

    binding.acquire();

    expect(binding.accelerators).toEqual([]);
    expect(binding.status).toBe("taken");
  });

  it("survives a permission check that throws", () => {
    const binding = new MediaKeyBinding(registry(), handlers(), {
      permission: {
        granted: () => false,
        request: () => {
          throw new Error("no system preferences here");
        },
      },
    });

    expect(() => binding.acquire()).not.toThrow();
    expect(binding.status).toBe("unavailable");
  });
});
