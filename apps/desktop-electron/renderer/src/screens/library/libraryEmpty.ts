/**
 * What the table says when it has no rows (ORG-13).
 *
 * "No tracks" is the same three words for six different situations, and each
 * one sends the reader somewhere different: a refused rule is a mistake to fix,
 * a filter that matched nothing is a filter to widen, an empty Collection is
 * one to fill, and a Collection a refresh emptied is neither — it is news.
 *
 * Kept here, and pure, for the reason every sentence in this phase is: the
 * words are the feature. A page that decided them inline would be a page whose
 * wording can only be checked by rendering it.
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
  scope: LibraryQuery["scope"];
  playlistId: number | null;
  /** The Smart Collection the bar is attached to, when it is attached to one. */
  smartName: string | null;
  /** The rules on screen, clause by clause, already in words. */
  rules: string[];
  /** True when this session's last refresh deleted tracks this Collection held. */
  emptiedByRefresh: boolean;
}

export interface EmptyStateView {
  /** The sentence. */
  headline: string;
  /** The clauses, when the answer is "these rules matched nothing". */
  rules: string[];
  /** A second sentence, when there is one worth saying. */
  hint: string | null;
}

/** True when a saved question is what the table is showing. */
function askingRules(input: EmptyStateInput): boolean {
  return input.smartName !== null || input.scope === "smart";
}

export function emptyStateFor(input: EmptyStateInput): EmptyStateView {
  if (input.error) {
    return { headline: input.error, rules: [], hint: null };
  }

  if (askingRules(input)) {
    // The rules are shown whether or not a search narrowed them further,
    // because they are the part the reader cannot see from here: the search
    // box still holds its own text, and the bar's chips are collapsed into a
    // count. A question that answers nothing should be readable where its
    // answer would have been.
    const headline = input.filtered
      ? "Nothing inside these rules matches this search."
      : "Nothing matches these rules right now.";
    return {
      headline,
      rules: input.rules,
      hint:
        input.smartName === null
          ? null
          : `${input.smartName} keeps asking this, so tracks appear here as they start to match.`,
    };
  }

  if (input.filtered) {
    return { headline: "No tracks match this search.", rules: [], hint: null };
  }

  if (input.playlistId != null) {
    return { headline: "This playlist is empty.", rules: [], hint: null };
  }

  if (input.scope === "collection") {
    // A Collection a refresh emptied is not a Collection nobody has filled,
    // and "drop tracks onto it" would be an invitation to someone who has just
    // lost the tracks they put there (DEC-011).
    if (input.emptiedByRefresh) {
      return {
        headline: "This Collection is empty.",
        rules: [],
        hint:
          "The tracks it held are no longer in your Rekordbox export, so the " +
          "last refresh removed them.",
      };
    }
    return {
      headline: "This Collection is empty.",
      rules: [],
      hint: "Drop tracks onto it, or use Add to Collection from the track menu.",
    };
  }

  return { headline: "No tracks yet.", rules: [], hint: null };
}
