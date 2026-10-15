/**
 * The Health section (STATS-07, K3): four small bar charts, one per group, each with its purpose
 * in a line and one button to where it is dealt with.
 *
 * Files (present, missing, unreadable, not checked), Beatport (accepted, waiting for you,
 * rejected, no match, not matched) and Other (duplicates, changed since you decided, no
 * artwork) carry the engine's own rules, so a bar opens the Library on exactly those tracks;
 * Duplicates opens Clean's Duplicates tab instead, which is where a group is merged or dismissed.
 * Waveforms (analyzed, failed, waiting, no file) cannot be said as a rule, so they are counted
 * and open nothing. Every number is the engine's; the words are the ones Clean uses
 * (`fileStatusLabel`, `matchStateLabel`), and the Beatport states are named with the Library
 * filter's words (Waiting for you, Accepted, Rejected, No match, Not matched), so Clean,
 * Statistics and the Library chips share one set (Stelios, 2026-10-09).
 *
 * Health lives here now, and Clean's Health tab is going away. Each group has exactly one button:
 * Files and Beatport go to Clean's Missing files and Match tabs, Waveforms to Settings, and Other
 * reads the cover art, the one check that had no home but that tab. The read itself is run by
 * the page (`useCleanJob` in StatisticsScreen), not here, so it outlives this section when a
 * scope change or a failed re-read swaps it for a spinner; this section only shows its state.
 */
import { useNavigate } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsFileState,
  StatisticsHealth,
  StatisticsMatchState,
  StatisticsOtherState,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components";
import { LinkButton } from "../../components/LinkButton";
import { plural } from "../../format/counts";
import { formatDayTime } from "../../format/dates";
import { PixelBars } from "../../components/charts/PixelBars";
import { fileStatusLabel, matchStateLabel } from "../clean/cleanFormat";
import { cleanSectionState } from "../clean/cleanLink";
import { libraryRulesState } from "../library/libraryLink";
import { settingsFocusState } from "../settingsLink";

/** A bar: what it is called, how many, and what clicking it does (nothing when null). */
interface Item {
  label: string;
  count: number;
  open: (() => void) | null;
}

const FILE_STATES: readonly StatisticsFileState[] = [
  "present",
  "missing",
  "unreadable",
  "not_checked",
];

const BEATPORT_STATES: readonly StatisticsMatchState[] = [
  "accepted",
  "needs_review",
  "rejected",
  "no_match",
  "not_matched",
];

const WAVEFORM_ITEMS = [
  ["analyzed", "Analyzed"],
  ["failed", "Failed"],
  ["waiting", "Waiting"],
  ["no_file", "No file"],
] as const;

/** Clean's own words for the Other group (`HEALTH_RULES` labels), by the engine's key. */
const OTHER_ITEMS: readonly (readonly [StatisticsOtherState, string])[] = [
  ["duplicates", "Duplicates"],
  ["disputed", "Changed since you decided"],
  ["no_artwork", "No artwork"],
];

/** What each group is for, in a line (from Clean Health's purposes, CLN-9). */
const PURPOSES = {
  files: "Looks for tracks whose file has moved or been deleted.",
  beatport:
    "How your tracks stand against Beatport: matched, waiting for you, or not matched yet.",
  waveforms: "Draws each track's waveform so you can see its shape before you play it.",
  other: "Duplicate tracks, matches Beatport changed after you decided, and the cover pictures stored inside your audio files.",
} as const;

/** When an instant was, with the time on the computer's clock; the text itself if it is not a date. */
function dayWords(iso: string): string {
  return formatDayTime(iso) || iso;
}

/** "Last checked September 3, 2026", or the plain fact that no check has run. */
function checkedLine(checkedAt: string | null): string {
  if (!checkedAt) return "Files have not been checked yet";
  return `Last checked ${dayWords(checkedAt)}`;
}

/** "Cover art last read September 3, 2026", or the plain fact that it has not been. */
function artworkLine(checkedAt: string | null): string {
  if (!checkedAt) return "Cover art has not been read yet";
  return `Cover art last read ${dayWords(checkedAt)}`;
}

interface GroupProps {
  id: "files" | "beatport" | "waveforms" | "other";
  title: string;
  purpose: string;
  items: Item[];
  note?: string;
  /** A "go to" link (it opens another page), or a button that acts here. */
  action:
    | { kind: "go"; page: string; onClick: () => void }
    | { kind: "button"; label: string; onClick: () => void; disabled?: boolean; loading?: boolean };
}

function Group({ id, title, purpose, items, note, action }: GroupProps) {
  const opens = items.some((item) => item.open !== null);
  return (
    <div className="statistics-panel" data-panel={id}>
      <h3 className="statistics-panel__title">{title}</h3>
      <p className="statistics-panel__purpose">{purpose}</p>
      <PixelBars<Item>
        title={title}
        buckets={items}
        orientation="horizontal"
        barName={(item) => `${item.label}, ${plural(item.count, "track")}`}
        onSelect={opens ? (item) => item.open?.() : undefined}
        isSelectable={(item) => item.open !== null}
        bucketLabel={title}
      />
      {note && <p className="statistics-note">{note}</p>}
      {action.kind === "go" ? (
        <LinkButton go onClick={action.onClick}>
          {`Open in ${action.page}`}
        </LinkButton>
      ) : (
        <Button
          variant="secondary"
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface HealthSectionProps {
  health: StatisticsHealth;
  /** True while the page's cover-art read is running. */
  coverArtRunning: boolean;
  /** Starts the cover-art read (the page owns it, so it survives this section unmounting). */
  onReadCoverArt: () => void;
}

export function HealthSection({ health, coverArtRunning, onReadCoverArt }: HealthSectionProps) {
  const navigate = useNavigate();
  const openRules = (rules: FilterRuleSet) =>
    navigate("/library", { state: libraryRulesState(rules) });

  const files: Item[] = FILE_STATES.map((key) => ({
    label: fileStatusLabel(key),
    count: health.files[key].count,
    open: () => openRules(health.files[key].rules),
  }));
  const beatport: Item[] = BEATPORT_STATES.map((key) => ({
    label: matchStateLabel(key),
    count: health.beatport[key].count,
    open: () => openRules(health.beatport[key].rules),
  }));
  const waveforms: Item[] = WAVEFORM_ITEMS.map(([key, label]) => ({
    label,
    count: health.analyzed[key],
    open: null,
  }));
  const other: Item[] = OTHER_ITEMS.map(([key, label]) => ({
    label,
    count: health.other[key].count,
    // Duplicates are dealt with in Clean's tab; the others are a list in the Library.
    open:
      key === "duplicates"
        ? () => navigate("/clean", { state: cleanSectionState("duplicates") })
        : () => openRules(health.other[key].rules),
  }));

  return (
    <div className="statistics-panels">
      <Group
        id="files"
        title="Files"
        purpose={PURPOSES.files}
        items={files}
        note={checkedLine(health.checked_at)}
        action={{
          kind: "go",
          page: "Clean",
          onClick: () => navigate("/clean", { state: cleanSectionState("missing") }),
        }}
      />
      <Group
        id="beatport"
        title="Beatport"
        purpose={PURPOSES.beatport}
        items={beatport}
        action={{
          kind: "go",
          page: "Clean",
          onClick: () => navigate("/clean", { state: cleanSectionState("review") }),
        }}
      />
      <Group
        id="waveforms"
        title="Waveforms"
        purpose={PURPOSES.waveforms}
        items={waveforms}
        action={{
          kind: "go",
          page: "Settings",
          onClick: () => navigate("/settings", { state: settingsFocusState("waveforms") }),
        }}
      />
      <Group
        id="other"
        title="Other"
        purpose={PURPOSES.other}
        items={other}
        note={artworkLine(health.artwork_checked_at)}
        action={{
          kind: "button",
          label: "Read cover art",
          onClick: onReadCoverArt,
          disabled: coverArtRunning,
          loading: coverArtRunning,
        }}
      />
    </div>
  );
}
