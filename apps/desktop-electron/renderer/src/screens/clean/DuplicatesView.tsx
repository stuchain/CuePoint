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
  ListedDuplicateGroup,
  TagUsage,
} from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button, Card, EmptyState, Loading, Modal, useToast } from "../../components";
import { formatCount, plural } from "../../format/counts";
import { UNDO } from "../../format/words";
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
import { fileStatusLabel, signalExplanation, signalLabel, trackCount } from "./cleanFormat";
import { revealTrack } from "./revealTrack";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { reportUnexpected } from "../../reporting/reporting";
import { NEEDS_DESKTOP, userMessage } from "../../api/userMessage";

/** Groups read at a time: a screenful or two, never a whole library's worth. */
const DUPLICATE_PAGE = 50;

interface GroupCardProps {
  group: ListedDuplicateGroup;
  busy: boolean;
  onAnswer: (group: ListedDuplicateGroup, answer: "dismiss" | "restore") => void;
  onTag: (group: ListedDuplicateGroup) => void;
  onCollect: (group: ListedDuplicateGroup) => void;
  onReveal: (trackId: number) => void;
}

function GroupCard({ group, busy, onAnswer, onTag, onCollect, onReveal }: GroupCardProps) {
  const heading = `${signalLabel(group.signal)} · ${trackCount(group.track_ids.length)}`;
  return (
    <li className="clean-group-item" aria-label={heading}>
      <Card
        className={`clean-group${group.dismissed ? " clean-group--dismissed" : ""}`}
        title={heading}
        unit={group.dismissed ? <Badge>Marked not duplicates</Badge> : undefined}
        bodyClassName="clean-group__body"
      >
      <p className="clean-group__why">{signalExplanation(group.signal)}</p>
      <ul className="clean-group__members">
        {group.members.map((member) => (
          <li key={member.id ?? member.file_path} className="clean-group__member">
            <span className="clean-group__track">
              <span className="clean-group__name">{member.title}</span> — {member.artist}
            </span>
            <span className="clean-group__facts">
              {[
                formatDuration(member.duration_seconds),
                member.bitrate ? `${member.bitrate} kbps` : "",
                fileStatusLabel(member.file_status),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="clean-group__path">{member.file_path}</span>
            <Button
              variant="secondary"
              aria-label={`Show ${member.title} in its folder`}
              onClick={() => member.id != null && onReveal(member.id)}
            >
              Show in folder
            </Button>
          </li>
        ))}
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
      return { title: `Tag ${tracks} “${pending.action.target}”?`, button: `Tag ${tracks}` };
    case "add_to_collection":
      return {
        title: `Add ${tracks} to “${pending.action.target}”?`,
        button: `Add ${tracks} to Collection`,
      };
    default:
      return { title: `Change ${tracks}?`, button: `Change ${tracks}` };
  }
}

export function DuplicatesView({ health, onHealthChanged }: DuplicatesViewProps) {
  const { push } = useToast();
  const message = useCallback(
    (text: string, tone: CleanMessageTone) => push(text, tone),
    [push],
  );
  const jobs = useCleanJob(message);
  const batch = useLibraryBatch({ onMessage: message, onApplied: () => undefined });

  const [groups, setGroups] = useState<ListedDuplicateGroup[]>([]);
  const [total, setTotal] = useState(0);
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
      setError(NEEDS_DESKTOP);
      return;
    }
    let cancelled = false;
    setLoading(true);
    bridge({ includeDismissed, limit: DUPLICATE_PAGE, offset: 0 })
      .then((payload) => {
        if (cancelled) return;
        setGroups(payload.groups);
        setTotal(payload.total);
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
            : "Shown as possible duplicates again.",
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
        // "Add to Collection" offers crates only. A Set holds tracks too, but
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
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    void jobs.run<CleanJobStarted>("scan", () => bridge({}), {
      started: () => "Looking for duplicates.",
      succeeded: "Finished looking for duplicates.",
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

  return (
    <div className="clean-duplicates">
      <div className="clean-toolbar" role="toolbar" aria-label="Duplicates">
        <span className="clean-toolbar__count cp-data" role="status">
          {plural(total, "group")}
        </span>
        <label className="clean-toolbar__check">
          <input
            type="checkbox"
            checked={includeDismissed}
            onChange={(event) => setIncludeDismissed(event.target.checked)}
          />
          Show groups marked not duplicates
        </label>
        <span className="clean-toolbar__spacer" />
        <Button
          variant="secondary"
          disabled={jobs.running !== null}
          loading={jobs.running === "scan"}
          onClick={scan}
        >
          Find duplicates
        </Button>
      </div>

      <div className="clean-duplicates__list">
        {loading && groups.length === 0 ? (
          <Loading what="possible duplicates" />
        ) : groups.length === 0 ? (
          <EmptyState
            icon="clean"
            tone={empty.offer === null && !error ? "clear" : "empty"}
            headline={empty.headline}
            description={empty.hint ?? undefined}
            action={
              empty.offer === "find_duplicates"
                ? { label: "Find duplicates", onClick: scan, disabled: jobs.running !== null }
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
        title={picker?.kind === "collection" ? "Add to Collection" : "Add a tag"}
        items={pickerItems}
        onChoose={choose}
        onClose={() => setPicker(null)}
        onCreate={picker?.kind === "tag" ? (name) => void createAndTag(name) : undefined}
        emptyText={
          picker?.kind === "collection"
            ? "There are no Collections yet — make one in the Library."
            : "No tags yet."
        }
      />

      <Modal
        open={batch.pending !== null}
        title={confirmWords.title}
        onClose={batch.cancel}
        primaryAction={{
          label: confirmWords.button,
          onClick: () => void batch.confirm(),
          loading: batch.busy,
        }}
        secondaryAction={{ label: "Cancel", onClick: batch.cancel }}
      >
        <p>{batch.question}</p>
        {batch.pending && <p>{batchConsequence(batch.pending.action.kind)}</p>}
      </Modal>
    </div>
  );
}
