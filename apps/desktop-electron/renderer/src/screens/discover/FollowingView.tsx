/**
 * The Following tab: artists and labels you follow, and what is new from them (DEC-317).
 *
 * Two states. With nobody followed it offers the names the library owns the most tracks by, each
 * with its own Follow button, and one main button to see what is new. With follows it is a list of
 * them at the left and the new tracks at the right, newest release first, in the same table every
 * Discover page has (preview, wantlist, push to a playlist, open on Beatport).
 *
 * **Opening the tab reads the cache at once and asks Beatport after.** The follows and the feed come
 * from what the engine already holds; a check then reads each follow's releases, and when it ends
 * both are read again. **Leaving the tab marks what was shown as seen**, once, and only what was
 * shown: the follow that was picked (all of them under All), and nothing when the feed never loaded
 * or showed an error. Not while a check is running or starting (the mark would bury tracks the
 * check is still storing; they stay new until a later visit). When the mark has been answered the
 * page is told (`onLeft`) to read the tab's count again from the engine; the view never sets it to
 * 0 itself. Pages stay alive when hidden, so "leaving" is the tab not being the one on screen
 * (`active`), not the view unmounting.
 *
 * Beatport's state is the page's (no token: the sign-in notice above the tabs), so a check is not
 * started without a token, and a follow Beatport refused says so as a muted line in the list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DiscoverAnswer,
  EntityKind,
  FollowCheckResult,
  FollowFeed,
  FollowFeedRow,
  FollowRow,
  FollowSuggestion,
  FollowsList,
} from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Hint } from "../../components/Hint";
import { Loading } from "../../components/Loading";
import { countNoun, formatCount } from "../../format/counts";
import { quoted, RETRY } from "../../format/words";
import { userMessage } from "../../api/userMessage";
import { reportUnexpected } from "../../reporting/reporting";
import { BeatportTable } from "./BeatportTable";
import { HideOwnedSwitch } from "./HideOwnedSwitch";
import { PushDialog } from "./PushDialog";
import { runActions, type BeatportActionId } from "./beatportActions";
import { FOLLOW_COLUMNS, FOLLOW_TABLE_LAYOUT_KEY } from "./beatportColumns";
import { beatportUsable, refusalState, unusableReason } from "./beatportState";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { followKey, followStatusParts, newCountWords, oldestSeenThrough } from "./followFormat";
import { openOnBeatport } from "./openOnBeatport";
import { useBeatportSelection } from "./useBeatportSelection";
import { useBeatportWindow } from "./useBeatportWindow";
import { useDiscoverJob } from "./useDiscoverJob";
import { useHideOwned } from "./useHideOwned";
import { useOpenPage } from "./useOpenPage";
import "./FollowingView.css";

interface FollowingViewProps {
  tools: DiscoverTools;
  /** True while this tab is the one on screen, on the page that is on screen. */
  active: boolean;
  /** Told how many new tracks the follows have, for the tab's count. */
  onNewCount: (count: number) => void;
  /** Told when the tab was left and its mark (if any) has been answered: read the count again. */
  onLeft: () => void;
}

/** How many suggestions are asked for, and how many more "Show 10 more" adds. */
const SUGGESTION_STEP = 10;
/** The most the engine answers (`follows/suggestions` refuses more): "Show 10 more" stops here. */
const SUGGESTION_MAX = 100;

const idOf = (row: FollowFeedRow) => row.beatport_track_id;

type Mode = "loading" | "suggest" | "feed";
type Picked = { kind: EntityKind; beatport_id: number } | null;

/** How many names a group shows before "+ N more". */
const GROUP_LIMIT = 8;

const KIND_WORD: Record<EntityKind, string> = { artist: "Artist", label: "Label" };

/**
 * The small picture beside a name: round for an artist, square for a label. Beatport's artist and
 * label pictures are not kept for a follow (reading one is a request per name), so this is the
 * neutral placeholder the mockups show for a name with no picture.
 */
function Avatar({ kind }: { kind: EntityKind }) {
  return <span className={`discover-following__avatar discover-following__avatar--${kind}`} aria-hidden="true" />;
}

export function FollowingView({ tools, active, onNewCount, onLeft }: FollowingViewProps) {
  const { notify } = tools;
  const openPage = useOpenPage();
  const [owned, setHiding] = useHideOwned();
  const [mode, setMode] = useState<Mode>("loading");
  const [follows, setFollows] = useState<FollowsList | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [unfollowing, setUnfollowing] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<EntityKind>>(new Set());
  const allButton = useRef<HTMLButtonElement>(null);

  // What the feed shows as new, for the one mark when the tab is left: the follow picked (or all),
  // and how many new tracks it has; null while the feed has not loaded, or showed an error.
  const shown = useRef<{ picked: Picked; count: number } | null>(null);
  const modeRef = useRef<Mode>("loading");
  modeRef.current = mode;
  // Whether the check running was asked for with "Check again", which says how it went.
  const manual = useRef(false);
  // Whether a check is in flight or being started (the start's answer has not named a job yet), and
  // whether the tab is on screen, for the callbacks below.
  const checkingRef = useRef(false);
  const startingRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Whether the automatic check was started for this visit.
  const autoChecked = useRef(false);
  const usable = beatportUsable(tools.beatportState);

  // --- the follows: from the cache only

  const readFollows = useCallback(async (): Promise<FollowsList | null> => {
    const bridge = window.cuepoint?.getFollows;
    if (!bridge) {
      setProblem(NO_ENGINE);
      return null;
    }
    try {
      const answer = await bridge();
      if (answer.refusal) {
        setProblem(refusalText(answer.refusal));
        return null;
      }
      setProblem(null);
      setFollows(answer.value);
      onNewCount(answer.value.new_count);
      return answer.value;
    } catch (cause) {
      reportUnexpected(cause);
      setProblem(userMessage(cause));
      return null;
    }
  }, [onNewCount]);

  // --- the feed: the shared Beatport window over the follows' new tracks

  const picks = picked ? `${picked.kind}|${picked.beatport_id}` : "all";
  const windowKey = `${picks}|${owned}`;
  const fetchFeed = useCallback(
    (offset: number, limit: number) => {
      const bridge = window.cuepoint?.getFollowFeed;
      if (!bridge) return Promise.reject(new Error(NO_ENGINE));
      return bridge({
        ...(picked ? { kind: picked.kind, beatport_id: picked.beatport_id } : {}),
        owned,
        offset,
        limit,
      });
    },
    [owned, picked],
  );
  const answersWindow = useCallback(
    (page: FollowFeed) =>
      page.window.owned === owned &&
      (page.window.kind ?? null) === (picked?.kind ?? null) &&
      (page.window.beatport_id ?? null) === (picked?.beatport_id ?? null),
    [owned, picked],
  );
  const feed = useBeatportWindow<FollowFeedRow, FollowFeed>({
    key: windowKey,
    enabled: mode === "feed",
    fetch: fetchFeed,
    answers: answersWindow,
  });
  const { reload: reloadFeed } = feed;

  const selection = useBeatportSelection<FollowFeedRow>({
    key: windowKey,
    idOf,
    getRow: feed.source.getRow,
    loadedRows: feed.loadedRows,
  });

  // --- the check: Beatport asked for each follow, as a job the status strip reports

  const check = useDiscoverJob<FollowCheckResult>((result, finished) => {
    const asked = manual.current;
    manual.current = false;
    startingRef.current = false;
    checkingRef.current = false;
    // A check that failed (an engine restart ends its job as failed) lets the next activation, or
    // Beatport becoming usable again, start the automatic check once more.
    if (!result && finished.state !== "succeeded") autoChecked.current = false;
    // A tab that is not on screen reads nothing: it reads again when it is shown.
    if (activeRef.current) {
      void readFollows();
      reloadFeed();
    }
    if (result?.outcome === "no_token" || result?.outcome === "cancelled") return;
    if (!result && finished.state !== "succeeded") {
      if (asked) notify(finished.error?.message ?? "The check did not finish", "warning");
      return;
    }
    if (asked) {
      const failed = result?.failed.length ?? 0;
      notify(
        failed > 0 ? `${countNoun(failed, "name")} could not be checked.` : "Checked for new releases.",
        failed > 0 ? "warning" : "success",
      );
    }
  });
  checkingRef.current = check.jobId !== null || startingRef.current;
  const startCheckJob = check.start;
  const followCheck = check.follow;

  const startCheck = useCallback(
    async (refresh: boolean) => {
      const bridge = window.cuepoint?.startFollowsCheck;
      if (!bridge) return;
      // Only a check asked for sets the flag; an automatic start must not clear it.
      if (refresh) manual.current = true;
      // Starting counts as checking until the job ends: leaving in the gap before its id arrives
      // must not mark (the check will store tracks).
      startingRef.current = true;
      checkingRef.current = true;
      try {
        const refusal = await startCheckJob(() => bridge({ refresh }));
        if (!refusal) return;
        if (refusal.code === "DISCOVER_BUSY" && refusal.job_type === "follows_check" && refusal.job_id) {
          followCheck(refusal.job_id);
          return;
        }
        startingRef.current = false;
        if (refresh) manual.current = false;
        // No token and the like are the page's notice; only a check asked for says more.
        if (refresh && !refusalState(refusal)) notify(refusalText(refusal), "warning");
      } catch (cause) {
        startingRef.current = false;
        if (refresh) manual.current = false;
        reportUnexpected(cause);
        if (refresh) notify(userMessage(cause), "warning");
      }
    },
    [followCheck, notify, startCheckJob],
  );

  // --- opening and leaving the tab

  const latest = useRef({ readFollows, startCheck, reloadFeed, usable, onLeft });
  latest.current = { readFollows, startCheck, reloadFeed, usable, onLeft };
  useEffect(() => {
    if (!active) return;
    let live = true;
    void (async () => {
      const list = await latest.current.readFollows();
      if (!live || !list) return;
      if (list.follows.length === 0) {
        setMode("suggest");
        return;
      }
      if (modeRef.current === "feed") latest.current.reloadFeed();
      setMode("feed");
    })();
    return () => {
      live = false;
      autoChecked.current = false;
      // Left: what the feed showed as new is seen now, once, and only that. Not while a check is
      // running or starting: the mark is by date and would bury tracks it is still storing; they
      // stay new until a later visit. Nothing shown (never loaded, an error) marks nothing.
      const was = shown.current;
      shown.current = null;
      const mark = window.cuepoint?.markFollowsSeen;
      if (checkingRef.current || !was || was.count <= 0 || !mark) {
        latest.current.onLeft();
        return;
      }
      // The count is read again from the engine once the mark has been answered, never set here.
      void mark(was.picked ? { kind: was.picked.kind, beatport_id: was.picked.beatport_id } : {})
        .catch(reportUnexpected)
        .finally(() => latest.current.onLeft());
    };
  }, [active]);

  // The automatic check: once per visit, as soon as there are follows and Beatport is usable (also
  // when the sign-in becomes usable while the tab is open).
  useEffect(() => {
    if (!active || mode !== "feed") {
      if (mode !== "feed") autoChecked.current = false;
      return;
    }
    if (!usable || autoChecked.current) return;
    autoChecked.current = true;
    void latest.current.startCheck(false);
  }, [active, mode, usable]);

  // A selected follow that is gone (unfollowed, or the list read again without it) is All again.
  useEffect(() => {
    if (!picked || !follows) return;
    if (!follows.follows.some((row) => row.kind === picked.kind && row.beatport_id === picked.beatport_id)) {
      setPicked(null);
    }
  }, [follows, picked]);

  // Everyone unfollowed: back to the suggestions.
  useEffect(() => {
    if (mode === "feed" && follows && follows.follows.length === 0) setMode("suggest");
  }, [follows, mode]);

  // --- suggestions

  const [limit, setLimit] = useState(SUGGESTION_STEP);
  const [suggestions, setSuggestions] = useState<FollowSuggestion[] | null>(null);
  const [suggestProblem, setSuggestProblem] = useState<string | null>(null);
  const [suggestTry, setSuggestTry] = useState(0);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (mode !== "suggest" || !active) return;
    const bridge = window.cuepoint?.getFollowSuggestions;
    if (!bridge) {
      setSuggestProblem(NO_ENGINE);
      return;
    }
    let live = true;
    void bridge({ limit })
      .then((answer) => {
        if (!live) return;
        if (answer.refusal) setSuggestProblem(refusalText(answer.refusal));
        else {
          setSuggestProblem(null);
          setSuggestions(answer.value.suggestions);
        }
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (live) setSuggestProblem(userMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [active, limit, mode, suggestTry]);

  const toggleSuggestion = async (row: FollowSuggestion) => {
    const key = followKey(row);
    const add = window.cuepoint?.addFollow;
    const remove = window.cuepoint?.removeFollow;
    if (!add || !remove) return void notify(NO_ENGINE, "warning");
    setPending((was) => new Set(was).add(key));
    try {
      const answer: DiscoverAnswer<{ followed: boolean }> = row.followed
        ? await remove({ kind: row.kind, beatport_id: row.beatport_id })
        : await add({ kind: row.kind, beatport_id: row.beatport_id, name: row.name });
      if (answer.refusal) return void notify(refusalText(answer.refusal), "warning");
      const followed = answer.value.followed;
      setSuggestions((was) =>
        was
          ? was.map((entry) => (followKey(entry) === key ? { ...entry, followed } : entry))
          : was,
      );
    } catch (cause) {
      reportUnexpected(cause);
      notify(userMessage(cause), "warning");
    } finally {
      setPending((was) => {
        const next = new Set(was);
        next.delete(key);
        return next;
      });
    }
  };

  const followedCount = suggestions?.filter((row) => row.followed).length ?? 0;
  const showWhatsNew = async () => {
    const list = await readFollows();
    if (!list) return;
    setMode("feed");
  };

  // --- unfollowing the follow picked in the list

  const unfollow = async (row: FollowRow) => {
    const bridge = window.cuepoint?.removeFollow;
    if (!bridge) return void notify(NO_ENGINE, "warning");
    setUnfollowing(true);
    try {
      const answer = await bridge({ kind: row.kind, beatport_id: row.beatport_id });
      if (answer.refusal) return void notify(refusalText(answer.refusal), "warning");
      notify(`Unfollowed ${quoted(row.name)}.`, "success");
      setPicked(null);
      await readFollows();
      reloadFeed();
      allButton.current?.focus();
    } catch (cause) {
      reportUnexpected(cause);
      notify(userMessage(cause), "warning");
    } finally {
      setUnfollowing(false);
    }
  };

  // --- feed actions

  const actions = useMemo(
    () =>
      runActions(selection.count, {
        pushable: usable,
        pushReason: unusableReason(tools.beatportState),
        total: feed.total,
        needsRows: true,
      }),
    [feed.total, selection.count, tools.beatportState, usable],
  );
  const [working, setWorking] = useState(false);

  const addToWantlist = async () => {
    const bridge = window.cuepoint?.addToWantlist;
    if (!bridge) return void notify(NO_ENGINE, "warning");
    setWorking(true);
    try {
      const answer = await bridge({ track_ids: selection.rows.map(idOf) });
      if (answer.refusal) notify(refusalText(answer.refusal), "warning");
      else notify(answer.value.message, "success");
      reloadFeed();
    } catch (cause) {
      reportUnexpected(cause);
      notify(userMessage(cause), "warning");
    } finally {
      setWorking(false);
    }
  };

  const onAction = (id: BeatportActionId) => {
    if (id === "add_to_wantlist") void addToWantlist();
    if (id === "push") setPushOpen(true);
    if (id === "open") {
      void openOnBeatport(selection.rows.map((row) => row.url)).then((problem) => {
        if (problem) notify(problem, "warning");
      });
    }
  };

  const push = async (name: string, includeOwned: boolean) => {
    const refused = await tools.push({
      name,
      include_owned: includeOwned,
      track_ids: selection.rows.map(idOf),
    });
    if (!refused) setPushOpen(false);
    return refused;
  };

  // --- what the feed shows, for the mark when the tab is left

  const feedPage = feed.page;
  const feedShown =
    mode === "feed" &&
    feed.status === "ready" &&
    !feed.loading &&
    feedPage !== null &&
    answersWindow(feedPage);
  const pickedFollow = picked
    ? (follows?.follows.find((row) => row.kind === picked.kind && row.beatport_id === picked.beatport_id) ?? null)
    : null;
  shown.current = feedShown
    ? { picked, count: picked ? (pickedFollow?.new_count ?? 0) : (follows?.new_count ?? 0) }
    : null;

  // --- drawing

  if (problem && !follows) {
    return (
      <section className="discover-following" aria-label="Following">
        <EmptyState
          icon="discover"
          headline="Following could not be read"
          description={problem}
          action={
            problem !== NO_ENGINE
              ? { label: RETRY, onClick: () =>
                  void readFollows().then((list) => {
                    if (list) setMode(list.follows.length === 0 ? "suggest" : "feed");
                  }),
              }
              : undefined
          }
        />
      </section>
    );
  }

  if (mode === "loading") {
    return (
      <section className="discover-following" aria-label="Following">
        <Loading what="who you follow" centered />
      </section>
    );
  }

  if (mode === "suggest") {
    const more = suggestions !== null && suggestions.length >= limit && limit < SUGGESTION_MAX;
    return (
      <section className="discover-following discover-following--first" aria-label="Following">
        <h2 className="discover-section__title">Follow artists and labels</h2>
        <p className="discover-note">
          See their new Beatport releases here each time you open this tab. These are the ones you own
          the most tracks by.
        </p>
        {suggestProblem ? (
          <EmptyState
            icon="discover"
            headline="Suggestions could not be read"
            description={suggestProblem}
            action={
              suggestProblem !== NO_ENGINE
                ? {
                    label: RETRY,
                    onClick: () => {
                      setSuggestProblem(null);
                      setSuggestTry((was) => was + 1);
                    },
                  }
                : undefined
            }
          />
        ) : suggestions === null ? (
          <Loading what="the names you own the most tracks by" />
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon="discover"
            headline="No one to suggest yet"
            description="Names appear once your tracks are matched on Beatport. You can also follow from any artist or label page."
          />
        ) : (
          <div className="discover-following__suggest">
            <ul className="discover-following__suggestions" aria-label="Suggested artists and labels">
              {suggestions.map((row) => {
                const key = followKey(row);
                return (
                  <li key={key} className="discover-following__suggestion">
                    <span className="discover-following__who">
                      <Avatar kind={row.kind} />
                      <span className="discover-following__name" data-cut-hint="">
                        {row.name}
                      </span>
                    </span>
                    <span className="discover-following__kind">{KIND_WORD[row.kind]}</span>
                    <span className="discover-following__tracks">
                      {formatCount(row.track_count)} of your tracks
                    </span>
                    <Button
                      variant="secondary"
                      icon={row.followed ? "check" : "plus"}
                      disabled={pending.has(key)}
                      aria-label={`${row.followed ? "Following" : "Follow"} ${row.name}`}
                      onClick={() => void toggleSuggestion(row)}
                    >
                      {row.followed ? "Following" : "Follow"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {more && (
              <div className="discover-following__more">
                <Button variant="quiet" onClick={() => setLimit((was) => Math.min(SUGGESTION_MAX, was + SUGGESTION_STEP))}>
                  Show {SUGGESTION_STEP} more
                </Button>
              </div>
            )}
            <div className="discover-following__go">
              <Button
                variant="primary"
                disabled={followedCount === 0}
                onClick={() => void showWhatsNew()}
              >
                {`Show what's new (${formatCount(followedCount)} followed)`}
              </Button>
            </div>
          </div>
        )}
      </section>
    );
  }

  // The feed.
  const rows = follows?.follows ?? [];
  const artists = rows.filter((row) => row.kind === "artist");
  const labels = rows.filter((row) => row.kind === "label");
  const page = feed.page;
  const checking = check.jobId !== null;
  const selectedFollow = picked
    ? rows.find((row) => row.kind === picked.kind && row.beatport_id === picked.beatport_id) ?? null
    : null;
  const status = page
    ? followStatusParts(
        page,
        {
          newCount: selectedFollow ? selectedFollow.new_count : (follows?.new_count ?? 0),
          seenThrough: selectedFollow ? selectedFollow.seen_through : oldestSeenThrough(rows),
          hiding: owned === "hide",
        },
      )
    : null;

  const item = (row: FollowRow) => {
    const here = selectedFollow === row;
    const refused = row.state && row.state.state !== "no_token" ? row.state : null;
    return (
      <li key={followKey(row)}>
        <button
          type="button"
          className={`discover-following__item${here ? " discover-following__item--selected" : ""}`}
          aria-current={here ? "true" : undefined}
          onClick={() => setPicked({ kind: row.kind, beatport_id: row.beatport_id })}
        >
          <span className="discover-following__who">
            <Avatar kind={row.kind} />
            <span className="discover-following__name" data-cut-hint="">
              {row.name}
            </span>
          </span>
          {row.new_count > 0 ? (
            <Badge variant="accent">
              {formatCount(row.new_count)}
              <span className="cp-visually-hidden"> new</span>
            </Badge>
          ) : (
            <span className="discover-following__quiet">{refused ? "not checked" : "nothing new"}</span>
          )}
          {refused && <span className="discover-following__problem">{refused.message}</span>}
        </button>
      </li>
    );
  };

  const group = (kind: EntityKind, title: string, list: FollowRow[]) => {
    if (list.length === 0) return false;
    const pickedHere = selectedFollow !== null && selectedFollow.kind === kind;
    const open = expanded.has(kind) || list.length <= GROUP_LIMIT || pickedHere;
    const shown = open ? list : list.slice(0, GROUP_LIMIT);
    return (
      <li className="discover-following__group">
        <h3 className="discover-following__heading">
          {title} <span className="discover-following__quiet">{formatCount(list.length)}</span>
        </h3>
        <ul className="discover-following__rows">{shown.map(item)}</ul>
        {!open && (
          <button
            type="button"
            className="discover-following__more-names"
            onClick={() => setExpanded((was) => new Set(was).add(kind))}
          >
            {`+ ${formatCount(list.length - GROUP_LIMIT)} more`}
          </button>
        )}
      </li>
    );
  };

  const emptyState =
    feed.status === "error" ? (
      <EmptyState
        icon="discover"
        headline="What is new could not be read"
        description={feed.error}
        action={{ label: RETRY, onClick: reloadFeed }}
      />
    ) : feed.loading ? (
      <Loading what="what is new" />
    ) : checking && (page?.unchecked ?? 0) > 0 ? (
      <Loading what="new releases from Beatport" />
    ) : (
      <EmptyState
        icon="discover"
        headline={picked ? "Nothing new from this name" : "Nothing new from the names you follow"}
        description={
          owned === "hide"
            ? "Tracks you already own are hidden. New releases appear here when Beatport lists them."
            : "New releases appear here when Beatport lists them."
        }
      />
    );

  return (
    <section className="discover-following discover-following--feed" aria-label="Following">
      <nav className="discover-following__list" aria-label="Followed artists and labels">
        <button
          type="button"
          ref={allButton}
          className={`discover-following__item${picked === null ? " discover-following__item--selected" : ""}`}
          aria-current={picked === null ? "true" : undefined}
          onClick={() => setPicked(null)}
        >
          <span className="discover-following__name">All</span>
          {(follows?.new_count ?? 0) > 0 ? (
            <Badge variant="accent">{newCountWords(follows?.new_count ?? 0)}</Badge>
          ) : (
            <span className="discover-following__quiet">nothing new</span>
          )}
        </button>
        <ul className="discover-following__groups">
          {group("artist", "Artists", artists)}
          {group("label", "Labels", labels)}
        </ul>
        {selectedFollow && (
          <Button
            variant="secondary"
            className="discover-following__unfollow"
            loading={unfollowing}
            onClick={() => void unfollow(selectedFollow)}
          >
            {`Unfollow ${selectedFollow.name}`}
          </Button>
        )}
      </nav>

      <div className="discover-following__feed">
        {problem && (
          <p className="discover-following__error" role="alert">
            {`The list of who you follow could not be read: ${problem}`}
          </p>
        )}
        <div className="discover-following__bar">
          <p className="discover-following__status" role="status">
            {status ? (
              <>
                <strong className="discover-following__count">{status.count}</strong>
                {status.rest}
              </>
            ) : (
              "Reading what is new…"
            )}
          </p>
          <HideOwnedSwitch hiding={owned === "hide"} onChange={setHiding} />
          <Hint text={unusableReason(tools.beatportState) ?? undefined}>
            <Button
              variant="secondary"
              loading={checking}
              disabled={!usable}
              onClick={() => void startCheck(true)}
            >
              Check again
            </Button>
          </Hint>
        </div>
        <BeatportTable<FollowFeedRow>
          columns={FOLLOW_COLUMNS}
          onOpenPage={openPage}
          layoutKey={FOLLOW_TABLE_LAYOUT_KEY}
          source={feed.source}
          selection={selection}
          idOf={idOf}
          actions={actions}
          onAction={onAction}
          label="New tracks from who you follow"
          summary={countNoun(feed.total, "track")}
          emptyState={emptyState}
          resetKey={windowKey}
          busy={working}
        />
      </div>

      <PushDialog
        open={pushOpen}
        allowExisting
        what={() => `the ${countNoun(selection.count, "selected track")}`}
        defaultName={tools.options.defaults.playlist_name}
        maxNameLength={tools.options.limits.max_playlist_name_length}
        onPush={(target, includeOwned) => push(target.name, includeOwned)}
        onClose={() => setPushOpen(false)}
      />
    </section>
  );
}
