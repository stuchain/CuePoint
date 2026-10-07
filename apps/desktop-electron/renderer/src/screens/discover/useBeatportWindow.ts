/**
 * Rows for a Beatport table, a window at a time (DISCOVER-10, DEC-040).
 *
 * The Library's `useTrackWindow` for Discover's tables: a run's tracks, the
 * wantlist, and (DISCOVER-11) an Artist or Label page's Beatport half. The
 * same rules, for the same reasons — a page is asked for once, memory is
 * bounded, and an answer is kept only if it answers the current question —
 * over Discover's answers, which are `{ value, refusal }` and echo their
 * window rather than their query.
 *
 * **A refusal is a state.** A run deleted under the table answers
 * `DISCOVERY_RUN_NOT_FOUND`; the status says so and the refusal is kept, so
 * the page can say what happened rather than show placeholders forever.
 *
 * **Reloading keeps the rows on screen.** Adding a track to the wantlist
 * changes one cell of one row; a reload that emptied the table to placeholders
 * first would flash every row for a one-word change. So `reload` asks again
 * for every page held, under a new identity, and each answer replaces its page
 * when it lands. A change of question — a sort, a filter, another run — is
 * different: the old rows answer nothing now, and are dropped at once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DiscoverAnswer, DiscoverRefusal } from "../../api/cuepointBridge.types";
import type { TrackTableSource, TrackTableStatus } from "../../components/table";
import { PAGE_SIZE, pagesForRange, pagesToEvict } from "../library/useTrackWindow";

/** What every Beatport window answers: rows, how many in all, and itself. */
interface BeatportPageShape<Row> {
  rows: Row[];
  total: number;
}

interface BeatportWindowOptions<Row, Page extends BeatportPageShape<Row>> {
  /**
   * The question, as text. A change of key is a new question: the rows held
   * are dropped and the first page is asked for again.
   */
  key: string;
  /** False while the question cannot be asked yet: no run chosen. */
  enabled?: boolean;
  /** Ask the engine for one window. */
  fetch: (offset: number, limit: number) => Promise<DiscoverAnswer<Page>>;
  /**
   * Whether an answer is to the question asked: the window it echoes matches
   * the current one. An answer that is not is dropped.
   */
  answers: (page: Page) => boolean;
}

interface BeatportWindow<Row, Page> {
  source: TrackTableSource<Row>;
  total: number;
  /** The latest answer, for the counts it carries beside its rows. */
  page: Page | null;
  status: TrackTableStatus;
  error: string | null;
  /** The refusal the last request met, when it was one. */
  refusal: DiscoverRefusal | null;
  /** True until the first answer to this question has landed. */
  loading: boolean;
  /** Ask for every page held again, keeping them on screen meanwhile. */
  reload: () => void;
  /** Every row held, in index order, for finding a row by its id. */
  loadedRows: () => Array<{ row: Row; index: number }>;
}

function pageOf(index: number): number {
  return Math.floor(index / PAGE_SIZE);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useBeatportWindow<Row, Page extends BeatportPageShape<Row>>({
  key,
  enabled = true,
  fetch,
  answers,
}: BeatportWindowOptions<Row, Page>): BeatportWindow<Row, Page> {
  const [generation, setGeneration] = useState(0);
  const identity = `${generation}\u0000${key}`;

  const [pages, setPages] = useState<Map<number, Row[]>>(new Map());
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [status, setStatus] = useState<TrackTableStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<DiscoverRefusal | null>(null);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);

  const identityRef = useRef(identity);
  const inFlight = useRef<Set<number>>(new Set());
  const failedPages = useRef<Set<number>>(new Set());
  // Pages answered under the current identity. After a reload the pages on
  // screen are the old identity's until their new answers land, so "held" and
  // "answered now" are two different sets.
  const freshPages = useRef<Set<number>>(new Set());
  const heldPages = useRef<Set<number>>(new Set());
  const centre = useRef(0);
  const lastKey = useRef<string | null>(null);
  // The latest fetch and check, so a request started for one identity never
  // uses the callbacks of another.
  const fetchRef = useRef(fetch);
  const answersRef = useRef(answers);
  fetchRef.current = fetch;
  answersRef.current = answers;

  const fetchPages = useCallback(
    (wanted: number[], askedFor: string): boolean => {
      const missing = wanted.filter(
        (number) =>
          !inFlight.current.has(number) &&
          !failedPages.current.has(number) &&
          !freshPages.current.has(number),
      );
      if (missing.length === 0) return false;

      // Contiguous runs of pages become one request each.
      const runs: Array<[number, number]> = [];
      for (const number of missing.sort((a, b) => a - b)) {
        const last = runs[runs.length - 1];
        if (last && number === last[1] + 1) last[1] = number;
        else runs.push([number, number]);
      }

      for (const [first, lastPage] of runs) {
        for (let number = first; number <= lastPage; number += 1) inFlight.current.add(number);
        const offset = first * PAGE_SIZE;
        const limit = (lastPage - first + 1) * PAGE_SIZE;
        const settle = () => {
          for (let number = first; number <= lastPage; number += 1) {
            inFlight.current.delete(number);
          }
        };
        const fail = (message: string, why: DiscoverRefusal | null) => {
          settle();
          for (let number = first; number <= lastPage; number += 1) {
            failedPages.current.add(number);
          }
          if (askedFor !== identityRef.current) return;
          setStatus("error");
          setError(message);
          setRefusal(why);
        };

        void fetchRef
          .current(offset, limit)
          .then((answer) => {
            if (answer.refusal) {
              fail(answer.refusal.message, answer.refusal);
              return;
            }
            settle();
            const value = answer.value;
            if (askedFor !== identityRef.current) return;
            if (!answersRef.current(value)) return;

            for (let number = first; number <= lastPage; number += 1) {
              freshPages.current.add(number);
            }
            setTotal(value.total);
            setPage(value);
            setAnsweredKey(askedFor);
            setError(null);
            setRefusal(null);
            setStatus("ready");
            setPages((previous) => {
              const next = new Map(previous);
              for (let number = first; number <= lastPage; number += 1) {
                const slice = value.rows.slice(
                  (number - first) * PAGE_SIZE,
                  (number - first + 1) * PAGE_SIZE,
                );
                if (slice.length > 0) next.set(number, slice);
                else next.delete(number);
              }
              // A reload can shrink the list: pages held past its new end
              // answer nothing now.
              const lastIndex = value.total - 1;
              for (const number of [...next.keys()]) {
                if (number * PAGE_SIZE > lastIndex) next.delete(number);
              }
              for (const number of pagesToEvict([...next.keys()], centre.current)) {
                next.delete(number);
                freshPages.current.delete(number);
              }
              heldPages.current = new Set(next.keys());
              return next;
            });
          })
          .catch((cause: unknown) => fail(messageOf(cause), null));
      }
      return true;
    },
    [],
  );

  // A new question drops everything; a reload of the same one keeps what is
  // on screen and asks for it again.
  useEffect(() => {
    identityRef.current = identity;
    inFlight.current = new Set();
    failedPages.current = new Set();
    freshPages.current = new Set();
    const sameQuestion = lastKey.current === key;
    lastKey.current = key;
    if (!sameQuestion) {
      heldPages.current = new Set();
      centre.current = 0;
      setPages(new Map());
      setTotal(0);
      setPage(null);
      setAnsweredKey(null);
    }
    setError(null);
    setRefusal(null);
    if (!enabled) {
      setStatus("idle");
      return;
    }
    const held = [...heldPages.current];
    if (held.length === 0) setStatus("loading");
    fetchPages(held.length > 0 ? held : [0], identity);
    // Keyed on the identity alone: this runs once per question or reload.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, enabled]);

  const requestWindow = useCallback(
    (startIndex: number, endIndex: number) => {
      if (!enabled) return;
      centre.current = pageOf(Math.floor((startIndex + endIndex) / 2));
      fetchPages(pagesForRange(startIndex, endIndex, total), identityRef.current);
    },
    [enabled, fetchPages, total],
  );

  const reload = useCallback(() => setGeneration((value) => value + 1), []);

  const getRow = useCallback(
    (index: number) => pages.get(pageOf(index))?.[index % PAGE_SIZE],
    [pages],
  );

  const loadedRows = useCallback(() => {
    const rows: Array<{ row: Row; index: number }> = [];
    for (const number of [...pages.keys()].sort((a, b) => a - b)) {
      (pages.get(number) ?? []).forEach((row, offset) => {
        rows.push({ row, index: number * PAGE_SIZE + offset });
      });
    }
    return rows;
  }, [pages]);

  const source = useMemo<TrackTableSource<Row>>(
    () => ({ total, getRow, requestWindow, status, error }),
    [total, getRow, requestWindow, status, error],
  );

  return {
    source,
    total,
    page,
    status,
    error,
    refusal,
    loading: enabled && answeredKey === null && status !== "error",
    reload,
    loadedRows,
  };
}
