/**
 * The Health tab of the Statistics page (STATS-07, K3): four cards, Files, Beatport, Other and
 * Analysis. Each with a stacked bar over its states, and rows for what needs doing: a tinted
 * count chip and where it is dealt with ("Open in Clean ›").
 *
 * Files carries missing, unreadable and not checked; Beatport the match states plus the tracks
 * with values not yet in their files; Other duplicates, matches Beatport changed after you
 * decided and tracks with no cover art; Analysis the waveforms and loudness. Every number is the
 * engine's; the Library opens on the engine's own rules where Clean has no place for a count
 * (not synced, no cover art). Failed analysis opens Settings, where waveforms are managed.
 *
 * Health lives here now, and Clean's Health tab is gone. The cover-art read is run by the page
 * (`useCleanJob` in StatisticsScreen), not here, so it outlives this tab when a scope change
 * or a failed re-read swaps it for a spinner; this tab only shows its state.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { FilterRuleSet, StatisticsHealth } from "../../api/cuepointBridge.types";
import { Badge, type BadgeVariant } from "../../components/Badge";
import { Button } from "../../components/Button";
import { LinkButton } from "../../components/LinkButton";
import { formatCount } from "../../format/counts";
import { formatDayTime } from "../../format/dates";
import { cleanSectionState } from "../clean/cleanLink";
import type { CleanSection } from "../clean/cleanSections";
import { libraryRulesState } from "../library/libraryLink";
import { settingsFocusState } from "../settingsLink";
import { StackedBar, type BarPart } from "./StackedBar";

type Place =
  | { page: "Clean"; section: CleanSection }
  | { page: "Library"; rules: FilterRuleSet }
  | { page: "Settings" };

interface Row {
  id: string;
  label: string;
  count: number;
  /** The chip's tone while the count is above zero; a zero is always plain. */
  tone: BadgeVariant;
  /** Where it is dealt with, or nothing to open. */
  place: Place | null;
}

/** When an instant was, with the time on the computer's clock; the text itself if it is not a date. */
function dayWords(iso: string): string {
  return formatDayTime(iso) || iso;
}

/** "Cover art last read September 3, 2026", or the plain fact that it has not been. */
function artworkLine(checkedAt: string | null): string {
  if (!checkedAt) return "Cover art has not been read yet";
  return `Cover art last read ${dayWords(checkedAt)}`;
}

interface CardProps {
  id: "files" | "beatport" | "other" | "analysis";
  title: string;
  /** At the heading's right: what the card says about itself. */
  note?: string;
  parts?: readonly BarPart[];
  rows: readonly Row[];
  onOpen: (place: Place) => void;
  children?: ReactNode;
}

function Card({ id, title, note, parts, rows, onOpen, children }: CardProps) {
  return (
    <section className="statistics-panel health-card" data-panel={id} aria-label={title}>
      <div className="rank__head">
        <h3 className="statistics-panel__title">{title}</h3>
        {note && <span className="rank__unit">{note}</span>}
      </div>
      {parts && <StackedBar title={title} parts={parts} />}
      <ul className="health-card__rows">
        {rows.map((row) => (
          <li key={row.id} className="health-card__row" data-row={row.id}>
            <span className="health-card__label">{row.label}</span>
            <Badge tone={row.count > 0 ? row.tone : "neutral"} className="health-card__count">
              {formatCount(row.count)}
            </Badge>
            {row.place !== null && row.count > 0 && (
              <LinkButton
                go
                className="health-card__open"
                aria-label={`Open in ${row.place.page}: ${row.label}`}
                onClick={() => onOpen(row.place!)}
              >
                {`Open in ${row.place.page}`}
              </LinkButton>
            )}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

interface HealthSectionProps {
  health: StatisticsHealth;
  /** True while the page's cover-art read is running. */
  coverArtRunning: boolean;
  /** Starts the cover-art read (the page owns it, so it survives this tab unmounting). */
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

  const fileParts: BarPart[] = [
    { id: "present", label: "Present", count: files.present.count, tone: "success" },
    { id: "missing", label: "Missing", count: files.missing.count, tone: "danger" },
    { id: "unreadable", label: "Unreadable", count: files.unreadable.count, tone: "warning" },
    { id: "not_checked", label: "Not checked", count: files.not_checked.count, tone: "muted" },
  ];
  const beatportParts: BarPart[] = [
    { id: "accepted", label: "Confirmed", count: beatport.accepted.count, tone: "success" },
    { id: "needs_review", label: "To review", count: beatport.needs_review.count, tone: "warning" },
    { id: "rejected", label: "Rejected", count: beatport.rejected.count, tone: "danger" },
    { id: "no_match", label: "No match", count: beatport.no_match.count, tone: "neutral" },
    { id: "not_matched", label: "Not matched", count: beatport.not_matched.count, tone: "muted" },
  ];
  const analysisParts: BarPart[] = [
    { id: "analyzed", label: "Analyzed", count: analyzed.analyzed, tone: "success" },
    { id: "waiting", label: "Waiting", count: analyzed.waiting, tone: "neutral" },
    { id: "failed", label: "Failed", count: analyzed.failed, tone: "danger" },
    { id: "no_file", label: "No file", count: analyzed.no_file, tone: "muted" },
  ];

  return (
    <div className="health-tab">
      <div className="health-tab__column">
        <Card
          id="files"
          title="Files"
          note={health.checked_at ? `checked ${dayWords(health.checked_at)}` : "not checked yet"}
          parts={fileParts}
          onOpen={open}
          rows={[
            { id: "missing", label: "Missing", count: files.missing.count, tone: "danger", place: clean("missing") },
            { id: "unreadable", label: "Unreadable", count: files.unreadable.count, tone: "danger", place: clean("missing") },
            { id: "not_checked", label: "Not checked yet", count: files.not_checked.count, tone: "neutral", place: null },
          ]}
        />
        <Card
          id="other"
          title="Other"
          onOpen={open}
          rows={[
            { id: "duplicates", label: "Duplicates", count: other.duplicates.count, tone: "warning", place: clean("duplicates") },
            { id: "disputed", label: "Changed since you decided", count: other.disputed.count, tone: "warning", place: clean("review") },
            { id: "no_artwork", label: "No cover art", count: other.no_artwork.count, tone: "neutral", place: { page: "Library", rules: other.no_artwork.rules } },
          ]}
        >
          <div className="health-card__foot">
            <Button
              variant="secondary"
              onClick={onReadCoverArt}
              disabled={coverArtRunning}
              loading={coverArtRunning}
            >
              Read cover art
            </Button>
            <span className="statistics-note">{artworkLine(health.artwork_checked_at)}</span>
          </div>
        </Card>
      </div>

      <div className="health-tab__column">
        <Card
          id="beatport"
          title="Beatport"
          note={`${formatCount(beatport.accepted.count)} of ${formatCount(health.total)} matched`}
          parts={beatportParts}
          onOpen={open}
          rows={[
            { id: "needs_review", label: "To review", count: beatport.needs_review.count, tone: "warning", place: clean("review") },
            { id: "not_matched", label: "Not matched yet", count: beatport.not_matched.count, tone: "neutral", place: clean("review") },
            { id: "no_match", label: "No match found", count: beatport.no_match.count, tone: "neutral", place: clean("review") },
            { id: "not_synced", label: "Not synced to files", count: health.not_synced.count, tone: "accent", place: { page: "Library", rules: health.not_synced.rules } },
          ]}
        />
        <Card
          id="analysis"
          title="Analysis"
          note="waveforms and loudness"
          parts={analysisParts}
          onOpen={open}
          rows={[
            { id: "waiting", label: "Waiting", count: analyzed.waiting, tone: "neutral", place: null },
            { id: "failed", label: "Failed", count: analyzed.failed, tone: "danger", place: { page: "Settings" } },
          ]}
        />
      </div>
    </div>
  );
}
