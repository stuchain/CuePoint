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
