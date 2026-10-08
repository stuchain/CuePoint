/**
 * The empty table, drawn (ORG-13, LIB-5): the sentence, the rules when rules
 * are the reason, a hint, and the button for the next step.
 *
 * The words come from `libraryEmpty.ts`; what each button does is the page's,
 * handed in as `onAction`.
 */
import { Button } from "../../components";
import type { EmptyActionId, EmptyStateView } from "./libraryEmpty";

interface LibraryEmptyStateProps {
  view: EmptyStateView;
  onAction: (id: EmptyActionId) => void;
}

export function LibraryEmptyState({ view, onAction }: LibraryEmptyStateProps) {
  const { action } = view;
  return (
    <div className="library-screen__empty-state">
      <p className="library-screen__empty-headline">{view.title}</p>
      {view.rules.length > 0 && (
        <ul className="library-screen__empty-rules" aria-label="The rules being asked">
          {view.rules.map((rule, index) => (
            <li key={`${rule}-${index}`}>{rule}</li>
          ))}
        </ul>
      )}
      {view.hint && <p className="library-screen__empty-hint">{view.hint}</p>}
      {action && (
        <Button variant="secondary" onClick={() => onAction(action.id)}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
