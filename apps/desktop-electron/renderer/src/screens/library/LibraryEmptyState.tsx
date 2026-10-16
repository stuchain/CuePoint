/**
 * The empty table, drawn (ORG-13, LIB-5): the sentence, the rules when rules
 * are the reason, a hint, and the button for the next step.
 *
 * The words come from `libraryEmpty.ts`; what each button does is the page's,
 * handed in as `onAction`.
 */
import { EmptyState } from "../../components/EmptyState";
import type { EmptyActionId, EmptyStateView } from "./libraryEmpty";

interface LibraryEmptyStateProps {
  view: EmptyStateView;
  onAction: (id: EmptyActionId) => void;
}

export function LibraryEmptyState({ view, onAction }: LibraryEmptyStateProps) {
  const { action } = view;
  const rules =
    view.rules.length > 0 ? (
      <ul className="library-screen__empty-rules" aria-label="The rules being asked">
        {view.rules.map((rule, index) => (
          <li key={`${rule}-${index}`}>{rule}</li>
        ))}
      </ul>
    ) : null;
  return (
    <EmptyState
      icon="library"
      // A headline is a label: no full stop (area 66); the reason is the description.
      headline={view.title.replace(/\.$/, "")}
      description={
        rules || view.hint ? (
          <>
            {rules}
            {view.hint}
          </>
        ) : undefined
      }
      action={action ? { label: action.label, onClick: () => onAction(action.id) } : undefined}
    />
  );
}
