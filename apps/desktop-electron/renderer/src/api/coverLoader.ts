/**
 * The covers the renderer draws from the guarded artwork route (DEC-076): Discover's card
 * pictures and Clean's candidate covers.
 *
 * Each answer is an object URL the preload made, holding an image in memory until
 * `releaseTrackArtwork` lets it go. Asking for every cover on mount, keeping none and
 * cancelling nothing sent hundreds of requests at once: the engine's other reads queued behind
 * them, and coming back to a page asked for every cover again. Here:
 *
 * - an answer is kept per key (whatever names the image: run, kind, key and size; a candidate
 *   and size), so a page shown again draws its covers at once without asking;
 * - the cache is bounded, least recently used first out; an evicted URL is released, never one
 *   a mounted cover is drawing (it is held until that cover lets it go);
 * - at most `maxInFlight` requests run at once, the rest wait in order;
 * - a waiting request nobody wants any more (its cover went, or scrolled away) is dropped
 *   before it is sent; one already sent finishes and fills the cache.
 *
 * "No picture" (a null answer) is kept too, so it is not asked again; a failed request is not,
 * so a later mount tries again.
 */

/** The bridge's answer for one cover: an object URL, or null when there is none. */
export type CoverFetch = () => Promise<string | null>;

export interface CoverLoaderOptions {
  /** Kept answers before the least recently used are released (held ones are never). */
  maxEntries?: number;
  /** Requests sent at once. */
  maxInFlight?: number;
  /** Lets an object URL go; the default is the bridge's `releaseTrackArtwork`. */
  release?: (url: string) => void;
}

export interface CoverLoader {
  /**
   * The kept answer for `key` (a URL, or null for "no picture"), held until `letGo`; undefined
   * when nothing is kept, and then nothing is held.
   */
  hold(key: string): string | null | undefined;
  /** Lets go of one `hold`; an answer nobody holds may be evicted. */
  letGo(key: string): void;
  /**
   * Asks for `key` once it is its turn; `done` is called when the answer is kept (or the
   * request failed). Returns a cancel: a request not yet sent is dropped when nobody waits for
   * it any more; one already sent still finishes and fills the cache.
   */
  request(key: string, fetch: CoverFetch, done: () => void): () => void;
  /** Counts, for tests and diagnostics. */
  stats(): { kept: number; inFlight: number; waiting: number };
  /** Releases every kept URL and forgets every request (a reset; answers still arriving are released). */
  clear(): void;
}

/** About a few screens of cards. */
export const COVER_CACHE_ENTRIES = 300;
/** Browsers allow about six connections per host: more would only queue in the engine. */
export const COVER_MAX_IN_FLIGHT = 6;

interface Kept {
  url: string | null;
  holds: number;
}

interface Job {
  key: string;
  fetch: CoverFetch;
  waiters: Set<() => void>;
  sent: boolean;
}

function bridgeRelease(url: string): void {
  if (typeof window === "undefined") return;
  window.cuepoint?.releaseTrackArtwork?.(url);
}

export function createCoverLoader(options: CoverLoaderOptions = {}): CoverLoader {
  const maxEntries = Math.max(1, options.maxEntries ?? COVER_CACHE_ENTRIES);
  const maxInFlight = Math.max(1, options.maxInFlight ?? COVER_MAX_IN_FLIGHT);
  const release = options.release ?? bridgeRelease;

  // A Map keeps insertion order: the first entry is the least recently used.
  const kept = new Map<string, Kept>();
  const jobs = new Map<string, Job>();
  const waiting: Job[] = [];
  let inFlight = 0;
  // Bumped by clear(), so an answer for a request made before it is released, not kept.
  let generation = 0;

  function evict(): void {
    if (kept.size <= maxEntries) return;
    for (const [key, entry] of kept) {
      if (kept.size <= maxEntries) break;
      if (entry.holds > 0) continue;
      kept.delete(key);
      if (entry.url) release(entry.url);
    }
  }

  function keep(key: string, url: string | null): void {
    const before = kept.get(key);
    if (before) {
      // Not expected (requests are shared per key), but never leak the second URL.
      if (url && url !== before.url) release(url);
      return;
    }
    kept.set(key, { url, holds: 0 });
  }

  function finish(job: Job): void {
    jobs.delete(job.key);
    inFlight -= 1;
    // The covers waiting hold the answer first, so it is not evicted before it is drawn.
    for (const done of job.waiters) done();
    job.waiters.clear();
    evict();
    pump();
  }

  function pump(): void {
    while (inFlight < maxInFlight && waiting.length > 0) {
      const job = waiting.shift()!;
      job.sent = true;
      inFlight += 1;
      const asked = generation;
      let answer: Promise<string | null>;
      try {
        answer = job.fetch();
      } catch (cause) {
        answer = Promise.reject(cause);
      }
      answer.then(
        (url) => {
          if (asked !== generation) {
            if (url) release(url);
            return;
          }
          keep(job.key, url);
          finish(job);
        },
        () => {
          if (asked !== generation) return;
          finish(job);
        },
      );
    }
  }

  return {
    hold(key) {
      const entry = kept.get(key);
      if (!entry) return undefined;
      // Touched: now the most recently used.
      kept.delete(key);
      kept.set(key, entry);
      entry.holds += 1;
      return entry.url;
    },

    letGo(key) {
      const entry = kept.get(key);
      if (!entry || entry.holds === 0) return;
      entry.holds -= 1;
      if (entry.holds === 0) evict();
    },

    request(key, fetch, done) {
      if (kept.has(key)) {
        done();
        return () => {};
      }
      let job = jobs.get(key);
      if (!job) {
        job = { key, fetch, waiters: new Set(), sent: false };
        jobs.set(key, job);
        waiting.push(job);
      }
      const mine = job;
      // Each call is its own waiter, even with the same callback.
      const waiter = () => done();
      mine.waiters.add(waiter);
      pump();
      return () => {
        mine.waiters.delete(waiter);
        if (mine.sent || mine.waiters.size > 0) return;
        const at = waiting.indexOf(mine);
        if (at >= 0) waiting.splice(at, 1);
        if (jobs.get(key) === mine) jobs.delete(key);
      };
    },

    stats() {
      return { kept: kept.size, inFlight, waiting: waiting.length };
    },

    clear() {
      generation += 1;
      for (const entry of kept.values()) if (entry.url) release(entry.url);
      kept.clear();
      jobs.clear();
      waiting.length = 0;
      inFlight = 0;
    },
  };
}

/** The renderer's one cover loader: Discover's cards and Clean's candidates share its cap. */
export const covers: CoverLoader = createCoverLoader();

/** Test isolation: one test's kept covers must not serve the next. */
export function resetCoversForTests(): void {
  covers.clear();
}
