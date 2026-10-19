/**
 * The New search tab's form (DISCOVER-10, DEC-091, FLW-15).
 *
 * What a search reads: charts in the chosen genres (the ones the chosen
 * artists made; every library artist's with "every"; the genres' general charts
 * with no artists chosen; users' charts too when Settings → Beatport says so),
 * and recent releases of the chosen artists and the library's labels — every artist and label, or only those picked from the
 * Library's own facets, with how many tracks each has. Every field starts from the engine's defaults (`options`),
 * and the form refuses what the engine would, from the bounds it sends. One
 * From/To pick in the bar sets the window for charts and releases alike, with
 * the default said in words in the bar's sentence (DSC-5).
 *
 * **Start looking** hands the search to the engine as a job: the status strip
 * shows it, and the page opens Results on it as soon as the engine begins it.
 */
import { useState } from "react";

import type {
  DiscoverListKind,
  DiscoverOptions,
  DiscoverRefusal,
  DiscoverRunRequest,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Hint } from "../../components/Hint";
import { Notice } from "../../components/Notice";
import { SearchField } from "../../components/SearchField";
import { countNoun, formatCount } from "../../format/counts";
import { useIncludeUserCharts } from "./includeUserCharts";
import { SavedListField } from "./SavedListField";
import { ScopeDialog } from "./ScopeDialog";
import { refusalText } from "./discoverFormat";
import {
  defaultForm,
  formProblems,
  runRequest,
  scopeCount,
  windowShort,
  type ListMembers,
  type NewRunForm,
  type ScopeMode,
} from "./newRun";
import { useDiscoverLists } from "./useDiscoverLists";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

interface NewRunPanelProps {
  options: DiscoverOptions;
  /** False when Beatport cannot be asked; the reason says why. */
  usable: boolean;
  unusableReason: string | null;
  /** True when there is no Beatport sign-in at all. */
  signedOut?: boolean;
  /** True while a start is being asked for, or a run is running. */
  busy: boolean;
  onStart: (request: DiscoverRunRequest) => Promise<DiscoverRefusal | null>;
}

/** The list being edited: one of the kind's lists, or (null) a new one. */
interface Editing {
  kind: DiscoverListKind;
  listId: number | null;
}

export function NewRunPanel({
  options,
  usable,
  unusableReason,
  signedOut = false,
  busy,
  onStart,
}: NewRunPanelProps) {
  const [form, setForm] = useState<NewRunForm>(() => defaultForm(options.defaults));
  const [genreFilter, setGenreFilter] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const saved = useDiscoverLists();
  const [includeUserCharts] = useIncludeUserCharts();

  const listsOf = (kind: DiscoverListKind) => saved.lists.filter((list) => list.kind === kind);
  const artistLists = listsOf("artist");
  const labelLists = listsOf("label");
  const membersOf = (mode: ScopeMode, id: number | null, lists: typeof artistLists) =>
    mode === "list" ? (lists.find((list) => list.id === id)?.members ?? []) : [];
  const members: ListMembers = {
    artists: membersOf(form.artists, form.artistListId, artistLists),
    labels: membersOf(form.labels, form.labelListId, labelLists),
  };

  const problems = formProblems(form, options.limits, members);
  const change = (patch: Partial<NewRunForm>) => {
    setRefusal(null);
    setForm((previous) => ({ ...previous, ...patch }));
  };

  const setMode = (kind: DiscoverListKind, mode: ScopeMode) => {
    const lists = kind === "artist" ? artistLists : labelLists;
    const current = kind === "artist" ? form.artistListId : form.labelListId;
    // Choosing "a saved list" lands on one that exists: the one already chosen, else the first.
    const id = lists.some((list) => list.id === current) ? current : (lists[0]?.id ?? null);
    change(
      kind === "artist"
        ? { artists: mode, artistListId: mode === "list" ? id : current }
        : { labels: mode, labelListId: mode === "list" ? id : current },
    );
  };
  const pickList = (kind: DiscoverListKind, id: number) =>
    change(kind === "artist" ? { artists: "list", artistListId: id } : { labels: "list", labelListId: id });

  const closeEditor = () => {
    setEditing(null);
    setEditError(null);
    setEditBusy(false);
  };
  const editedList = editing
    ? (listsOf(editing.kind).find((list) => list.id === editing.listId) ?? null)
    : null;

  const saveList = async (name: string, names: string[]) => {
    if (!editing) return;
    setEditBusy(true);
    setEditError(null);
    const result = editedList
      ? await saved.update(editedList.id, { name, members: names })
      : await saved.create(editing.kind, name, names);
    setEditBusy(false);
    if (result.error !== null) {
      setEditError(result.error);
      return;
    }
    // A new list is the one to dig by; editing one while "every" is chosen leaves the scope alone.
    const mode = editing.kind === "artist" ? form.artists : form.labels;
    if (!editedList || mode === "list") pickList(editing.kind, result.list.id);
    closeEditor();
  };

  const deleteList = async () => {
    if (!editing || !editedList) return;
    setEditBusy(true);
    setEditError(null);
    const error = await saved.remove(editedList.id);
    setEditBusy(false);
    if (error !== null) {
      setEditError(error);
      return;
    }
    // The scope stays "a saved list" with none chosen, so Start asks for one: a deleted list
    // must not quietly widen the dig to every artist or label.
    if (editing.kind === "artist" && form.artistListId === editedList.id) {
      change({ artistListId: null });
    } else if (editing.kind === "label" && form.labelListId === editedList.id) {
      change({ labelListId: null });
    }
    closeEditor();
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

  const start = async () => {
    setStarting(true);
    setRefusal(null);
    try {
      const refused = await onStart(runRequest(form, members, includeUserCharts));
      if (refused) setRefusal(refusalText(refused));
    } catch (cause) {
      reportUnexpected(cause);
      setRefusal(userMessage(cause));
    } finally {
      setStarting(false);
    }
  };

  const artistCount = scopeCount(form.artists, options.artists.total_values, members.artists);
  const labelCount = scopeCount(form.labels, options.labels.total_values, members.labels);
  // "Look for charts in 2 genres, releases by 200 artists and 121 labels from the last 30 days."
  const releaseParts = [
    artistCount > 0 ? <strong key="a">{countNoun(artistCount, "artist")}</strong> : null,
    labelCount > 0 ? <strong key="l">{countNoun(labelCount, "label")}</strong> : null,
  ].filter((part) => part !== null);
  const sentence = (
    <>
      Look for charts in <strong>{countNoun(form.genreIds.length, "genre")}</strong>
      {releaseParts.length > 0 && (
        <>
          , releases by {releaseParts[0]}
          {releaseParts.length > 1 && <> and {releaseParts[1]}</>}
        </>
      )}{" "}
      from <strong>{windowShort(form, options.defaults)}</strong>.
    </>
  );

  return (
    <section className="discover-new" aria-label="New dig">
      <div className="discover-new__body">
        {!options.index_current && (
          <p className="discover-note">
            CuePoint is still indexing your artists and labels, so the lists below may be short.
          </p>
        )}

        <div className="discover-new__grid">
          <Card
            className="discover-new__genres"
            bodyClassName="discover-new__card-body"
            role="group"
            aria-label="Genres for DJ charts"
            title="Genres for DJ charts"
            unit={`${formatCount(form.genreIds.length)} chosen`}
          >
            {options.genres.length === 0 ? (
              <p className="discover-note">
                {signedOut
                  ? "Genres appear after you sign in."
                  : "Beatport's genres could not be read, so no charts can be chosen now."}
              </p>
            ) : (
              <>
                <SearchField
                  thing="genres"
                  id="discover-genre-filter"
                  label="Find genres"
                  value={genreFilter}
                  onValueChange={setGenreFilter}
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
            <p className="discover-note">
              {includeUserCharts
                ? "With no artists chosen, this reads charts by artists and by regular Beatport users (Settings → Beatport)."
                : "With no artists chosen, this reads charts by artists. Settings → Beatport can include charts by regular Beatport users."}
            </p>
          </Card>

          <div className="discover-new__column">
            <SavedListField
              noun="artist"
              facet={options.artists}
              mode={form.artists}
              lists={artistLists}
              readError={saved.readError}
              listId={form.artistListId}
              onMode={(mode) => setMode("artist", mode)}
              onPickList={(id) => pickList("artist", id)}
              onEdit={() => setEditing({ kind: "artist", listId: form.artistListId })}
              onNew={() => setEditing({ kind: "artist", listId: null })}
            />
            <SavedListField
              noun="label"
              facet={options.labels}
              mode={form.labels}
              lists={labelLists}
              readError={saved.readError}
              listId={form.labelListId}
              onMode={(mode) => setMode("label", mode)}
              onPickList={(id) => pickList("label", id)}
              onEdit={() => setEditing({ kind: "label", listId: form.labelListId })}
              onNew={() => setEditing({ kind: "label", listId: null })}
            />
          </div>
        </div>

        {problems.length > 0 && (
          <Notice kind="field-error" aria-label="What to fix">
            <ul className="discover-new__problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Notice>
        )}
        {refusal && (
          <Notice>{refusal}</Notice>
        )}

        <div className="discover-new__bar" role="group" aria-label="Start a dig">
          <div className="discover-new__bar-main">
            <p
              className="discover-new__summary"
              // Cut short on one line: the app hint shows the whole sentence when it is cut.
              data-cut-hint
            >
              {sentence}
            </p>
            <div className="discover-new__dates" role="group" aria-label="Dates">
              <span className="discover-new__dates-label" aria-hidden="true">
                Dates
              </span>
              <input
                type="date"
                className="cp-field__input discover-new__date"
                aria-label="From"
                value={form.chartsFrom}
                onChange={(event) => change({ chartsFrom: event.target.value })}
              />
              <span aria-hidden="true">to</span>
              <input
                type="date"
                className="cp-field__input discover-new__date"
                aria-label="To"
                value={form.chartsTo}
                onChange={(event) => change({ chartsTo: event.target.value })}
              />
            </div>
            {!usable && unusableReason && <span className="discover-note">{unusableReason}</span>}
            {usable && busy && !starting && (
              <span className="discover-note">A dig is already running.</span>
            )}
          </div>
          <Hint text={usable ? undefined : (unusableReason ?? undefined)}>
            <Button variant="primary"
              className="discover-new__start"
              onClick={() => void start()}
              loading={starting}
              disabled={!usable || busy || problems.length > 0}
            >
              Start looking
            </Button>
          </Hint>
        </div>
      </div>

      <ScopeDialog
        open={editing !== null}
        noun={editing?.kind ?? "artist"}
        facet={editing?.kind === "label" ? options.labels : options.artists}
        list={editedList}
        error={editError}
        busy={editBusy}
        onSave={(name, names) => void saveList(name, names)}
        onDelete={() => void deleteList()}
        onClose={closeEditor}
      />
    </section>
  );
}
