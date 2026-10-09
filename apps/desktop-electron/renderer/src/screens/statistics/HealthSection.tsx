/**
 * The Health section (STATS-07): three small bar charts, one per group, each with the link to
 * where it is fixed.
 *
 * Files (present, missing, unreadable, not checked) and Beatport (accepted, waiting for you,
 * rejected, not found, not looked up yet) carry the engine's own rules, so a bar opens the
 * Library on exactly those tracks. Waveforms (analyzed, failed, waiting, no file) cannot be said
 * as a rule, so they are counted and open nothing. A visible button takes each group to where it
 * is fixed, and **All health checks** opens Clean's Health tab, which stays (DEC-163). Every
 * number is the engine's; the words are the ones Clean uses (`fileStatusLabel`, `matchStateLabel`); the Library's filter
 * chip names some Beatport states differently (Rejected, No match, Not matched).
 */
import { useNavigate } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsFileState,
  StatisticsHealth,
  StatisticsMatchState,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { tracksText } from "../../components/charts/formatCount";
import { PixelBars } from "../../components/charts/PixelBars";
import { fileStatusLabel, matchStateLabel } from "../clean/cleanFormat";
import { cleanSectionState } from "../clean/cleanLink";
import { libraryRulesState } from "../library/libraryLink";
import { settingsFocusState } from "../settingsLink";

interface Item {
  label: string;
  count: number;
  rules: FilterRuleSet | null;
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

/** "Last checked September 3, 2026", or the plain fact that no check has run. */
function checkedLine(checkedAt: string | null): string {
  if (!checkedAt) return "Files have not been checked yet";
  const when = new Date(checkedAt);
  if (Number.isNaN(when.getTime())) return `Last checked ${checkedAt}`;
  const date = when.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `Last checked ${date}`;
}

interface GroupProps {
  id: "files" | "beatport" | "waveforms";
  title: string;
  items: Item[];
  /** Whether a bar can open the Library. */
  opens: boolean;
  onOpen: (rules: FilterRuleSet) => void;
  note?: string;
  action: { label: string; onClick: () => void };
}

function Group({ id, title, items, opens, onOpen, note, action }: GroupProps) {
  return (
    <div className="statistics-panel" data-panel={id}>
      <h3 className="statistics-panel__title">{title}</h3>
      <PixelBars<Item>
        title={title}
        buckets={items}
        orientation="horizontal"
        barName={(item) => `${item.label}, ${tracksText(item.count)}`}
        onSelect={opens ? (item) => item.rules && onOpen(item.rules) : undefined}
        isSelectable={(item) => item.rules !== null}
        bucketLabel={title}
      />
      {note && <p className="statistics-note">{note}</p>}
      <Button variant="secondary" onClick={action.onClick}>
        {action.label}
      </Button>
    </div>
  );
}

export function HealthSection({ health }: { health: StatisticsHealth }) {
  const navigate = useNavigate();
  const openRules = (rules: FilterRuleSet) =>
    navigate("/library", { state: libraryRulesState(rules) });

  const files: Item[] = FILE_STATES.map((key) => ({
    label: fileStatusLabel(key),
    count: health.files[key].count,
    rules: health.files[key].rules,
  }));
  const beatport: Item[] = BEATPORT_STATES.map((key) => ({
    label: matchStateLabel(key),
    count: health.beatport[key].count,
    rules: health.beatport[key].rules,
  }));
  const waveforms: Item[] = WAVEFORM_ITEMS.map(([key, label]) => ({
    label,
    count: health.analyzed[key],
    rules: null,
  }));

  return (
    <>
      <div className="statistics-panels">
        <Group
          id="files"
          title="Files"
          items={files}
          opens
          onOpen={openRules}
          note={checkedLine(health.checked_at)}
          action={{
            label: "Check files",
            onClick: () => navigate("/clean", { state: cleanSectionState("health") }),
          }}
        />
        <Group
          id="beatport"
          title="Beatport"
          items={beatport}
          opens
          onOpen={openRules}
          action={{
            label: "Match",
            onClick: () => navigate("/clean", { state: cleanSectionState("review") }),
          }}
        />
        <Group
          id="waveforms"
          title="Waveforms"
          items={waveforms}
          opens={false}
          onOpen={openRules}
          action={{
            label: "Analyze",
            onClick: () => navigate("/settings", { state: settingsFocusState("waveforms") }),
          }}
        />
      </div>
      <Button
        variant="secondary"
        onClick={() => navigate("/clean", { state: cleanSectionState("health") })}
      >
        All health checks
      </Button>
    </>
  );
}
