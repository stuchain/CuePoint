/**
 * Possible duplicates (CLEAN-12, DEC-074).
 *
 * Groups, each with the signal that put its tracks together and the tracks
 * themselves, read a page of groups at a time. Per group: mark it "not
 * duplicates", tag its tracks, add them to a Collection, and show each file.
 *
 * **There is no delete control anywhere on this page**, and a test holds it to
 * that. A refresh re-adds a deleted track, and the file is the user's
 * (DEC-074): which copy to keep is decided in Rekordbox. Tagging and
 * collecting go through ORG-11's one batch entry point, so they are recorded
 * in each track's history like any other edit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CleanJobStarted,
  CollectionNode,
  LibraryHealth,
  LibraryTrackRow,
  ListedDuplicateGroup,
  TagUsage,
} from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button, Card, EmptyState, Loading, Modal, Notice, useToast } from "../../components";
import { formatCount, plural } from "../../format/counts";
import { CANCEL, RETRY, UNDO, quoted } from "../../format/words";
import { trackIdentity } from "../../format/trackFacts";
import { COLLECTIONS, TAGS, useSharedRead } from "../../api/sharedReads";
import { PickerDialog, type PickerItem } from "../library/PickerDialog";
import {
  buildCollectionTree,
  flattenCollections,
  iconForKind,
  isCollection,
} from "../library/collectionTree";
import { formatDuration } from "../library/trackValues";
import { batchConsequence } from "../library/libraryBatch";
import { useLibraryBatch, type BatchRun } from "../library/useLibraryBatch";
import { duplicatesEmptyState } from "./cleanEmpty";
import {
  MIXES_DIFFER_LINE,
  differingParts,
  duplicateCountLine,
  fileStatusLabel,
  signalExplanation,
  signalLabel,
  trackCount,
} from "./cleanFormat";
import { displayPathNameFirst } from "../../format/paths";
import { toQueueItem } from "../library/useLibraryPlayback";
import { checkedLine, lastRun } from "./cleanEmpty";
import { revealTrack } from "./revealTrack";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { reportUnexpected } from "../../reporting/reporting";
import { needsDesktopApp, userMessage } from "../../api/userMessage";

/** Groups read at a time: a screenful or two, never a whole library's worth. */
const DUPLICATE_PAGE = 50;

interface GroupCardProps {
  group: ListedDuplicateGroup;
  busy: boolean;
  onAnswer: (group: ListedDuplicateGroup, answer: "dismiss" | "restore") => void;
  onTag: (group: ListedDuplicateGroup) => void;
  onCollect: (group: ListedDuplicateGroup) => void;
  onReveal: (trackId: number) => void;
  onPlay: (member: LibraryTrackRow) => void;
  onKeep: (group: ListedDuplicateGroup, member: LibraryTrackRow) => void;
  onCheckMatch?: (trackId: number) => void;
}

function GroupCard({ group, busy, onAnswer, onTag, onCollect, onReveal, onPlay, onKeep, onCheckMatch }: GroupCardProps) {
  const first = group.members[0];
  // The group is named for its track, and the signal that put it together is said at its right (D18).
  const heading = first ? trackIdentity(first.title, first.artist) : signalLabel(group.signal);
  const count = group.track_count ?? group.track_ids.length;
  const differing = new Map((group.differing ?? []).map((entry) => [entry.track_id, entry.words]));
  return (
    <li className="clean-group-item" aria-label={`${heading}, ${trackCount(count)}`}>
      <Card
        className={`clean-group${group.dismissed ? " clean-group--dismissed" : ""}`}
        title={heading}
        unit={
          <>
            {group.dismissed && <Badge>Dismissed</Badge>}
            <span className="clean-group__signal">{signalLabel(group.signal)}</span>
          </>
        }
        bodyClassName="clean-group__body"
      >
        {group.mixes_differ ? (
          <Notice
            kind="warning"
            action={
              onCheckMatch && first?.id != null ? (
                <Button variant="quiet" size="sm" onClick={() => onCheckMatch(first.id!)}>
                  Check the match
                </Button>
              ) : undefined
            }
          >
            {MIXES_DIFFER_LINE}
          </Notice>
        ) : (
          <p className="clean-group__why">{signalExplanation(group.signal)}</p>
        )}
        <ul className="clean-group__members">
          {group.members.map((member) => {
            const status = member.file_status && member.file_status !== "present" ? fileStatusLabel(member.file_status) : "";
            const parts = differingParts(member.title, differing.get(member.id ?? -1) ?? []);
            return (
              <li key={member.id ?? member.file_path} className="clean-group__member">
                <span className="clean-group__track">
                  <span className="clean-group__name">
                    {parts.map((part, index) => (
                      <span key={index} className={part.differs ? "review-part--differs" : undefined}>
                        {part.text}
                      </span>
                    ))}
                    {member.artist ? ` · ${member.artist}` : ""}
                  </span>
                </span>
                <span className="clean-group__facts">
                  {[formatDuration(member.duration_seconds), member.bitrate ? `${member.bitrate} kbps` : "", status]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="clean-group__path" data-cut-hint>
                  {displayPathNameFirst(member.file_path)}
                </span>
                <span className="clean-group__row-actions cp-button-row">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="play"
                    aria-label={`Play ${member.title}`}
                    onClick={() => onPlay(member)}
                  >
                    Play
                  </Button>
                  {!group.dismissed && (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Keep ${member.title}: mark this group as not duplicates`}
                      disabled={busy}
                      onClick={() => onKeep(group, member)}
                    >
                      Keep this one
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Show ${member.title} in its folder`}
                    onClick={() => member.id != null && onReveal(member.id)}
                  >
                    Show in folder
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="clean-group__actions" role="group" aria-label="What to do with this group">
          {group.dismissed ? (
            <Button variant="secondary" loading={busy} onClick={() => onAnswer(group, "restore")}>
              Show as duplicates again
            </Button>
          ) : (
            <Button variant="secondary" loading={busy} onClick={() => onAnswer(group, "dismiss")}>
              Not duplicates
            </Button>
          )}
          <Button variant="secondary" onClick={() => onTag(group)}>
            Tag these tracks…
          </Button>
          <Button variant="secondary" onClick={() => onCollect(group)}>
            Add to a Collection…
          </Button>
        </div>
      </Card>
    </li>
  );
}

interface DuplicatesViewProps {
  health: LibraryHealth | null;
  onHealthChanged: () => void;
  /** Open a track's match for checking in Match (D18): different mixes under one Beatport track. */
  onCheckMatch?: (trackId: number) => void;
}

/**
 * The big-batch confirmation's words (R3-2): the title says what is about to happen and the
 * button repeats it with the count, so the one click is not a bare "Apply". Duplicates only
 * tags tracks or adds them to a Collection; anything else keeps the general question.
 */
function confirmWordsFor(pending: BatchRun | null): { title: string; button: string } {
  if (!pending) return { title: "Change tracks?", button: "Apply" };
  const tracks = plural(pending.count, "track");
  switch (pending.action.kind) {
    case "add_tag":
      return { title: `Tag ${tracks} ${quoted(pending.action.target)}?`, button: `Tag ${tracks}` };
    case "add_to_collection":
      return {
        title: `Add ${tracks} to ${quoted(pending.action.target)}?`,
        button: `Add ${tracks} to Collection`,
      };
    default:
      return { title: `Change ${tracks}?`, button: `Change ${tracks}` };
  }
}

export function DuplicatesView({ health, onHealthChanged, onCheckMatch }: DuplicatesViewProps) {
  const { push } = useToast();
  const message = useCallback(
    (text: string, tone: CleanMessageTone) => push(text, tone),
    [push],
  );
  const jobs = useCleanJob(message);
  const batch = useLibraryBatch({ onMessage: message, onApplied: () => undefined });

  const [groups, setGroups] = useState<ListedDuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [trackTotal, setTrackTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [acting, setActing] = useState<number | null>(null);
  const [picker, setPicker] = useState<{
    kind: "tag" | "collection";
    group: ListedDuplicateGroup;
  } | null>(null);
  // The picker's tags and Collections come from the shared cache (C19d), read from the
  // first time a picker opens; a picker opened later asks again, so it is never stale.
  const [pickerRead, setPickerRead] = useState({ tag: false, collection: false });
  const tagsRead = useSharedRead(TAGS, pickerRead.tag);
  const collectionsRead = useSharedRead(COLLECTIONS, pickerRead.collection);
  const { refresh: refreshTags } = tagsRead;
  const { refresh: refreshCollections } = collectionsRead;
  const tags: TagUsage[] = useMemo(() => tagsRead.value?.tags ?? [], [tagsRead.value]);
  const collections: CollectionNode[] = useMemo(
    () => collectionsRead.value?.collections ?? [],
    [collectionsRead.value],
  );

  useEffect(() => {
    const bridge = window.cuepoint?.getDuplicateGroups;
    if (!bridge) {
      setLoading(false);
      setError(needsDesktopApp());
      return;
    }
    let cancelled = false;
    setLoading(true);
    bridge({ includeDismissed, limit: DUPLICATE_PAGE, offset: 0 })
      .then((payload) => {
        if (cancelled) return;
        setGroups(payload.groups);
        setTotal(payload.total);
        setTrackTotal(payload.track_total);
        setError(null);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (!cancelled) setError(userMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeDismissed, reloads]);

  const more = useCallback(async () => {
    const bridge = window.cuepoint?.getDuplicateGroups;
    if (!bridge) return;
    try {
      const payload = await bridge({
        includeDismissed,
        limit: DUPLICATE_PAGE,
        offset: groups.length,
      });
      setGroups((previous) => [...previous, ...payload.groups]);
      setTotal(payload.total);
      setTrackTotal(payload.track_total);
    } catch (cause) {
      reportUnexpected(cause);
      push(userMessage(cause), "warning");
    }
  }, [groups.length, includeDismissed, push]);

  const answer = useCallback(
    async (group: ListedDuplicateGroup, kind: "dismiss" | "restore") => {
      const bridge =
        kind === "dismiss"
          ? window.cuepoint?.dismissDuplicateGroup
          : window.cuepoint?.restoreDuplicateGroup;
      if (!bridge) return;
      setActing(group.id);
      try {
        const { group: changed } = await bridge({ group_id: group.id });
        if (!includeDismissed && changed.dismissed) {
          setGroups((previous) => previous.filter((entry) => entry.id !== group.id));
          setTotal((count) => Math.max(0, count - 1));
        } else {
          // The answer carries the group without its members; the members
          // are the ones already on screen.
          setGroups((previous) =>
            previous.map((entry) => (entry.id === group.id ? { ...entry, ...changed } : entry)),
          );
        }
        // Marking a group is undoable, so it is done at once and the toast offers Undo.
        push(
          kind === "dismiss"
            ? "Marked as not duplicates. It comes back if these tracks change."
            : "Shown as possible duplicates again",
          "success",
          kind === "dismiss"
            ? {
                label: UNDO,
                onClick: () => {
                  void answer(group, "restore").then(() => setReloads((value) => value + 1));
                },
              }
            : undefined,
        );
        onHealthChanged();
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
      } finally {
        setActing(null);
      }
    },
    [includeDismissed, onHealthChanged, push],
  );

  /** Play one copy, to judge it by ear (D18). */
  const play = useCallback(
    (member: LibraryTrackRow) => {
      const player = window.cuepoint?.player;
      if (!player?.playQueue) return;
      void player
        .playQueue([toQueueItem(member)], 0)
        .then((result) => {
          if (result && !result.ok) push(result.error, "warning");
        })
        .catch(() => undefined);
    },
    [push],
  );

  /**
   * Keep this one (M153): nothing is deleted. The group is marked as not duplicates, as "Not
   * duplicates" does, and the toast says so and offers Undo.
   */
  const keep = useCallback(
    async (group: ListedDuplicateGroup, member: LibraryTrackRow) => {
      const bridge = window.cuepoint?.keepDuplicateTrack;
      if (!bridge || member.id == null) return;
      setActing(group.id);
      try {
        await bridge({ group_id: group.id, track_id: member.id });
        setReloads((value) => value + 1);
        push(
          `Kept ${quoted(member.title)}. Nothing was deleted; the group is marked as not duplicates.`,
          "success",
          {
            label: UNDO,
            onClick: () => {
              void answer(group, "restore").then(() => setReloads((value) => value + 1));
            },
          },
        );
        onHealthChanged();
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
      } finally {
        setActing(null);
      }
    },
    [answer, onHealthChanged, push],
  );

  const openPicker = useCallback(
    (kind: "tag" | "collection", group: ListedDuplicateGroup) => {
      setPicker({ kind, group });
      // If the read fails the picker says there is nothing to choose; a tag can still be typed.
      if (!pickerRead[kind]) setPickerRead((current) => ({ ...current, [kind]: true }));
      else if (kind === "tag") refreshTags();
      else refreshCollections();
    },
    [pickerRead, refreshCollections, refreshTags],
  );

  const pickerItems = useMemo((): PickerItem[] => {
    if (!picker) return [];
    if (picker.kind === "collection") {
      return flattenCollections(buildCollectionTree(collections)).map((node) => ({
        id: node.id,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind),
        // "Add to a Collection" offers crates only. A Set holds tracks too, but
        // it is not a crate (fact 2), and copies of one track have no place
        // side by side in a running order.
        disabled: !isCollection(node),
        hint: isCollection(node) ? formatCount(node.entry_count) : undefined,
      }));
    }
    return tags.map((tag) => ({
      id: tag.id,
      label: tag.name,
      icon: "tag" as const,
      hint: formatCount(tag.track_count),
    }));
  }, [collections, picker, tags]);

  const choose = useCallback(
    (item: PickerItem) => {
      const current = picker;
      setPicker(null);
      if (!current) return;
      void batch.start({
        action: {
          kind: current.kind === "tag" ? "add_tag" : "add_to_collection",
          value: item.id,
          target: item.label,
        },
        selection: { track_ids: current.group.track_ids },
        count: current.group.track_ids.length,
      });
    },
    [batch, picker],
  );

  const createAndTag = useCallback(
    async (name: string) => {
      const current = picker;
      setPicker(null);
      const create = window.cuepoint?.createTag;
      if (!current || !create) return;
      try {
        const { tag } = await create({ name });
        void batch.start({
          action: { kind: "add_tag", value: tag.id, target: tag.name },
          selection: { track_ids: current.group.track_ids },
          count: current.group.track_ids.length,
        });
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
      }
    },
    [batch, picker, push],
  );

  const confirmWords = confirmWordsFor(batch.pending);

  const scan = useCallback(() => {
    const bridge = window.cuepoint?.startDuplicateScan;
    if (!bridge) {
      push(needsDesktopApp(), "warning");
      return;
    }
    void jobs.run<CleanJobStarted>("scan", () => bridge({}), {
      started: () => "Looking for duplicates",
      succeeded: "Finished looking for duplicates",
      onEnded: () => {
        setReloads((value) => value + 1);
        onHealthChanged();
      },
    });
  }, [jobs, onHealthChanged, push]);

  const reveal = useCallback(
    (trackId: number) => {
      void revealTrack(trackId).then((outcome) => {
        if (outcome) push(outcome.message, outcome.tone);
      });
    },
    [push],
  );

  const empty = duplicatesEmptyState(health, error, includeDismissed);
  const lastChecked = health ? lastRun(health, "duplicates") : undefined;
  const checked = lastChecked ? checkedLine(lastChecked) : "";

  return (
    <div className="clean-duplicates">
      <div className="cp-toolbar" role="toolbar" aria-label="Duplicates">
        <span className="cp-count clean-toolbar__count" role="status">
          {duplicateCountLine(total, trackTotal)}
        </span>
        {/* Nothing to include until there is something: the option waits for a group (M150). */}
        {(total > 0 || includeDismissed) && (
          <label className="clean-toolbar__check">
            <input
              type="checkbox"
              checked={includeDismissed}
              onChange={(event) => setIncludeDismissed(event.target.checked)}
            />
            Show dismissed groups
          </label>
        )}
        {checked && (
          <span className="clean-toolbar__status" role="status">
            {checked}
          </span>
        )}
        <Button
          variant="secondary"
          className="cp-btn--framed"
          disabled={jobs.running !== null}
          loading={jobs.running === "scan"}
          onClick={scan}
        >
          {/* One "<verb> again" pattern for a re-run, the same as Missing files' (C180, M397). */}
          {empty.offer === "find_duplicates" ? "Check for duplicates" : "Check again"}
        </Button>
      </div>

      <div className="clean-duplicates__list">
        {loading && groups.length === 0 ? (
          <Loading centered what="possible duplicates" />
        ) : groups.length === 0 && error ? (
          // A failed read is a red notice with Try again, the same on every page (C142).
          <Notice
            kind="danger"
            action={
              <Button variant="secondary" onClick={() => setReloads((value) => value + 1)}>
                {RETRY}
              </Button>
            }
          >
            {error}
          </Notice>
        ) : groups.length === 0 ? (
          // The page's own empty state, icon and all, as Missing files draws its own (C140).
          <EmptyState
            // The check mark is for a clean result; "nothing yet" has a neutral icon (M159).
            icon={empty.offer === null && !error ? "clean" : "search"}
            tone={empty.offer === null && !error ? "clear" : "empty"}
            headline={empty.headline}
            description={empty.hint ?? undefined}
            action={
              empty.offer === "find_duplicates"
                ? { label: "Check for duplicates", onClick: scan, disabled: jobs.running !== null }
                : undefined
            }
          />
        ) : (
          <ul className="clean-groups" aria-label="Possible duplicate groups">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                busy={acting === group.id}
                onAnswer={(target, kind) => void answer(target, kind)}
                onTag={(target) => void openPicker("tag", target)}
                onCollect={(target) => void openPicker("collection", target)}
                onReveal={reveal}
                onPlay={play}
                onKeep={(target, member) => void keep(target, member)}
                onCheckMatch={onCheckMatch}
              />
            ))}
          </ul>
        )}
        {groups.length > 0 && groups.length < total && (
          <Button variant="secondary" onClick={() => void more()}>
            Show more groups
          </Button>
        )}
      </div>

      <PickerDialog
        open={picker !== null}
        title={picker?.kind === "collection" ? "Add to a Collection" : "Add a tag"}
        items={pickerItems}
        onChoose={choose}
        onClose={() => setPicker(null)}
        onCreate={picker?.kind === "tag" ? (name) => void createAndTag(name) : undefined}
        emptyText={
          picker?.kind === "collection"
            ? "There are no Collections yet. Make one in the Library."
            : "No tags yet"
        }
      />

      <Modal
        open={batch.pending !== null}
        title={confirmWords.title}
        size="small"
        onClose={batch.cancel}
        primaryAction={{
          label: confirmWords.button,
          onClick: () => void batch.confirm(),
          loading: batch.busy,
        }}
        secondaryAction={{ label: CANCEL, onClick: batch.cancel }}
      >
        <p>{batch.question}</p>
        {batch.pending && <p>{batchConsequence(batch.pending.action.kind)}</p>}
      </Modal>
    </div>
  );
}
