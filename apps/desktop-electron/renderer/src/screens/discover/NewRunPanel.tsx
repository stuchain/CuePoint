/**
 * The New search tab's form (DISCOVER-10, DEC-091, FLW-15).
 *
 * What a search reads: charts in the chosen genres, curated by artists in the
 * library, and recent releases on the library's labels — every artist and
 * label, or only those picked from the Library's own facets, with how many
 * tracks each has. Every field starts from the engine's defaults (`options`),
 * and the form refuses what the engine would, from the bounds it sends. The
 * chart dates are two more fields a beginner does not need, so they fold under
 * "More options" with the default said in words (DSC-5).
 *
 * **Start looking** hands the search to the engine as a job: the status strip
 * shows it, and the page opens Results on it as soon as the engine begins it.
 */
import { useMemo, useState } from "react";

import type {
  DiscoverFacet,
  DiscoverOptions,
  DiscoverRefusal,
  DiscoverRunRequest,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { formatCount, pluralize } from "../library/libraryFormat";
import { ScopeDialog } from "./ScopeDialog";
import { refusalText } from "./discoverFormat";
import {
  chartsWindowText,
  defaultForm,
  formProblems,
  runRequest,
  type NewRunForm,
  type ScopeMode,
} from "./newRun";
import { reportUnexpected } from "../../reporting/reporting";

interface NewRunPanelProps {
  options: DiscoverOptions;
  /** False when Beatport cannot be asked; the reason says why. */
  usable: boolean;
  unusableReason: string | null;
  /** True while a start is being asked for, or a run is running. */
  busy: boolean;
  onStart: (request: DiscoverRunRequest) => Promise<DiscoverRefusal | null>;
}

function ScopeField({
  noun,
  facet,
  mode,
  picked,
  onMode,
  onPick,
}: {
  noun: string;
  facet: DiscoverFacet;
  mode: ScopeMode;
  picked: string[];
  onMode: (mode: ScopeMode) => void;
  onPick: () => void;
}) {
  const name = `discover-scope-mode-${noun}`;
  return (
    <fieldset className="discover-new__scope">
      <legend className="cp-field__label">{noun === "artist" ? "Artists" : "Labels"}</legend>
      <label className="discover-new__choice">
        <input type="radio" name={name} checked={mode === "all"} onChange={() => onMode("all")} />
        Every {noun} in your library ({formatCount(facet.total_values)})
      </label>
      <label className="discover-new__choice">
        <input
          type="radio"
          name={name}
          checked={mode === "picked"}
          onChange={() => onMode("picked")}
        />
        Only the {noun}s I choose
      </label>
      {mode === "picked" && (
        <div className="discover-new__picked">
          <span>
            {picked.length === 0
              ? `No ${noun}s chosen yet.`
              : `${pluralize(picked.length, noun)}: ${picked.slice(0, 5).join(", ")}${
                  picked.length > 5 ? `, and ${formatCount(picked.length - 5)} more` : ""
                }`}
          </span>
          <Button variant="secondary" onClick={onPick}>
            Choose {noun}s…
          </Button>
        </div>
      )}
      <label className="discover-new__choice">
        <input type="radio" name={name} checked={mode === "none"} onChange={() => onMode("none")} />
        No {noun}s
      </label>
    </fieldset>
  );
}

export function NewRunPanel({
  options,
  usable,
  unusableReason,
  busy,
  onStart,
}: NewRunPanelProps) {
  const [form, setForm] = useState<NewRunForm>(() => defaultForm(options.defaults));
  const [genreFilter, setGenreFilter] = useState("");
  const [choosing, setChoosing] = useState<"artist" | "label" | null>(null);
  const [starting, setStarting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const problems = useMemo(() => formProblems(form, options.limits), [form, options.limits]);
  const change = (patch: Partial<NewRunForm>) => {
    setRefusal(null);
    setForm((previous) => ({ ...previous, ...patch }));
  };

  const needle = genreFilter.trim().toLocaleLowerCase();
  const genres = needle
    ? options.genres.filter((genre) => genre.name.toLocaleLowerCase().includes(needle))
    : options.genres;
  const chosenGenres = new Set(form.genreIds);
  const flipGenre = (id: number) =>
    change({
      genreIds: chosenGenres.has(id)
        ? form.genreIds.filter((other) => other !== id)
        : [...form.genreIds, id],
    });

  const emptyLibrary =
    options.artists.total_values === 0 && options.labels.total_values === 0;

  const start = async () => {
    setStarting(true);
    setRefusal(null);
    try {
      const refused = await onStart(runRequest(form));
      if (refused) setRefusal(refusalText(refused));
    } catch (cause) {
      reportUnexpected(cause);
      setRefusal(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="discover-new" aria-label="New search">
      <header className="discover-new__header">
        <h2 className="discover-section__title">New search</h2>
        <p className="discover-note">
          Pick artists, labels or charts, then press Start looking.
        </p>
      </header>

      {emptyLibrary && (
        <p className="discover-note discover-note--warning">
          Your library has no artists or labels yet. Import a Rekordbox collection in the Library
          first: a search looks for music by them.
        </p>
      )}
      {!options.index_current && (
        <p className="discover-note">
          CuePoint is still indexing your artists and labels, so the lists below may be short.
        </p>
      )}

      <div className="discover-new__grid">
        <fieldset className="discover-new__genres">
          <legend className="cp-field__label">
            Genres for DJ charts ({formatCount(form.genreIds.length)} chosen)
          </legend>
          <p className="discover-note">
            On Beatport, artists publish charts — short lists of tracks they play. CuePoint reads
            the charts made by artists in your library, in the genres you tick.
          </p>
          {options.genres.length === 0 ? (
            <p className="discover-note">
              Beatport's genres could not be read, so no charts can be chosen now.
            </p>
          ) : (
            <>
              <TextField
                label="Find genres"
                id="discover-genre-filter"
                value={genreFilter}
                onChange={(event) => setGenreFilter(event.target.value)}
              />
              <ul className="discover-genres" aria-label="Genres">
                {genres.map((genre) => (
                  <li key={genre.id}>
                    <label className="discover-scope__row">
                      <input
                        type="checkbox"
                        checked={chosenGenres.has(genre.id)}
                        onChange={() => flipGenre(genre.id)}
                      />
                      <span className="discover-scope__name">{genre.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="discover-note">{chartsWindowText(form, options.defaults)}</p>
          <details className="discover-new__more">
            <summary>More options</summary>
            <div className="discover-new__dates">
              <TextField
                label="Charts from"
                id="discover-charts-from"
                type="date"
                value={form.chartsFrom}
                disabled={form.genreIds.length === 0}
                onChange={(event) => change({ chartsFrom: event.target.value })}
              />
              <TextField
                label="Charts to"
                id="discover-charts-to"
                type="date"
                value={form.chartsTo}
                disabled={form.genreIds.length === 0}
                onChange={(event) => change({ chartsTo: event.target.value })}
              />
            </div>
          </details>
        </fieldset>

        <div className="discover-new__column">
          <TextField
            label="Releases from the last (days)"
            id="discover-release-days"
            type="number"
            min={1}
            max={options.limits.max_window_days}
            value={form.days}
            onChange={(event) => change({ days: event.target.value })}
          />
          <ScopeField
            noun="artist"
            facet={options.artists}
            mode={form.artists}
            picked={form.pickedArtists}
            onMode={(mode) => change({ artists: mode })}
            onPick={() => setChoosing("artist")}
          />
          <ScopeField
            noun="label"
            facet={options.labels}
            mode={form.labels}
            picked={form.pickedLabels}
            onMode={(mode) => change({ labels: mode })}
            onPick={() => setChoosing("label")}
          />
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="discover-new__problems" aria-label="What to fix">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {refusal && (
        <p className="discover-dialog__refusal" role="alert">
          {refusal}
        </p>
      )}

      <div className="discover-new__actions">
        <Button
          onClick={() => void start()}
          loading={starting}
          disabled={!usable || busy || problems.length > 0}
          title={usable ? undefined : (unusableReason ?? undefined)}
        >
          Start looking
        </Button>
        {!usable && unusableReason && <span className="discover-note">{unusableReason}</span>}
        {usable && busy && !starting && (
          <span className="discover-note">A search is already running.</span>
        )}
      </div>

      <ScopeDialog
        open={choosing === "artist"}
        noun="artist"
        facet={options.artists}
        chosen={form.pickedArtists}
        onDone={(picked) => {
          change({ pickedArtists: picked });
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />
      <ScopeDialog
        open={choosing === "label"}
        noun="label"
        facet={options.labels}
        chosen={form.pickedLabels}
        onDone={(picked) => {
          change({ pickedLabels: picked });
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
      />
    </section>
  );
}
