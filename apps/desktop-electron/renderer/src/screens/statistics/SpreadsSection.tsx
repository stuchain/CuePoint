/**
 * The spreads of "Your library" (STATS-06): six panels, each a PixelBars chart of what the
 * engine counted, with a line for the tracks it cannot place ("41 tracks have no tempo").
 *
 * Genre and Rating are named buckets (horizontal); Tempo, Year, Date added and Loudness are
 * ordered ones (vertical). A bar whose bucket has rules opens the Library on them (the engine
 * has already put the scope's own rules in); a bucket without rules, and every loudness bar,
 * is drawn and opens nothing. A line that has rules gets a visible **Open in Library** button.
 * Every number is the engine's.
 */
import { useNavigate } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsLine,
  StatisticsSpread,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { tracksText } from "../../components/charts/formatCount";
import { PixelBars } from "../../components/charts/PixelBars";
import { libraryRulesState } from "../library/libraryLink";

interface Item {
  /** The axis label. */
  label: string;
  /** The bar's accessible name, e.g. "124 BPM, 312 tracks". */
  name: string;
  count: number;
  rules: FilterRuleSet | null;
}

interface Panel {
  id: "genre" | "tempo" | "year" | "date_added" | "rating" | "loudness";
  title: string;
  orientation: "horizontal" | "vertical";
  bucketLabel: string;
  /** The axis label for a bucket, when it is not the engine's label. */
  axis?: (value: string | number | null) => string;
  /** The line for the tracks it cannot place. */
  unknown: (n: number) => string;
  noFile?: (n: number) => string;
  opens: boolean;
  unit?: string;
}

const has = (n: number) => (n === 1 ? "has" : "have");
const is = (n: number) => (n === 1 ? "is" : "are");

const PANELS: Panel[] = [
  {
    id: "genre",
    title: "Genre",
    orientation: "horizontal",
    bucketLabel: "Genre",
    unknown: (n) => `${tracksText(n)} ${has(n)} no genre`,
    opens: true,
  },
  {
    id: "tempo",
    title: "Tempo",
    orientation: "vertical",
    bucketLabel: "Tempo (BPM)",
    axis: (value) => String(value),
    unknown: (n) => `${tracksText(n)} ${has(n)} no tempo`,
    opens: true,
    unit: "BPM",
  },
  {
    id: "year",
    title: "Year",
    orientation: "vertical",
    bucketLabel: "Year",
    unknown: (n) => `${tracksText(n)} ${has(n)} no year`,
    opens: true,
  },
  {
    id: "date_added",
    title: "Date added",
    orientation: "vertical",
    bucketLabel: "Month",
    unknown: (n) => `${tracksText(n)} ${has(n)} an unknown date added`,
    opens: true,
  },
  {
    id: "rating",
    title: "Rating",
    orientation: "horizontal",
    bucketLabel: "Rating",
    unknown: (n) => `${tracksText(n)} ${is(n)} unrated`,
    opens: true,
  },
  {
    id: "loudness",
    title: "Loudness",
    orientation: "vertical",
    bucketLabel: "Loudness (LUFS)",
    axis: (value) => String(value),
    unknown: (n) => `${tracksText(n)} ${is(n)} not measured yet`,
    noFile: (n) => `${tracksText(n)} ${has(n)} no file to measure`,
    opens: false,
    unit: "LUFS",
  },
];

function itemsOf(panel: Panel, spread: StatisticsSpread): Item[] {
  return spread.buckets.map((bucket) => ({
    label: panel.axis ? panel.axis(bucket.value) : bucket.label,
    name: `${bucket.label}, ${tracksText(bucket.count)}`,
    count: bucket.count,
    rules: bucket.rules,
  }));
}

interface LineProps {
  text: string;
  line: StatisticsLine;
  onOpen?: (rules: FilterRuleSet) => void;
}

/** What a panel cannot place, with a button to open it when a rule can say it. */
function Line({ text, line, onOpen }: LineProps) {
  if (line.count <= 0) return null;
  const rules = line.rules;
  return (
    <p className="statistics-note statistics-panel__line">
      {text}
      {onOpen && rules && (
        <Button
          variant="secondary"
          aria-label={`Open in Library: ${line.label}`}
          onClick={() => onOpen(rules)}
        >
          Open in Library
        </Button>
      )}
    </p>
  );
}

export function SpreadsSection({ spreads }: { spreads: StatisticsSpreads }) {
  const navigate = useNavigate();
  const openRules = (rules: FilterRuleSet) =>
    navigate("/library", { state: libraryRulesState(rules) });

  return (
    <>
      {PANELS.map((panel) => {
        const spread = spreads[panel.id];
        const items = itemsOf(panel, spread);
        return (
          <div
            key={panel.id}
            className="statistics-panel"
            data-panel={panel.id}
          >
            <h3 className="statistics-panel__title">
              {panel.title}
              {panel.unit && <span className="statistics-panel__unit"> ({panel.unit})</span>}
            </h3>
            {items.length > 0 ? (
              <PixelBars<Item>
                title={panel.title}
                buckets={items}
                orientation={panel.orientation}
                barName={(item) => item.name}
                onSelect={panel.opens ? (item) => item.rules && openRules(item.rules) : undefined}
                isSelectable={(item) => item.rules !== null}
                bucketLabel={panel.bucketLabel}
              />
            ) : (
              <p className="statistics-note">Nothing here to chart.</p>
            )}
            <Line
              text={panel.unknown(spread.unknown.count)}
              line={spread.unknown}
              onOpen={panel.opens ? openRules : undefined}
            />
            {spread.no_file && panel.noFile && (
              <Line text={panel.noFile(spread.no_file.count)} line={spread.no_file} />
            )}
          </div>
        );
      })}
    </>
  );
}
