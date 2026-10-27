/**
 * The Health tab of the Statistics page (STATS-07, K3): four cards, Files, Beatport, Other and
 * Analysis. Each with a stacked bar over its states, and rows for what needs doing: the label, where
 * it is dealt with ("Open in Clean ›") and the count on the right edge (D22). The page is read-only:
 * a line at the top says so and links to Clean, where the jobs are, the artwork read included (M220).
 *
 * Files carries missing, unreadable and not checked; Beatport the match states plus the tracks
 * with values not yet in their files; Other duplicates, matches Beatport changed after you
 * confirmed and tracks with no artwork; Analysis the waveforms and loudness. Every number is the
 * engine's; the Library opens on the engine's own rules where Clean has no place for a count
 * (not synced, no artwork). Failed analysis opens Settings, where waveforms are managed.
 *
 * Health lives here now, and Clean's Health tab is gone. Nothing here runs a job: the artwork read
 * moved to Clean's Missing files (M220), and Other's card says when it last ran and links there.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { FilterRuleSet, StatisticsHealth } from "../../api/cuepointBridge.types";
import { Card } from "../../components/Card";
import { LinkButton } from "../../components/LinkButton";
import { PixelIcon } from "../../components/PixelIcon";
import { formatCount } from "../../format/counts";
import { formatDayTimeInSentence } from "../../format/dates";
import { MATCH_STATE, goTo } from "../../format/words";
import { checkedLine } from "../clean/cleanEmpty";
import { cleanSectionState, openClean } from "../clean/cleanLink";
import type { CleanSection } from "../clean/cleanSections";
import { libraryRulesState } from "../library/libraryLink";
import { settingsFocusState } from "../settingsLink";
import { StackedBar, type BarPart, type BarTone } from "./StackedBar";

type Place =
  | { page: "Clean"; section: CleanSection }
  | { page: "Library"; rules: FilterRuleSet }
  | { page: "Settings" };

/**
 * One line of a card's list, which is also its legend: a swatch in the bar's colour (when the bar
 * has a part for it), the label, the count and, when the count can be dealt with, where.
 */
interface Row {
  id: string;
  label: string;
  count: number;
  /** The bar part this row is; a row the bar does not draw has none. */
  swatch?: BarTone;
  /** The count's colour while it is above zero and means work to do; otherwise plain. */
  todo?: "warning" | "danger";
  /** The one status dot a panel keeps (M208): the pixel `dot-filled` after the words of the row to check. */
  dot?: boolean;
  /** Where it is dealt with, or nothing to open. */
  place?: Place | null;
}

/** "Artwork last read today, 1:04 PM" (the words of "Checked today, …"), or the plain fact that it has not been. */
function artworkLine(checkedAt: string | null): string {
  if (!checkedAt) return "Artwork has not been read yet";
  return `Artwork last read ${formatDayTimeInSentence(checkedAt) || checkedAt}`;
}

interface CardProps {
  id: "files" | "beatport" | "other" | "analysis";
  title: string;
  /** At the heading's right: what the card says about itself. */
  note?: string;
  /** Draws the stacked bar over the list. A card without one holds the bar's room, so side-by-side cards share row lines (M209). */
  bar?: boolean;
  rows: readonly Row[];
  onOpen: (place: Place) => void;
  children?: ReactNode;
}

function HealthCard({ id, title, note, bar = false, rows, onOpen, children }: CardProps) {
  const parts: BarPart[] = rows.flatMap((row) =>
    row.swatch ? [{ id: row.id, label: row.label, count: row.count, tone: row.swatch }] : [],
  );
  return (
    <Card
      className="statistics-panel health-card"
      data-panel={id}
      aria-label={title}
      title={title}
      unit={note}
      bodyClassName="statistics-panel__body health-card__body"
    >
      {bar ? (
        <StackedBar title={title} parts={parts} legend={false} />
      ) : (
        <div className="health-card__bar-slot" aria-hidden="true" />
      )}
      <ul className="health-card__rows">
        {rows.map((row) => (
          <li key={row.id} className="health-card__row" data-row={row.id}>
            <span className="health-card__label">
              {row.label}
              {row.dot && row.count > 0 && (
                <PixelIcon name="dot-filled" size="sm" className="health-card__dot" />
              )}
            </span>
            {/* The link before the count, so the counts end on the card's right edge whether or not a row has one (M210). */}
            {row.place && row.count > 0 ? (
              <LinkButton
                go
                className="health-card__open"
                aria-label={`${goTo(row.place.page)}: ${row.label}`}
                onClick={() => onOpen(row.place!)}
              >
                {goTo(row.place.page)}
              </LinkButton>
            ) : (
              <span className="health-card__open" aria-hidden="true" />
            )}
            <span
              className={`health-card__count statistics-figure${
                row.todo && row.count > 0 ? ` health-card__count--${row.todo}` : ""
              }`}
            >
              {formatCount(row.count)}
            </span>
          </li>
        ))}
      </ul>
      {children}
    </Card>
  );
}

interface HealthSectionProps {
  health: StatisticsHealth;
}

export function HealthSection({ health }: HealthSectionProps) {
  const navigate = useNavigate();
  const open = (place: Place) => {
    if (place.page === "Clean") navigate("/clean", { state: cleanSectionState(place.section) });
    else if (place.page === "Library") navigate("/library", { state: libraryRulesState(place.rules) });
    else navigate("/settings", { state: settingsFocusState("waveforms") });
  };
  const clean = (section: CleanSection): Place => ({ page: "Clean", section });

  const { files, beatport, analyzed, other } = health;

  return (
    <div className="health-tab">
      {/* M220, M223: the page only reads; what fixes these is in Clean. */}
      <p className="statistics-note health-tab__lead">
        Read-only here. To fix these,{" "}
        <LinkButton go onClick={() => openClean(navigate)}>
          {goTo("Clean")}
        </LinkButton>
      </p>
      <div className="statistics-panels">
      <HealthCard
        id="files"
        title="Files"
        // The very words Clean's Missing files bar uses for the same check (C170).
        note={(health.checked_at && checkedLine(health.checked_at)) || "not checked yet"}
        bar
        onOpen={open}
        rows={[
          { id: "present", label: "Present", count: files.present.count, swatch: "success" },
          { id: "missing", label: "Missing", count: files.missing.count, swatch: "danger", todo: "danger", place: clean("missing") },
          { id: "unreadable", label: "Unreadable", count: files.unreadable.count, swatch: "warning", todo: "danger", place: clean("missing") },
          { id: "not_checked", label: "Not checked", count: files.not_checked.count, swatch: "muted" },
        ]}
      />
      <HealthCard
        id="other"
        title="Other"
        onOpen={open}
        rows={[
          { id: "duplicates", label: "Duplicates", count: other.duplicates.count, todo: "warning", place: clean("duplicates") },
          { id: "disputed", label: "Changed after you confirmed", count: other.disputed.count, todo: "warning", place: clean("review") },
          { id: "no_artwork", label: "No artwork", count: other.no_artwork.count, place: { page: "Library", rules: other.no_artwork.rules } },
        ]}
      >
        <div className="health-card__foot">
          <span className="statistics-note">{artworkLine(health.artwork_checked_at)}</span>
          <LinkButton go onClick={() => navigate("/clean", { state: cleanSectionState("missing") })}>
            Read artwork in Clean
          </LinkButton>
        </div>
      </HealthCard>
      <HealthCard
        id="beatport"
        title="Beatport"
        note={`${formatCount(beatport.accepted.count)} of ${formatCount(health.total)} confirmed`}
        bar
        onOpen={open}
        rows={[
          { id: "accepted", label: MATCH_STATE.confirmed, count: beatport.accepted.count, swatch: "success" },
          { id: "needs_review", label: MATCH_STATE.toCheck, count: beatport.needs_review.count, swatch: "warning", todo: "warning", dot: true, place: clean("review") },
          { id: "rejected", label: MATCH_STATE.rejected, count: beatport.rejected.count, swatch: "danger" },
          { id: "no_match", label: MATCH_STATE.noMatch, count: beatport.no_match.count, swatch: "neutral", place: clean("review") },
          { id: "not_matched", label: MATCH_STATE.notLookedUp, count: beatport.not_matched.count, swatch: "muted", place: clean("review") },
          { id: "not_synced", label: "Not synced", count: health.not_synced.count, place: { page: "Library", rules: health.not_synced.rules } },
        ]}
      />
      <HealthCard
        id="analysis"
        title="Analysis"
        note="waveforms and loudness"
        bar
        onOpen={open}
        rows={[
          { id: "analyzed", label: "Analyzed", count: analyzed.analyzed, swatch: "success" },
          { id: "waiting", label: "Waiting", count: analyzed.waiting, swatch: "neutral" },
          { id: "failed", label: "Failed", count: analyzed.failed, swatch: "danger", todo: "danger", place: { page: "Settings" } },
          { id: "no_file", label: "No file", count: analyzed.no_file, swatch: "muted" },
        ]}
      />
      </div>
    </div>
  );
}
