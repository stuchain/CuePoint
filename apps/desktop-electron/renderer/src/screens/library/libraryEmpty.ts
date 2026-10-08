/**
 * What the table says when it has no rows (ORG-13), and what to do next (LIB-5).
 *
 * "No tracks" is the same three words for six different situations, and each
 * one sends the reader somewhere different: a refused rule is a mistake to fix,
 * a filter that matched nothing is a filter to widen, an empty Collection is
 * one to fill, and a Collection a refresh emptied is neither — it is news.
 * Every one of them also ends in a button that does the next thing, because an
 * empty table is where a user is most likely to stop.
 *
 * Kept here, and pure, for the reason every sentence in this phase is: the
 * words are the feature. A page that decided them inline would be a page whose
 * wording can only be checked by rendering it. The action is carried as an id
 * and a label; the page owns what each id does.
 *
 * The rules are carried as words rather than as a rule set, because turning a
 * clause into a sentence is `filterText.ts`'s job and there is no reason for
 * two modules to know how (ORG-12).
 */
import type { LibraryQuery } from "./libraryQuery";

export interface EmptyStateInput {
  /**
   * The engine's refusal, when it refused.
   *
   * First, and alone. It names the clause it could not honour, and "no tracks
   * match" over a refusal sends someone looking for tracks nobody asked for.
   */
  error: string | null;
  /** A search term or a filter rule is narrowing the view. */
  filtered: boolean;
  /**
   * Which of the two it is, when the page knows. Absent, a narrowed view is
   * read as both, and the button clears both.
   */
  searching?: boolean;
  filtering?: boolean;
  scope: LibraryQuery["scope"];
  playlistId: number | null;
  /** The Smart Collection the bar is attached to, when it is attached to one. */
  smartName: string | null;
  /** The rules on screen, clause by clause, already in words. */
  rules: string[];
  /** True when this session's last refresh deleted tracks this Collection held. */
  emptiedByRefresh: boolean;
  /**
   * True when the Collection scope is a Set (PREP-09). The engine scopes the
   * two alike (DEC-104); the words name which one is empty, and how a Set is
   * filled from here.
   */
  isSet?: boolean;
}

/** The next step an empty table offers; the page decides what each one does. */
export type EmptyActionId =
  | "clear-search"
  | "clear-filters"
  | "clear-all"
  | "edit-rules"
  | "check-rekordbox"
  | "show-library"
  | "import"
  | "retry";

export interface EmptyAction {
  id: EmptyActionId;
  label: string;
}

export interface EmptyStateView {
  /** The sentence. */
  title: string;
  /** The clauses, when the answer is "these rules matched nothing". */
  rules: string[];
  /** A second sentence, when there is one worth saying. */
  hint: string | null;
  /** The button that does the next step. */
  action?: EmptyAction;
}

const CLEAR_SEARCH: EmptyAction = { id: "clear-search", label: "Clear the search" };
const CLEAR_FILTERS: EmptyAction = { id: "clear-filters", label: "Clear all filters" };
const CLEAR_ALL: EmptyAction = { id: "clear-all", label: "Clear search and filters" };

/** True when a saved question is what the table is showing. */
function askingRules(input: EmptyStateInput): boolean {
  return input.smartName !== null || input.scope === "smart";
}

/** The button that undoes whatever is narrowing the view. */
function clearing(input: EmptyStateInput): EmptyAction {
  if (input.searching === true && input.filtering === false) return CLEAR_SEARCH;
  if (input.filtering === true && input.searching === false) return CLEAR_FILTERS;
  return CLEAR_ALL;
}

export function emptyStateFor(input: EmptyStateInput): EmptyStateView {
  if (input.error) {
    // The bar above already has "Try again"; this one is worded so the two are
    // not the same button twice.
    return {
      title: input.error,
      rules: [],
      hint: null,
      action: input.filtered ? CLEAR_ALL : { id: "retry", label: "Ask again" },
    };
  }

  if (askingRules(input)) {
    // The rules are shown whether or not a search narrowed them further,
    // because they are the part the reader cannot see from here: the search
    // box still holds its own text, and the bar's chips are collapsed into a
    // count. A question that answers nothing should be readable where its
    // answer would have been.
    const searched = input.searching === true;
    const title = searched
      ? "Nothing inside these rules matches this search."
      : input.filtered
        ? "Nothing matches these rules as you changed them."
        : "Nothing matches these rules right now.";
    return {
      title,
      rules: input.rules,
      hint:
        input.smartName === null
          ? null
          : `${input.smartName} keeps asking this, so tracks appear here as they start to match.`,
      // A search inside the rules is cleared; the rules themselves are edited.
      // Filters changed on a Smart Collection are rules too, so they are edited.
      action: searched ? CLEAR_SEARCH : { id: "edit-rules", label: "Edit the rules" },
    };
  }

  if (input.filtered) {
    if (input.searching === false) {
      return {
        title: "No tracks match these filters.",
        rules: [],
        hint: "Try fewer filters, or clear them all.",
        action: CLEAR_FILTERS,
      };
    }
    if (input.filtering === false) {
      return {
        title: "No tracks match this search.",
        rules: [],
        hint: "Try fewer words, or clear the search.",
        action: CLEAR_SEARCH,
      };
    }
    return {
      title: "No tracks match this search.",
      rules: [],
      hint: "Try fewer words, or clear the search and filters.",
      action: clearing(input),
    };
  }

  if (input.playlistId != null) {
    return {
      title: "This playlist is empty.",
      rules: [],
      hint: "Playlists come from Rekordbox. Add tracks to it there, then Check Rekordbox for changes.",
      action: { id: "check-rekordbox", label: "Check Rekordbox for changes" },
    };
  }

  if (input.scope === "collection") {
    const kind = input.isSet ? "Set" : "Collection";
    const action: EmptyAction = { id: "show-library", label: "Browse the whole library" };
    // A Collection a refresh emptied is not a Collection nobody has filled,
    // and "drop tracks onto it" would be an invitation to someone who has just
    // lost the tracks they put there (DEC-011). A Set likewise (PREP-02).
    if (input.emptiedByRefresh) {
      return {
        title: `This ${kind} is empty.`,
        rules: [],
        hint:
          "The tracks it held are no longer in your Rekordbox export, so the " +
          "last refresh removed them.",
        action,
      };
    }
    return {
      title: `This ${kind} is empty.`,
      rules: [],
      hint: `Drop tracks onto it, or use Add to ${kind} from the track menu.`,
      action,
    };
  }

  return {
    title: "This Rekordbox export has no tracks in it.",
    rules: [],
    hint: "Export again from Rekordbox and import that file.",
    action: { id: "import", label: "Import another file…" },
  };
}
