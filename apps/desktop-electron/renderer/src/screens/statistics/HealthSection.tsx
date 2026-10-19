/**
 * The Health tab of the Statistics page (STATS-07, K3): four cards, Files, Beatport, Other and
 * Analysis. Each with a stacked bar over its states, and rows for what needs doing: a tinted
 * count chip and where it is dealt with ("Open in Clean ›").
 *
 * Files carries missing, unreadable and not checked; Beatport the match states plus the tracks
 * with values not yet in their files; Other duplicates, matches Beatport changed after you
 * decided and tracks with no artwork; Analysis the waveforms and loudness. Every number is the
 * engine's; the Library opens on the engine's own rules where Clean has no place for a count
 * (not synced, no artwork). Failed analysis opens Settings, where waveforms are managed.
 *
 * Health lives here now, and Clean's Health tab is gone. The artwork read is run by the page
 * (`useCleanJob` in StatisticsScreen), not here, so it outlives this tab when a scope change
 * or a failed re-read swaps it for a spinner; this tab only shows its state.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { FilterRuleSet, StatisticsHealth } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LinkButton } from "../../components/LinkButton";
import { formatCount } from "../../format/counts";
import { formatDayTime } from "../../format/dates";
import { MATCH_STATE, goTo } from "../../format/words";
import { cleanSectionState } from "../clean/cleanLink";
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
  /** The bar part this row names; a row the bar does not draw has no swatch. */
  swatch?: BarTone;
  /** The count's colour while it is above zero and means work to do; otherwise plain. */
  todo?: "warning" | "danger";
  /** Where it is dealt with, or nothing to open. */
  place?: Place | null;
}

/** "Artwork last read Sep 3, 2026, 1:04 PM", or the plain fact that it has not been. */
function artworkLine(checkedAt: string | null): string {
  if (!checkedAt) return "Artwork has not been read yet";
  return `Artwork last read ${formatDayTime(checkedAt) || checkedAt}`;
}

interface CardProps {
  id: "files" | "beatport" | "other" | "analysis";
  title: string;
  /** At the heading's right: what the card says about itself. */
  note?: string;
  /** Draws the stacked bar over the list; the swatches of the rows are its legend. */
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
      {bar && <StackedBar title={title} parts={parts} legend={false} />}
      <ul className="health-card__rows">
        {rows.map((row) => (
          <li key={row.id} className="health-card__row" data-row={row.id}>
            <span
              className={`health-card__swatch${
                row.swatch && row.count > 0 ? ` stacked__part--${row.swatch}` : " health-card__swatch--none"
              }`}
              aria-hidden="true"
            />
            <span className="health-card__label">{row.label}</span>{" "}
            <span
              className={`health-card__count statistics-figure${
                row.todo && row.count > 0
                  ? ` health-card__count--${row.todo}`
                  : row.swatch === "success"
                    ? " health-card__count--ok"
                    : ""
              }`}
            >
              {formatCount(row.count)}
            </span>
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
          </li>
        ))}
      </ul>
      {children}
    </Card>
  );
}

interface HealthSectionProps {
  health: StatisticsHealth;
  /** True while the page's artwork read is running. */
  coverArtRunning: boolean;
  /** Starts the artwork read (the page owns it, so it survives this tab unmounting). */
  onReadCoverArt: () => void;
}

export function HealthSection({ health, coverArtRunning, onReadCoverArt }: HealthSectionProps) {
  const navigate = useNavigate();
  const open = (place: Place) => {
    if (place.page === "Clean") navigate("/clean", { state: cleanSectionState(place.section) });
    else if (place.page === "Library") navigate("/library", { state: libraryRulesState(place.rules) });
    else navigate("/settings", { state: settingsFocusState("waveforms") });
  };
  const clean = (section: CleanSection): Place => ({ page: "Clean", section });

  const { files, beatport, analyzed, other } = health;

  return (
    <div className="statistics-panels">
      <HealthCard
        id="files"
        title="Files"
        note={health.checked_at ? `checked ${formatDayTime(health.checked_at) || health.checked_at}` : "not checked yet"}
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
          { id: "disputed", label: "Changed since you decided", count: other.disputed.count, todo: "warning", place: clean("review") },
          { id: "no_artwork", label: "No artwork", count: other.no_artwork.count, place: { page: "Library", rules: other.no_artwork.rules } },
        ]}
      >
        <div className="health-card__foot">
          <span className="statistics-note">{artworkLine(health.artwork_checked_at)}</span>
          <Button
            variant="secondary"
            onClick={onReadCoverArt}
            disabled={coverArtRunning}
            loading={coverArtRunning}
          >
            Read artwork
          </Button>
        </div>
      </HealthCard>
      <HealthCard
        id="beatport"
        title="Beatport"
        note={`${formatCount(beatport.accepted.count)} of ${formatCount(health.total)} matched`}
        bar
        onOpen={open}
        rows={[
          { id: "accepted", label: MATCH_STATE.confirmed, count: beatport.accepted.count, swatch: "success" },
          { id: "needs_review", label: MATCH_STATE.toCheck, count: beatport.needs_review.count, swatch: "warning", todo: "warning", place: clean("review") },
          { id: "rejected", label: MATCH_STATE.rejected, count: beatport.rejected.count, swatch: "danger" },
          { id: "no_match", label: MATCH_STATE.noMatch, count: beatport.no_match.count, swatch: "neutral", place: clean("review") },
          { id: "not_matched", label: MATCH_STATE.notLookedUp, count: beatport.not_matched.count, swatch: "muted", place: clean("review") },
          { id: "not_synced", label: "Not synced to files", count: health.not_synced.count, place: { page: "Library", rules: health.not_synced.rules } },
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
  );
}
