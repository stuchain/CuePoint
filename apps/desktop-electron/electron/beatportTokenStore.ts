/**
 * Where main keeps the Beatport token (C12): one encrypted file in the user-data folder.
 *
 * The file is `safeStorage`'s ciphertext of a small JSON `{ token, expires_at, source }`, so the
 * token is never on disk in the clear. When the operating system cannot protect it (no
 * encryption, or Linux's `basic_text` backend, which is a fixed password) the token is kept in
 * memory only, no file is written, and the person signs in again at the next launch. Reading
 * never fails: a missing or damaged file reads as signed out.
 *
 * Writing replaces the file whole through a temporary file beside it, the pattern of
 * `mainSettings.ts`. `safeStorage` is injected, so this runs in tests without Electron.
 *
 * On macOS the first use of `safeStorage` makes a key in the Keychain, and the Keychain may need
 * the person for that (no login keychain, or a build signed differently from the one that made
 * the key). The call waits for them on the main thread, so the app freezes until they answer. So
 * nothing here touches it until there is a token to keep or a file to read.
 */
import fs from "node:fs";
import path from "node:path";

import { writeAtomicSync } from "./atomicWrite";
import type { BeatportTokenOrigin, StoredBeatportToken } from "./beatportAuthRules";

/** The file's name, in `app.getPath("userData")`. */
export const BEATPORT_TOKEN_FILE = "beatport-token.bin";

/** The part of Electron's `safeStorage` this uses. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  /** Linux only; absent elsewhere. */
  getSelectedStorageBackend?(): string;
}

function parseStored(text: string): StoredBeatportToken | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const token = record.token;
  const source = record.source;
  if (typeof token !== "string" || token.trim() === "") return null;
  if (source !== "signin" && source !== "pasted") return null;
  const expires = record.expires_at;
  return {
    token: token.trim(),
    expires_at: typeof expires === "string" && !Number.isNaN(Date.parse(expires)) ? expires : null,
    source: source as BeatportTokenOrigin,
  };
}

export class BeatportTokenStore {
  /** What this launch holds; the only copy when storage is not secure. */
  private memory: StoredBeatportToken | null = null;
  private loaded = false;
  /** The last answer `isSecure` had from the system; null until it has asked. */
  private lastSecure: boolean | null = null;

  constructor(
    private readonly file: string,
    private readonly safeStorage: SafeStorageLike,
    /** Told when the file could not be removed (a message with no token in it). */
    private readonly onProblem: (message: string) => void = () => undefined,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  /** Whether the token is encrypted at rest and so survives a restart. Asks the system. */
  isSecure(): boolean {
    let secure: boolean;
    try {
      secure = this.safeStorage.isEncryptionAvailable() && this.safeStorage.getSelectedStorageBackend?.() !== "basic_text";
    } catch {
      secure = false;
    }
    this.lastSecure = secure;
    return secure;
  }

  /**
   * Whether a token kept now would survive a restart, for the Settings line. On macOS it does not
   * ask the Keychain (see above): the Keychain is always there, so the answer is yes until a save
   * or a read has asked and been told otherwise.
   */
  canKeep(): boolean {
    if (this.platform !== "darwin") return this.isSecure();
    return this.lastSecure ?? true;
  }

  /** The stored token; null when signed out, when the file is damaged or when it cannot be decrypted. */
  load(): StoredBeatportToken | null {
    if (this.loaded) return this.memory;
    this.loaded = true;
    // No file, nothing to decrypt: signed out, without asking the system anything.
    if (!fs.existsSync(this.file)) return this.memory;
    if (!this.isSecure()) return this.memory;
    try {
      const encrypted = fs.readFileSync(this.file);
      this.memory = parseStored(this.safeStorage.decryptString(encrypted));
    } catch {
      this.memory = null;
    }
    return this.memory;
  }

  /**
   * Remember the token, and write it when storage is secure. Returns whether it reached disk;
   * false means it will not survive a restart.
   */
  save(stored: StoredBeatportToken): boolean {
    this.memory = { token: stored.token.trim(), expires_at: stored.expires_at, source: stored.source };
    this.loaded = true;
    if (!this.isSecure()) {
      this.removeFile();
      return false;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const encrypted = this.safeStorage.encryptString(JSON.stringify(this.memory));
      writeAtomicSync(this.file, encrypted, { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }

  /** Forget the token and delete the file. */
  clear(): void {
    this.memory = null;
    this.loaded = true;
    this.removeFile();
  }

  /** Delete the file, trying once more if it will not go; a file left behind is reported. */
  private removeFile(): void {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        fs.rmSync(this.file, { force: true });
        return;
      } catch {
        /* tried once more below */
      }
    }
    this.onProblem("could not delete the stored beatport token");
  }
}
