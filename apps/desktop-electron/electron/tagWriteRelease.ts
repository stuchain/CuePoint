/**
 * The player lets go of a file while a tag write rewrites it (HARDEN-04).
 *
 * A tag write replaces the audio file with a checked copy. Windows will not replace a file
 * another program holds open, and mpv holds the one it is playing, so a write that includes
 * the loaded track would fail as "in use". Here, main (which knows both the player and which
 * files a job will touch) stops playback of that one track before the job starts, and loads
 * it again where it was, as paused as it was, once the job has ended.
 *
 * Which files: a write or Sync job starts from a kept preview, whose changes name the files
 * (remembered here as the preview goes past); a restore names a write job, whose record names
 * them. Anything main cannot name is left alone, and the write then reports the file as in use
 * rather than the player being stopped for nothing.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the app, so it can be
 * tested with fakes.
 */
import { samePath, type PlaybackRelease } from "./playbackController";

export interface ReleasablePlayback {
  releaseFiles(paths: ReadonlySet<string>): Promise<PlaybackRelease | null>;
  reacquire(release: PlaybackRelease): Promise<void>;
}

interface PreviewLike {
  preview?: { preview_id?: string; changes?: Array<{ file_path?: string }> } | null;
}

interface WriteRecordLike {
  writes?: Array<{ file_path?: string }>;
  total?: number;
}

export interface TagWriteReleaseDeps {
  playback: ReleasablePlayback;
  /** A job's state, as the engine words it ("queued", "running", "succeeded", ...). */
  jobState(jobId: string): Promise<string>;
  /** A write job's record: the files it wrote. */
  jobFiles(jobId: string): Promise<WriteRecordLike>;
  /** Waits between looks at a job; replaced in tests. */
  wait?: (milliseconds: number) => Promise<void>;
  /** Told of anything that went wrong; the write itself never fails because of this. */
  report?: (message: string, error: unknown) => void;
}

const POLL_MS = 750;
const KEPT_PREVIEWS = 20;
const RESTORE_FILES_LIMIT = 5000;

function isRunning(state: string): boolean {
  return state === "queued" || state === "running" || state === "pending";
}

export class TagWriteRelease {
  private readonly previews = new Map<string, Set<string>>();

  constructor(private readonly deps: TagWriteReleaseDeps) {}

  /** Remember the files a preview would write, as its answer goes to the page. */
  notePreview<T>(answer: T): T {
    const preview = (answer as PreviewLike | null)?.preview;
    if (preview?.preview_id) {
      const files = new Set<string>();
      for (const change of preview.changes ?? []) {
        if (change.file_path) files.add(samePath(change.file_path));
      }
      this.previews.delete(preview.preview_id);
      this.previews.set(preview.preview_id, files);
      while (this.previews.size > KEPT_PREVIEWS) {
        const oldest = this.previews.keys().next().value;
        if (oldest === undefined) break;
        this.previews.delete(oldest);
      }
    }
    return answer;
  }

  /** Start a write or Sync job from a kept preview, with the player let go of its file. */
  startFromPreview<T extends { job_id?: string }>(previewId: string, start: () => Promise<T>): Promise<T> {
    return this.around(async () => this.previews.get(previewId) ?? new Set<string>(), start);
  }

  /** Start a restore of a write job, with the player let go of its file. */
  startRestore<T extends { job_id?: string }>(jobId: string | undefined, start: () => Promise<T>): Promise<T> {
    if (!jobId) return start();
    return this.around(async () => {
      const record = await this.deps.jobFiles(jobId);
      return new Set((record.writes ?? []).flatMap((w) => (w.file_path ? [samePath(w.file_path)] : [])));
    }, start);
  }

  private async around<T extends { job_id?: string }>(
    files: () => Promise<Set<string>>,
    start: () => Promise<T>,
  ): Promise<T> {
    let release: PlaybackRelease | null = null;
    try {
      const wanted = await files();
      if (wanted.size > 0) release = await this.deps.playback.releaseFiles(wanted);
    } catch (error) {
      this.deps.report?.("could not release the loaded file before a tag write", error);
    }
    if (!release) return start();

    let started: T;
    try {
      started = await start();
    } catch (error) {
      await this.bringBack(release);
      throw error;
    }
    if (started.job_id) void this.afterJob(started.job_id, release);
    else await this.bringBack(release);
    return started;
  }

  private async afterJob(jobId: string, release: PlaybackRelease): Promise<void> {
    const wait = this.deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    try {
      for (;;) {
        let state: string;
        try {
          state = await this.deps.jobState(jobId);
        } catch {
          break; // The engine is gone or the job unknown: nothing more will happen to the file.
        }
        if (!isRunning(state)) break;
        await wait(POLL_MS);
      }
    } finally {
      await this.bringBack(release);
    }
  }

  private async bringBack(release: PlaybackRelease): Promise<void> {
    try {
      await this.deps.playback.reacquire(release);
    } catch (error) {
      this.deps.report?.("could not load the track again after a tag write", error);
    }
  }
}

export { RESTORE_FILES_LIMIT };
