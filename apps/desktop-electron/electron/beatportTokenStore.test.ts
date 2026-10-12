import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BEATPORT_TOKEN_FILE, BeatportTokenStore, type SafeStorageLike } from "./beatportTokenStore";
import type { StoredBeatportToken } from "./beatportAuthRules";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tokenFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-bp-"));
  made.push(dir);
  return path.join(dir, BEATPORT_TOKEN_FILE);
}

/** A "cipher" that is visibly not the plaintext: reversed bytes behind a marker. */
function fakeSafeStorage(options: { available?: boolean; backend?: string } = {}): SafeStorageLike {
  const { available = true, backend } = options;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${[...plain].reverse().join("")}`, "utf8"),
    decryptString: (buffer) => {
      const text = buffer.toString("utf8");
      if (!text.startsWith("enc:")) throw new Error("cannot decrypt");
      return [...text.slice(4)].reverse().join("");
    },
    ...(backend ? { getSelectedStorageBackend: () => backend } : {}),
  };
}

const SIGNIN: StoredBeatportToken = { token: "secret-token-abcd", expires_at: "2030-01-01T00:00:00.000Z", source: "signin" };

describe("a secure store", () => {
  it("round-trips through a file that does not hold the token in the clear", () => {
    const file = tokenFile();
    const store = new BeatportTokenStore(file, fakeSafeStorage());
    expect(store.save(SIGNIN)).toBe(true);

    expect(fs.readFileSync(file).toString("utf8")).not.toContain("secret-token-abcd");
    expect(new BeatportTokenStore(file, fakeSafeStorage()).load()).toEqual(SIGNIN);
  });

  it("keeps the source of a pasted token", () => {
    const file = tokenFile();
    const pasted: StoredBeatportToken = { token: "pasted-1", expires_at: null, source: "pasted" };
    new BeatportTokenStore(file, fakeSafeStorage()).save(pasted);
    expect(new BeatportTokenStore(file, fakeSafeStorage()).load()).toEqual(pasted);
  });

  it("writes through a temporary file that is gone afterwards", () => {
    const file = tokenFile();
    new BeatportTokenStore(file, fakeSafeStorage()).save(SIGNIN);
    expect(fs.readdirSync(path.dirname(file))).toEqual([BEATPORT_TOKEN_FILE]);
  });

  it("leaves the old file when the write fails, and says so", () => {
    const file = tokenFile();
    const store = new BeatportTokenStore(file, fakeSafeStorage());
    store.save(SIGNIN);
    const failing = fakeSafeStorage();
    failing.encryptString = () => {
      throw new Error("keychain locked");
    };
    const second = new BeatportTokenStore(file, failing);
    expect(second.save({ ...SIGNIN, token: "newer-token-0000" })).toBe(false);
    expect(fs.readdirSync(path.dirname(file))).toEqual([BEATPORT_TOKEN_FILE]);
    expect(new BeatportTokenStore(file, fakeSafeStorage()).load()?.token).toBe("secret-token-abcd");
  });

  it("is signed out when there is no file", () => {
    expect(new BeatportTokenStore(tokenFile(), fakeSafeStorage()).load()).toBeNull();
  });

  it.each([
    ["garbage bytes", Buffer.from([0, 1, 2, 3])],
    ["ciphertext of text that is not JSON", Buffer.from("enc:" + [..."{nope"].reverse().join(""))],
    ["JSON of the wrong shape", fakeSafeStorage().encryptString('["a"]')],
    ["JSON with no token", fakeSafeStorage().encryptString('{"source":"signin"}')],
    ["JSON with an unknown source", fakeSafeStorage().encryptString('{"token":"x","source":"other"}')],
  ])("reads %s as signed out", (_name, bytes) => {
    const file = tokenFile();
    fs.writeFileSync(file, bytes);
    expect(new BeatportTokenStore(file, fakeSafeStorage()).load()).toBeNull();
  });

  it("drops an end it cannot read", () => {
    const file = tokenFile();
    fs.writeFileSync(file, fakeSafeStorage().encryptString('{"token":"x-token","source":"signin","expires_at":"soon"}'));
    expect(new BeatportTokenStore(file, fakeSafeStorage()).load()).toEqual({
      token: "x-token",
      expires_at: null,
      source: "signin",
    });
  });

  it("clears the file and the memory", () => {
    const file = tokenFile();
    const store = new BeatportTokenStore(file, fakeSafeStorage());
    store.save(SIGNIN);
    store.clear();
    expect(fs.existsSync(file)).toBe(false);
    expect(store.load()).toBeNull();
    expect(new BeatportTokenStore(file, fakeSafeStorage()).load()).toBeNull();
  });
});

describe.each([
  ["encryption is unavailable", { available: false }],
  ["Linux has only the basic_text backend", { backend: "basic_text" }],
])("when %s", (_name, options) => {
  it("is not secure, writes no file, and holds the token for this launch only", () => {
    const file = tokenFile();
    const store = new BeatportTokenStore(file, fakeSafeStorage(options));
    expect(store.isSecure()).toBe(false);

    expect(store.save(SIGNIN)).toBe(false);
    expect(fs.existsSync(file)).toBe(false);
    expect(store.load()).toEqual(SIGNIN);

    // The next launch starts signed out.
    expect(new BeatportTokenStore(file, fakeSafeStorage(options)).load()).toBeNull();
  });

  it("removes a file an earlier launch left", () => {
    const file = tokenFile();
    new BeatportTokenStore(file, fakeSafeStorage()).save(SIGNIN);
    const store = new BeatportTokenStore(file, fakeSafeStorage(options));
    store.save({ ...SIGNIN, token: "later-token-1111" });
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe("clearing", () => {
  it("tries the delete a second time and reports one that will not go", () => {
    const file = tokenFile();
    const problems: string[] = [];
    const store = new BeatportTokenStore(file, fakeSafeStorage(), (m) => problems.push(m));
    store.save(SIGNIN);
    const rm = vi.spyOn(fs, "rmSync");
    rm.mockImplementation(() => {
      throw new Error("EBUSY");
    });
    store.clear();
    expect(rm).toHaveBeenCalledTimes(2);
    expect(problems).toEqual(["could not delete the stored beatport token"]);
    expect(problems.join()).not.toContain("secret-token");
    rm.mockRestore();
  });

  it("succeeds on the retry quietly", () => {
    const file = tokenFile();
    const problems: string[] = [];
    const store = new BeatportTokenStore(file, fakeSafeStorage(), (m) => problems.push(m));
    store.save(SIGNIN);
    const real = fs.rmSync.bind(fs);
    const rm = vi.spyOn(fs, "rmSync");
    rm.mockImplementationOnce(() => {
      throw new Error("EBUSY");
    });
    rm.mockImplementation(real);
    store.clear();
    expect(fs.existsSync(file)).toBe(false);
    expect(problems).toEqual([]);
    rm.mockRestore();
  });
});

describe("the macOS Keychain", () => {
  /** A safeStorage that counts every call: on macOS each can wait for the person. */
  function counted() {
    const storage = fakeSafeStorage();
    let calls = 0;
    const wrap = <A extends unknown[], R>(f: (...args: A) => R) => (...args: A): R => {
      calls += 1;
      return f(...args);
    };
    return {
      storage: {
        isEncryptionAvailable: wrap(storage.isEncryptionAvailable),
        encryptString: wrap(storage.encryptString),
        decryptString: wrap(storage.decryptString),
      } satisfies SafeStorageLike,
      calls: () => calls,
    };
  }

  it("is not asked by a signed-out launch: no file to read, and the Settings line", () => {
    const { storage, calls } = counted();
    const store = new BeatportTokenStore(tokenFile(), storage, undefined, "darwin");
    expect(store.load()).toBeNull();
    expect(store.canKeep()).toBe(true);
    expect(calls()).toBe(0);
  });

  it("is asked to read a file that is there, and to keep a token", () => {
    const file = tokenFile();
    new BeatportTokenStore(file, fakeSafeStorage(), undefined, "darwin").save(SIGNIN);
    const { storage, calls } = counted();
    expect(new BeatportTokenStore(file, storage, undefined, "darwin").load()).toEqual(SIGNIN);
    expect(calls()).toBeGreaterThan(0);
  });

  it("says a token will not survive a restart once the Keychain has said no", () => {
    const store = new BeatportTokenStore(tokenFile(), fakeSafeStorage({ available: false }), undefined, "darwin");
    expect(store.canKeep()).toBe(true);
    expect(store.save(SIGNIN)).toBe(false);
    expect(store.canKeep()).toBe(false);
  });

  it("elsewhere the Settings line asks the system, which needs nobody", () => {
    const store = new BeatportTokenStore(tokenFile(), fakeSafeStorage({ backend: "basic_text" }), undefined, "linux");
    expect(store.canKeep()).toBe(false);
  });
});

describe("the storage backends", () => {
  it.each(["gnome_libsecret", "kwallet5", "kwallet6", "kwallet"])("%s is secure", (backend) => {
    expect(new BeatportTokenStore(tokenFile(), fakeSafeStorage({ backend })).isSecure()).toBe(true);
  });

  it("is not secure when asking throws", () => {
    const storage = fakeSafeStorage();
    storage.isEncryptionAvailable = () => {
      throw new Error("not ready");
    };
    expect(new BeatportTokenStore(tokenFile(), storage).isSecure()).toBe(false);
  });
});
