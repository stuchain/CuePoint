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
import { Button, Modal, useToast } from "../../components";
import { PickerDialog, type PickerItem } from "../library/PickerDialog";
import {
  buildCollectionTree,
  flattenCollections,
  holdsTracks,
  iconForKind,
} from "../library/collectionTree";
import { formatDuration } from "../library/trackValues";
import { batchConsequence } from "../library/libraryBatch";
import { useLibraryBatch } from "../library/useLibraryBatch";
import { duplicatesEmptyState } from "./cleanEmpty";
import { fileStatusLabel, signalExplanation, signalLabel, trackCount } from "./cleanFormat";
import { revealTrack } from "./revealTrack";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";

/** Groups read at a time: a screenful or two, never a whole library's worth. */
export const DUPLICATE_PAGE = 50;

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface GroupCardProps {
  group: ListedDuplicateGroup;
  busy: boolean;
  onAnswer: (group: ListedDuplicateGroup, answer: "dismiss" | "restore") => void;
  onTag: (group: ListedDuplicateGroup) => void;
  onCollect: (group: ListedDuplicateGroup) => void;
  onReveal: (trackId: number) => void;
}

function GroupCard({ group, busy, onAnswer, onTag, onCollect, onReveal }: GroupCardProps) {
  const headingId = `clean-group-${group.id}`;
  return (
    <li
      className={`clean-group${group.dismissed ? " clean-group--dismissed" : ""}`}
      aria-labelledby={headingId}
    >
      <div className="clean-group__head">
        <h3 id={headingId} className="clean-group__title">
          {signalLabel(group.signal)} · {trackCount(group.track_ids.length)}
        </h3>
        {group.dismissed && <Badge>Marked not duplicates</Badge>}
      </div>
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
    </li>
  );
}

export interface DuplicatesViewProps {
  health: LibraryHealth | null;
  onHealthChanged: () => void;
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
  const [tags, setTags] = useState<TagUsage[]>([]);
  const [collections, setCollections] = useState<CollectionNode[]>([]);

  useEffect(() => {
    const bridge = window.cuepoint?.getDuplicateGroups;
    if (!bridge) {
      setLoading(false);
      setError("CuePoint's engine is not available in this window");
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
        if (!cancelled) setError(messageOf(cause));
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
      push(messageOf(cause), "warning");
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
        push(
          kind === "dismiss"
            ? "Marked as not duplicates. It comes back if these tracks change."
            : "Shown as possible duplicates again.",
          "success",
        );
        onHealthChanged();
      } catch (cause) {
        push(messageOf(cause), "warning");
      } finally {
        setActing(null);
      }
    },
    [includeDismissed, onHealthChanged, push],
  );

  const openPicker = useCallback(async (kind: "tag" | "collection", group: ListedDuplicateGroup) => {
    setPicker({ kind, group });
    try {
      if (kind === "tag") {
        const payload = await window.cuepoint?.getTags?.();
        if (payload) setTags(payload.tags);
      } else {
        const payload = await window.cuepoint?.getCollections?.();
        if (payload) setCollections(payload.collections);
      }
    } catch {
      // The picker says there is nothing to choose; a tag can still be typed.
    }
  }, []);

  const pickerItems = useMemo((): PickerItem[] => {
    if (!picker) return [];
    if (picker.kind === "collection") {
      return flattenCollections(buildCollectionTree(collections)).map((node) => ({
        id: node.id,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind),
        disabled: !holdsTracks(node),
        hint: holdsTracks(node) ? node.entry_count.toLocaleString() : undefined,
      }));
    }
    return tags.map((tag) => ({
      id: tag.id,
      label: tag.name,
      icon: "tag" as const,
      hint: tag.track_count.toLocaleString(),
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
        push(messageOf(cause), "warning");
      }
    },
    [batch, picker, push],
  );

  const scan = useCallback(() => {
    const bridge = window.cuepoint?.startDuplicateScan;
    if (!bridge) {
      push("Finding duplicates needs the desktop app with the engine connected.", "warning");
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
      <div className="clean-note">
        <p className="clean-note__text">
          Possible duplicates are grouped by what they share. CuePoint deletes nothing: decide which
          copy to keep in Rekordbox, or mark a group as not duplicates.
        </p>
      </div>

      <div className="clean-toolbar" role="toolbar" aria-label="Duplicates">
        <span className="clean-toolbar__count">
          {total === 1 ? "1 group" : `${total.toLocaleString()} groups`}
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
          <p className="clean-empty__hint">Reading possible duplicates…</p>
        ) : groups.length === 0 ? (
          <div className="clean-empty">
            <p className="clean-empty__headline">{empty.headline}</p>
            {empty.hint && <p className="clean-empty__hint">{empty.hint}</p>}
            {empty.offer === "find_duplicates" && (
              <Button variant="secondary" disabled={jobs.running !== null} onClick={scan}>
                Find duplicates
              </Button>
            )}
          </div>
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
        title="That is a lot of tracks"
        onClose={batch.cancel}
        primaryAction={{ label: "Apply", onClick: () => void batch.confirm(), loading: batch.busy }}
        secondaryAction={{ label: "Cancel", onClick: batch.cancel }}
      >
        <p>{batch.question}</p>
        {batch.pending && <p>{batchConsequence(batch.pending.action.kind)}</p>}
      </Modal>
    </div>
  );
}
