/**
 * Key ▾, BPM ▾ and Genre ▾ above the Library's table (FLW-4).
 *
 * Three dropdowns that answer for the view in front of the user — a playlist,
 * a Collection, everything — with the engine's counts. A choice becomes an
 * ordinary rule chip (`quickFilters.ts`), so there is one filter, not a second
 * one beside it; Add filter stays for everything else. The wheel keeps its own
 * job: what mixes with the selected track, across the whole library.
 *
 * The lists are the engine's (`POST /api/v1/library/facets`), asked for when a
 * dropdown opens: they are a pass over the view, and nobody looked at them
 * until then.
 */
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { reportUnexpected } from "../../reporting/reporting";
import type { FilterRuleSet, LibraryQuickFacets } from "../../api/cuepointBridge.types";
import {
  BPM_FIELD,
  GENRE_FIELD,
  KEY_FIELD,
  applyRange,
  asksForNone,
  chosenRange,
  chosenValues,
  quickCount,
  toggleNone,
  toggleValue,
} from "./quickFilterRules";
import { libraryHasNoKeys } from "./libraryKeys";
import "./QuickFilters.css";

type QuickKind = "key" | "bpm" | "genre";

interface QuickFiltersProps {
  filters: FilterRuleSet | null;
  onFiltersChange: (filters: FilterRuleSet | null) => void;
  /** The view's answer, or null before the first one. */
  facets: LibraryQuickFacets | null;
  loading?: boolean;
  /** Ask the engine for the view's answer; called whenever a dropdown opens. */
  onOpen: () => void;
  /** Open matching, for the Key list of a library nobody has matched. */
  onMatchTracks?: () => void;
}

const LABELS: Record<QuickKind, string> = { key: "Key", bpm: "BPM", genre: "Genre" };
const FIELDS: Record<QuickKind, string> = {
  key: KEY_FIELD,
  bpm: BPM_FIELD,
  genre: GENRE_FIELD,
};

function numberText(value: number | null): string {
  return value === null ? "" : String(value);
}

function parse(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function QuickFilters({
  filters,
  onFiltersChange,
  facets,
  loading = false,
  onOpen,
  onMatchTracks,
}: QuickFiltersProps) {
  const [open, setOpen] = useState<QuickKind | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Closed by Escape, and by a click anywhere else, as a menu is.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (kind: QuickKind) => {
    if (open === kind) {
      setOpen(null);
      return;
    }
    setOpen(kind);
    onOpen();
  };

  return (
    <div className="cp-quick" ref={root}>
      {(Object.keys(LABELS) as QuickKind[]).map((kind) => {
        const count = quickCount(filters, FIELDS[kind]);
        const shown = open === kind;
        return (
          <div className="cp-quick__item" key={kind}>
            <button
              type="button"
              className={`cp-quick__button${count > 0 ? " cp-quick__button--on" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={shown}
              aria-controls={shown ? panelId : undefined}
              onClick={() => toggle(kind)}
            >
              {LABELS[kind]}
              {count > 0 && <span className="cp-quick__count">{count}</span>}
              <span> ▾</span>
            </button>
            {shown && (
              <div className="cp-quick__panel" role="dialog" aria-label={LABELS[kind]} id={panelId}>
                {kind === "key" && (
                  <KeyList
                    filters={filters}
                    facets={facets}
                    loading={loading}
                    onFiltersChange={onFiltersChange}
                    onMatchTracks={
                      onMatchTracks
                        ? () => {
                            setOpen(null);
                            onMatchTracks();
                          }
                        : undefined
                    }
                  />
                )}
                {kind === "bpm" && (
                  <BpmRange
                    filters={filters}
                    facets={facets}
                    loading={loading}
                    onFiltersChange={onFiltersChange}
                    onDone={() => setOpen(null)}
                  />
                )}
                {kind === "genre" && (
                  <GenreList
                    filters={filters}
                    facets={facets}
                    loading={loading}
                    onFiltersChange={onFiltersChange}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ListProps {
  filters: FilterRuleSet | null;
  facets: LibraryQuickFacets | null;
  loading: boolean;
  onFiltersChange: (filters: FilterRuleSet | null) => void;
}

function Choice({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="cp-quick__choice">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="cp-quick__name">{label}</span>
      {count !== undefined && <span className="cp-quick__tally">{count.toLocaleString()}</span>}
    </label>
  );
}

/**
 * A Key list with no keys in it. DEC-201: a track's key is its Beatport match's,
 * so a library nobody has matched has none, and the list says why. A view that
 * has none inside a library that does is a different thing to say, and nothing
 * to match.
 */
function NoKeys({ onMatchTracks }: { onMatchTracks?: () => void }) {
  const [none, setNone] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    libraryHasNoKeys()
      .then((answer) => {
        if (!cancelled) setNone(answer);
      })
      .catch((error: unknown) => {
        reportUnexpected(error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (none !== true) {
    return (
      <div className="cp-quick__empty">
        <p className="cp-quick__note">No track here has a Beatport key.</p>
      </div>
    );
  }
  return (
    <div className="cp-quick__empty">
      <p className="cp-quick__note">No tracks have a Beatport key yet. Keys come from matching.</p>
      {onMatchTracks && (
        <Button variant="primary" onClick={onMatchTracks}>
          Match tracks…
        </Button>
      )}
    </div>
  );
}

function KeyList({
  filters,
  facets,
  loading,
  onFiltersChange,
  onMatchTracks,
}: ListProps & { onMatchTracks?: () => void }) {
  if (!facets) {
    return <p className="cp-quick__note">{loading ? "Reading the keys…" : "Keys are not available."}</p>;
  }
  if (facets.keys.length === 0) {
    return <NoKeys onMatchTracks={onMatchTracks} />;
  }
  const chosen = chosenValues(filters, KEY_FIELD);
  return (
    <div className="cp-quick__list" role="group" aria-label="Keys in this view">
      {facets.keys.map((entry) => (
        <Choice
          key={entry.value}
          label={entry.value}
          count={entry.count}
          checked={chosen.some((value) => value.toLowerCase() === entry.value.toLowerCase())}
          onChange={() => onFiltersChange(toggleValue(filters, KEY_FIELD, entry.value))}
        />
      ))}
      {(facets.no_key > 0 || asksForNone(filters, KEY_FIELD)) && (
        <Choice
          label={`No Beatport key: ${facets.no_key.toLocaleString()}`}
          checked={asksForNone(filters, KEY_FIELD)}
          onChange={() => onFiltersChange(toggleNone(filters, KEY_FIELD))}
        />
      )}
    </div>
  );
}

function GenreList({ filters, facets, loading, onFiltersChange }: ListProps) {
  if (!facets) {
    return <p className="cp-quick__note">{loading ? "Reading the genres…" : "Genres are not available."}</p>;
  }
  if (facets.genres.length === 0) {
    return <p className="cp-quick__note">No track here has a genre.</p>;
  }
  const chosen = chosenValues(filters, GENRE_FIELD);
  return (
    <div className="cp-quick__list" role="group" aria-label="Genres in this view">
      {facets.genres.map((entry) => (
        <Choice
          key={entry.value}
          label={entry.value}
          count={entry.count}
          checked={chosen.some((value) => value.toLowerCase() === entry.value.toLowerCase())}
          onChange={() => onFiltersChange(toggleValue(filters, GENRE_FIELD, entry.value))}
        />
      ))}
      {facets.genres_truncated && (
        <p className="cp-quick__note">
          The {facets.genres.length} most common of {facets.genres_total.toLocaleString()}. Add
          filter reaches the rest.
        </p>
      )}
    </div>
  );
}

function BpmRange({
  filters,
  facets,
  loading,
  onFiltersChange,
  onDone,
}: ListProps & { onDone: () => void }) {
  const current = chosenRange(filters, BPM_FIELD);
  const [from, setFrom] = useState(numberText(current.from));
  const [to, setTo] = useState(numberText(current.to));
  const low = facets?.bpm.min ?? null;
  const high = facets?.bpm.max ?? null;
  const parsedFrom = parse(from);
  const parsedTo = parse(to);
  // A box with something in it that is not a number is not a blank one.
  const invalid = (from.trim() !== "" && parsedFrom === null) || (to.trim() !== "" && parsedTo === null);

  const apply = () => {
    onFiltersChange(applyRange(filters, BPM_FIELD, parsedFrom, parsedTo));
    onDone();
  };

  return (
    <form
      className="cp-quick__range"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) apply();
      }}
    >
      <p className="cp-quick__note">
        {facets === null
          ? loading
            ? "Reading the tempos…"
            : "Tempos are not available."
          : low === null || high === null
            ? "No track here has a BPM."
            : `This view runs from ${low} to ${high} BPM.`}
      </p>
      <div className="cp-quick__ends">
        <TextField
          label="From"
          inputMode="decimal"
          value={from}
          placeholder={low === null ? "" : String(low)}
          onChange={(event) => setFrom(event.target.value)}
        />
        <TextField
          label="To"
          inputMode="decimal"
          value={to}
          placeholder={high === null ? "" : String(high)}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>
      {invalid && (
        <p className="cp-quick__note" role="alert">
          BPM takes numbers.
        </p>
      )}
      <div className="cp-quick__actions">
        <Button type="submit" disabled={invalid || (parsedFrom === null && parsedTo === null)}>
          Apply
        </Button>
        {(current.from !== null || current.to !== null) && (
          <Button
            variant="secondary"
            onClick={() => {
              onFiltersChange(applyRange(filters, BPM_FIELD, null, null));
              onDone();
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}
