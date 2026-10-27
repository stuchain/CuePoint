/**
 * The charts of the Library tab (STATS-06): BPM, Year and Loudness, and behind "More charts"
 * Date added and Rating. Each is a PixelBars chart of what the engine counted, with a line for
 * the tracks it cannot place ("41 tracks have no tempo"). Genre is a list now (`LibrarySection`),
 * and Keys is drawn by `KeySummary`.
 *
 * Rating is a named bucket chart (horizontal); the rest are ordered ones (vertical). A bar whose
 * bucket has rules opens the Library on them (the engine has already put the scope's own rules
 * in); a bucket without rules, and every loudness bar, is drawn and opens nothing. A line that
 * has rules gets a visible **Open in Library** link.
 * Tempo, Year and Loudness are numeric axes, so the integers the engine did not send are drawn as
 * empty bins and a long empty stretch as one ⋯ break (`fillBins`). Every number is the engine's.
 */
import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsLine,
  StatisticsSpread,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { LinkButton } from "../../components/LinkButton";
import { countNoun } from "../../format/counts";
import { goTo } from "../../format/words";
import { formatBpmText, formatLufs } from "../../format/units";
import { PixelBars } from "../../components/charts/PixelBars";
import { trueMinus } from "../../components/charts/trueMinus";
import { libraryRulesState } from "../library/libraryLink";
import { FIT_BINS, fillBins, groupTempo } from "./spreadBins";

interface Item {
  /** The axis label. */
  label: string;
  /** The bar's accessible name, e.g. "124 BPM, 312 tracks". */
  name: string;
  count: number;
  rules: FilterRuleSet | null;
  /** A ⋯ break in a numeric axis, not a bucket. */
  gap: boolean;
}

export type ChartId = "tempo" | "year" | "date_added" | "rating" | "loudness";

interface Panel {
  id: ChartId;
  title: string;
  orientation: "horizontal" | "vertical";
  bucketLabel: string;
  /** The axis label for a bucket, when it is not the engine's label. */
  axis?: (value: string | number | null) => string;
  /** A numeric axis: names a bin the engine did not send, so the holes are filled. */
  fill?: (n: number) => string;
  /** Pairs a long run of one-number bins so a fitted chart stays readable. */
  group?: boolean;
  /** The line for the tracks it cannot place. */
  unknown: (n: number) => string;
  noFile?: (n: number) => string;
  opens: boolean;
  unit?: string;
}

const tracksOf = (n: number): string => countNoun(n, "track");
const has = (n: number) => (n === 1 ? "has" : "have");
const is = (n: number) => (n === 1 ? "is" : "are");

const PANELS: Panel[] = [
  {
    id: "tempo",
    title: "BPM",
    orientation: "vertical",
    bucketLabel: "Tempo (BPM)",
    axis: (value) => String(value),
    fill: (n) => formatBpmText(n),
    group: true,
    unknown: (n) => `${tracksOf(n)} ${has(n)} no BPM`,
    opens: true,
    unit: "tracks",
  },
  {
    id: "year",
    title: "Year",
    orientation: "vertical",
    bucketLabel: "Year",
    fill: String,
    unknown: (n) => `${tracksOf(n)} ${has(n)} no year`,
    opens: true,
    unit: "tracks",
  },
  {
    id: "date_added",
    title: "Date added",
    orientation: "vertical",
    bucketLabel: "Month",
    unknown: (n) => `${tracksOf(n)} ${has(n)} an unknown date added`,
    opens: true,
    unit: "tracks",
  },
  {
    id: "rating",
    title: "Rating",
    orientation: "horizontal",
    bucketLabel: "Rating",
    unknown: (n) => `${tracksOf(n)} ${is(n)} unrated`,
    opens: true,
    unit: "tracks",
  },
  {
    id: "loudness",
    title: "Loudness",
    orientation: "vertical",
    bucketLabel: "Loudness (LUFS)",
    axis: (value) => trueMinus(String(value)),
    fill: (n) => formatLufs(n),
    unknown: (n) => `${tracksOf(n)} ${is(n)} not measured yet`,
    noFile: (n) => `${tracksOf(n)} ${has(n)} no file to measure`,
    opens: false,
    unit: "LUFS",
  },
];

function itemsOf(panel: Panel, spread: StatisticsSpread): Item[] {
  const filled = panel.fill ? fillBins(spread.buckets, 1, panel.fill) : spread.buckets;
  const buckets =
    panel.group && filled.filter((bucket) => !("gap" in bucket && bucket.gap === true)).length > FIT_BINS
      ? groupTempo(filled)
      : filled;
  return buckets.map((bucket) => {
    const gap = "gap" in bucket && bucket.gap === true;
    return {
      label: trueMinus(panel.axis && !gap ? panel.axis(bucket.value) : bucket.label),
      name: `${trueMinus(bucket.label)}, ${tracksOf(bucket.count)}`,
      count: bucket.count,
      rules: bucket.rules,
      gap,
    };
  });
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
        <LinkButton
          go
          aria-label={`${goTo("Library")}: ${line.label}`}
          onClick={() => onOpen(rules)}
        >
          {goTo("Library")}
        </LinkButton>
      )}
    </p>
  );
}

interface SpreadsSectionProps {
  spreads: StatisticsSpreads;
  /** Which charts to draw, in this order. */
  charts: readonly ChartId[];
  /** Inside the last chart's card, at its bottom right (a link such as "More charts"). */
  footer?: ReactNode;
  /** Draw no card for a chart with nothing to chart (the Overview, M222); the default says so in the card. */
  hideEmpty?: boolean;
  /** Charts that take the whole row (Loudness, D22). */
  wide?: readonly ChartId[];
}

export function SpreadsSection({ spreads, charts, footer, hideEmpty = false, wide = [] }: SpreadsSectionProps) {
  const navigate = useNavigate();
  const openRules = (rules: FilterRuleSet) =>
    navigate("/library", { state: libraryRulesState(rules) });
  const itemsById = useMemo(
    () => Object.fromEntries(PANELS.map((panel) => [panel.id, itemsOf(panel, spreads[panel.id])])),
    [spreads],
  );

  return (
    <>
      {charts.map((id) => PANELS.find((panel) => panel.id === id)!).map((panel, at) => {
        const spread = spreads[panel.id];
        const items = itemsById[panel.id]!;
        if (hideEmpty && items.length === 0) return null;
        return (
          <Card
            key={panel.id}
            className={`statistics-panel${wide.includes(panel.id) ? " statistics-panel--wide" : ""}`}
            data-panel={panel.id}
            title={panel.title}
            unit={panel.unit}
            bodyClassName="statistics-panel__body"
          >
            {items.length > 0 ? (
              <PixelBars<Item>
                title={panel.title}
                buckets={items}
                orientation={panel.orientation}
                barName={(item) => item.name}
                onSelect={panel.opens ? (item) => item.rules && openRules(item.rules) : undefined}
                isSelectable={(item) => item.rules !== null}
                isGap={(item) => item.gap}
                bucketLabel={panel.bucketLabel}
                fit="width"
              />
            ) : (
              <EmptyState compact headline="Nothing here to chart" />
            )}
            <Line
              text={panel.unknown(spread.unknown.count)}
              line={spread.unknown}
              onOpen={panel.opens ? openRules : undefined}
            />
            {spread.no_file && panel.noFile && (
              <Line text={panel.noFile(spread.no_file.count)} line={spread.no_file} />
            )}
            {footer && at === charts.length - 1 && footer}
          </Card>
        );
      })}
    </>
  );
}
