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
 * both are read again. **Leaving the tab marks what was shown as seen**, once, so "new" means
 * "since you last looked". Pages stay alive when hidden, so "leaving" is the tab not being the one
 * on screen (`active`), not the view unmounting.
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
import { followKey, followStatusLine, newCountWords, oldestSeenThrough } from "./followFormat";
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
}

/** How many suggestions are asked for, and how many more "Show 10 more" adds. */
const SUGGESTION_STEP = 10;

const idOf = (row: FollowFeedRow) => row.beatport_track_id;

type Mode = "loading" | "suggest" | "feed";
type Picked = { kind: EntityKind; beatport_id: number } | null;

const KIND_WORD: Record<EntityKind, string> = { artist: "Artist", label: "Label" };

export function FollowingView({ tools, active, onNewCount }: FollowingViewProps) {
  const { notify } = tools;
  const openPage = useOpenPage();
  const [owned, setHiding] = useHideOwned();
  const [mode, setMode] = useState<Mode>("loading");
  const [follows, setFollows] = useState<FollowsList | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [unfollowing, setUnfollowing] = useState(false);

  // What was shown as new, for the one mark when the tab is left.
  const shownNew = useRef(0);
  const modeRef = useRef<Mode>("loading");
  modeRef.current = mode;
  // Whether the check running was asked for with "Check again", which says how it went.
  const manual = useRef(false);
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
      shownNew.current = answer.value.new_count;
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
    void readFollows();
    reloadFeed();
    if (result?.outcome === "no_token") return;
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
  const startCheckJob = check.start;
  const followCheck = check.follow;

  const startCheck = useCallback(
    async (refresh: boolean) => {
      const bridge = window.cuepoint?.startFollowsCheck;
      if (!bridge) return;
      manual.current = refresh;
      try {
        const refusal = await startCheckJob(() => bridge({ refresh }));
        if (!refusal) return;
        manual.current = false;
        if (refusal.code === "DISCOVER_BUSY" && refusal.job_type === "follows_check" && refusal.job_id) {
          followCheck(refusal.job_id);
          return;
        }
        // No token and the like are the page's notice; only a check asked for says more.
        if (refresh && !refusalState(refusal)) notify(refusalText(refusal), "warning");
      } catch (cause) {
        manual.current = false;
        reportUnexpected(cause);
        if (refresh) notify(userMessage(cause), "warning");
      }
    },
    [followCheck, notify, startCheckJob],
  );

  // --- opening and leaving the tab

  const latest = useRef({ readFollows, startCheck, reloadFeed, usable, onNewCount });
  latest.current = { readFollows, startCheck, reloadFeed, usable, onNewCount };
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
      if (latest.current.usable) void latest.current.startCheck(false);
    })();
    return () => {
      live = false;
      // Left: what was shown as new is seen now, once.
      if (shownNew.current <= 0) return;
      shownNew.current = 0;
      const mark = window.cuepoint?.markFollowsSeen;
      if (!mark) return;
      void mark({})
        .then((answer) => {
          if (!answer.refusal) latest.current.onNewCount(0);
        })
        .catch(reportUnexpected);
    };
  }, [active]);

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
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (mode !== "suggest" || !active) return;
    const bridge = window.cuepoint?.getFollowSuggestions;
    if (!bridge) {
      setProblem(NO_ENGINE);
      return;
    }
    let live = true;
    void bridge({ limit })
      .then((answer) => {
        if (!live) return;
        if (answer.refusal) setProblem(refusalText(answer.refusal));
        else setSuggestions(answer.value.suggestions);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (live) setProblem(userMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [active, limit, mode]);

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
    if (usable) void startCheck(false);
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
              ? { label: RETRY, onClick: () => void readFollows().then((list) => list && setMode("loading")) }
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
    const more = suggestions !== null && suggestions.length >= limit;
    return (
      <section className="discover-following discover-following--first" aria-label="Following">
        <h2 className="discover-section__title">Follow artists and labels</h2>
        <p className="discover-note">
          See their new Beatport releases here each time you open this tab. These are the ones you own
          the most tracks by.
        </p>
        {suggestions === null ? (
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
                    <span className="discover-following__name" data-cut-hint="">
                      {row.name}
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
                <Button variant="quiet" onClick={() => setLimit((was) => was + SUGGESTION_STEP)}>
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
          <span className="discover-following__name" data-cut-hint="">
            {row.name}
          </span>
          {row.new_count > 0 ? (
            <Badge variant="accent">{newCountWords(row.new_count)}</Badge>
          ) : (
            <span className="discover-following__quiet">{refused ? "not checked" : "nothing new"}</span>
          )}
          {refused && <span className="discover-following__problem">{refused.message}</span>}
        </button>
      </li>
    );
  };

  const group = (title: string, list: FollowRow[]) =>
    list.length > 0 && (
      <li className="discover-following__group">
        <h3 className="discover-following__heading">
          {title} <span className="discover-following__quiet">{formatCount(list.length)}</span>
        </h3>
        <ul className="discover-following__rows">{list.map(item)}</ul>
      </li>
    );

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
          {group("Artists", artists)}
          {group("Labels", labels)}
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
        <div className="discover-following__bar">
          <p className="discover-following__status" role="status">
            {page ? followStatusLine(page, oldestSeenThrough(rows)) : "Reading what is new…"}
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
