/**
 * The error-reporting choice, stored once and read everywhere (REPORT-01, DEC-128).
 *
 * Main owns the choice because main starts first. The file holds it
 * (`main-settings.json`); the engine learns it from its environment at launch
 * and from `POST /api/v1/reporting` while it runs. Nothing here sends anything.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the
 * app, so it can be tested.
 */
import type { MainSettingsStore } from "./mainSettings";

export interface ErrorReportingState {
  enabled: boolean;
}

export class ErrorReportingChoice {
  private current: boolean | null = null;
  /** The engine's calls, one after another, so the last choice is the last told. */
  private told: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: Pick<MainSettingsStore, "read" | "update">,
    private readonly tellEngine: (enabled: boolean) => Promise<unknown>,
  ) {}

  /** Read synchronously from the file; call before `app.whenReady`. Cached after. */
  enabled(): boolean {
    this.current ??= this.store.read().errorReporting;
    return this.current;
  }

  /**
   * Write the file first, then tell the engine. An engine that is down or
   * refuses does not fail the call: the next launch reads the file through the
   * environment. Rejects only when the file cannot be written, and then the
   * choice is unchanged. The error is plain words: a Node error can name the
   * user's home folder, and this one reaches the panel.
   */
  async set(enabled: boolean): Promise<ErrorReportingState> {
    let stored: boolean;
    try {
      stored = this.store.update({ errorReporting: enabled }).errorReporting;
    } catch {
      throw new Error("The setting could not be saved.");
    }
    this.current = stored;
    const sent = this.told.then(() => this.tellEngine(stored)).catch(() => {
      // The file is the source of truth; the engine reads it at its next start.
    });
    this.told = sent;
    await sent;
    return { enabled: stored };
  }
}
