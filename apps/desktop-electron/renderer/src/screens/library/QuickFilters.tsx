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

import { useLayerStack } from "../../hooks/useLayerStack";
import { usePresence } from "../../tokens/usePresence";

import { Button } from "../../components/Button";
import { TrackContextMenu, useMenuButton, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { formatBpm } from "../../components/format/bpm";
import { Loading } from "../../components/Loading";
import { TextField } from "../../components/TextField";
import { keyLabel } from "../../components/wheel/camelot";
import { KeyChip } from "../../components/wheel/KeyChip";
import { camelotOf } from "../../components/wheel/keyColour";
import { useKeyNotation } from "../../components/wheel/keyNotationSetting";
import { formatCount } from "../../format/counts";
import { goTo } from "../../format/words";
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
  clearField,
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
  /** Open the Keys page on this view's playlist or Collection (PAGES-16). */
  onOpenKeys?: () => void;
  /** Open the match on Beatport, which is where keys come from: the Key list's way out of "no keys" (M114). */
  onMatch?: () => void;
  /**
   * The row has no room for three buttons (W1): one Filters menu names them, and the one chosen
   * opens under it as it would under its own button.
   */
  folded?: boolean;
  /** Folded, more entries for the same menu after the three (W1: the row's More menu at 3x). */
  extraItems?: TrackContextMenuItem[];
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

/** A button's name with how many choices its filter holds (M470): the count is said, not pressed. */
function namedWithCount(label: string, count: number): string | undefined {
  return count > 0 ? `${label}, ${formatCount(count)} chosen` : undefined;
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
  onOpenKeys,
  onMatch,
  folded = false,
  extraItems = [],
}: QuickFiltersProps) {
  const [open, setOpen] = useState<QuickKind | null>(null);
  const menu = useMenuButton();
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  /** The button that opened the list, so Escape can give focus back to it (M470). */
  const opener = useRef<HTMLElement | null>(null);
  // M469: one layer in the stack, so Escape closes a menu or dialog opened over the list first.
  const isTop = useLayerStack(open !== null);
  // M380: the list plays its exit, marked [data-leaving], before it goes; the kind it showed is kept.
  const presence = usePresence<HTMLDivElement>(open !== null);
  const [lastKind, setLastKind] = useState<QuickKind | null>(open);
  if (open !== null && open !== lastKind) setLastKind(open);

  // Closed by Escape, and by a click anywhere else, as a menu is.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      // isTop reads the stack when the key arrives.
      if (event.key !== "Escape" || !isTop()) return;
      setOpen(null);
      // The next Tab starts at the button, not at the top of the window.
      opener.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, isTop]);

  const toggle = (kind: QuickKind, from?: HTMLElement | null) => {
    if (from) opener.current = from;
    if (open === kind) {
      setOpen(null);
      return;
    }
    setOpen(kind);
    onOpen();
  };

  const leaving = presence.leaving;
  const panelFor = (kind: QuickKind) => (
              <div
                className="cp-quick__panel"
                role="dialog"
                aria-label={LABELS[kind]}
                id={leaving ? undefined : panelId}
                ref={presence.ref}
                data-leaving={leaving ? "" : undefined}
                inert={leaving || undefined}
              >
                {kind === "key" && (
                  <KeyList
                    filters={filters}
                    facets={facets}
                    loading={loading}
                    onFiltersChange={onFiltersChange}
                    onMatch={
                      onMatch
                        ? () => {
                            setOpen(null);
                            onMatch();
                          }
                        : undefined
                    }
                    onOpenKeys={
                      onOpenKeys
                        ? () => {
                            setOpen(null);
                            onOpenKeys();
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
  );

  if (folded) {
    const total = (Object.keys(LABELS) as QuickKind[]).reduce((sum, kind) => sum + quickCount(filters, FIELDS[kind]), 0);
    const box = menu.open ? menu.anchor.current?.getBoundingClientRect() : undefined;
    return (
      <div className="cp-quick" ref={root}>
        <div className="cp-quick__item">
          <Button variant="secondary" menu aria-label={namedWithCount("Filters", total)} {...menu.buttonProps}>
            Filters
            {total > 0 && <span className="cp-quick__count">{total}</span>}
          </Button>
          {menu.open && box && (
            <TrackContextMenu
              x={box.left}
              y={box.bottom}
              anchor={menu.anchor}
              onClose={menu.close}
              label="Filters"
              items={[
                ...(Object.keys(LABELS) as QuickKind[]).map((kind) => {
                  const count = quickCount(filters, FIELDS[kind]);
                  return {
                    id: kind,
                    label: count > 0 ? `${LABELS[kind]} (${count})` : LABELS[kind],
                    onSelect: () => toggle(kind),
                  };
                }),
                ...extraItems.map((item, index) => ({ ...item, separatorBefore: index === 0 })),
              ]}
            />
          )}
          {presence.present && (open ?? lastKind) !== null && panelFor((open ?? lastKind) as QuickKind)}
        </div>
      </div>
    );
  }

  return (
    <div className="cp-quick" ref={root}>
      {(Object.keys(LABELS) as QuickKind[]).map((kind) => {
        const count = quickCount(filters, FIELDS[kind]);
        const shown = open === kind;
        // The list stays a moment after it closes, to play its exit (M380).
        const drawn = shown || (open === null && presence.present && lastKind === kind);
        return (
          <div className="cp-quick__item" key={kind}>
            {/* M470: a menu button, not a toggle: it says it is open, and its name says the count. */}
            <Button
              variant="secondary"
              menu
              aria-haspopup="dialog"
              aria-label={namedWithCount(LABELS[kind], count)}
              aria-expanded={shown}
              aria-controls={shown ? panelId : undefined}
              onClick={(event) => toggle(kind, event.currentTarget)}
            >
              {LABELS[kind]}
              {count > 0 && <span className="cp-quick__count">{count}</span>}
            </Button>
            {drawn && panelFor(kind)}
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
      {count !== undefined && <span className="cp-quick__tally">{formatCount(count)}</span>}
    </label>
  );
}

/**
 * A Key list with no keys in it. DEC-201: a track's key is its Beatport match's,
 * so a library nobody has matched has none, and the list says why. A view that
 * has none inside a library that does is a different thing to say, and nothing
 * to match.
 */
function NoKeys({ onMatch }: { onMatch?: () => void }) {
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
      {onMatch && (
        <Button variant="secondary" onClick={onMatch}>
          Match on Beatport…
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
  onOpenKeys,
  onMatch,
}: ListProps & { onOpenKeys?: () => void; onMatch?: () => void }) {
  // Keys written as (K1 to K3): the choice's words follow the setting; the filter's value is still the stored key.
  const notation = useKeyNotation();
  if (!facets) {
    return loading ? <Loading what="keys" /> : <p className="cp-quick__note">Keys are not available.</p>;
  }
  if (facets.keys.length === 0) {
    return <NoKeys onMatch={onMatch} />;
  }
  const chosen = chosenValues(filters, KEY_FIELD);
  const isChosen = (value: string) => chosen.some((item) => item.toLowerCase() === value.toLowerCase());
  // The keys of this view by their Camelot code; a key the code cannot name stays a plain row below.
  const byCode = new Map<string, { value: string; count: number }>();
  const others: { value: string; count: number }[] = [];
  for (const entry of facets.keys) {
    const code = camelotOf(entry.value);
    if (code && !byCode.has(code)) byCode.set(code, entry);
    else others.push(entry);
  }
  const grid = ["A", "B"].flatMap((ring) =>
    Array.from({ length: 12 }, (_, index) => `${index + 1}${ring}`),
  );
  const anyChosen = chosen.length > 0 || asksForNone(filters, KEY_FIELD);
  return (
    <div className="cp-quick__list" role="group" aria-label="Keys in this view">
      {/* Twelve numbers by the two rings, as the wheel has them (M112); a key with no track here is
          there but cannot be ticked, so the grid keeps one shape. */}
      <div className="cp-quick__keys">
        {grid.map((code) => {
          const entry = byCode.get(code);
          const on = entry ? isChosen(entry.value) : false;
          return (
            <label
              key={code}
              className={`cp-quick__key${on ? " cp-quick__key--on" : ""}${entry ? "" : " cp-quick__key--none"}`}
              data-hint={entry ? `${formatCount(entry.count)} ${entry.count === 1 ? "track" : "tracks"}` : "No track here"}
            >
              <input
                type="checkbox"
                className="cp-visually-hidden"
                aria-label={keyLabel(code, notation)}
                checked={on}
                disabled={!entry}
                onChange={() => entry && onFiltersChange(toggleValue(filters, KEY_FIELD, entry.value))}
              />
              <KeyChip value={code} />
            </label>
          );
        })}
      </div>
      {others.map((entry) => (
        <Choice
          key={entry.value}
          label={keyLabel(entry.value, notation)}
          count={entry.count}
          checked={isChosen(entry.value)}
          onChange={() => onFiltersChange(toggleValue(filters, KEY_FIELD, entry.value))}
        />
      ))}
      {(facets.no_key > 0 || asksForNone(filters, KEY_FIELD)) && (
        <Choice
          label={`No Beatport key: ${formatCount(facets.no_key)}`}
          checked={asksForNone(filters, KEY_FIELD)}
          onChange={() => onFiltersChange(toggleNone(filters, KEY_FIELD))}
        />
      )}
      <div className="cp-quick__keys-end">
        {onOpenKeys && (
          <button type="button" className="cp-link cp-link--go cp-quick__keys-link" onClick={onOpenKeys}>
            {goTo("Keys")}
          </button>
        )}
        {anyChosen && (
          <Button variant="quiet" onClick={() => onFiltersChange(clearField(filters, KEY_FIELD))}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function GenreList({ filters, facets, loading, onFiltersChange }: ListProps) {
  if (!facets) {
    return loading ? <Loading what="genres" /> : <p className="cp-quick__note">Genres are not available.</p>;
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
          The {facets.genres.length} most common of {formatCount(facets.genres_total)}. Add
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
      {facets === null && loading ? (
        <Loading what="tempos" />
      ) : (
        <p className="cp-quick__note">
          {facets === null
            ? "Tempos are not available."
            : low === null || high === null
              ? "No track here has a BPM."
              : `This view runs from ${formatBpm(low)} to ${formatBpm(high)} BPM.`}
        </p>
      )}
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
        <Button variant="primary" type="submit" disabled={invalid || (parsedFrom === null && parsedTo === null)}>
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
