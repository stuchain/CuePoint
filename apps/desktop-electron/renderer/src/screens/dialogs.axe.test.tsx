/**
 * The dialogs no page test opens directly, each rendered open and held to WCAG 2.2 A and AA (HARDEN-08).
 * The dialogs that have a test file of their own carry their check there; the ones the pages open
 * (Columns, Match) are checked in the page's test.
 */
import { describe, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { RekordboxInstructionsDialog } from "../components/RekordboxInstructionsDialog";
import { ToastProvider } from "../components";
import { ScaleProvider } from "../tokens/ScaleContext";
import { expectNoAxeViolations } from "../test/axe";
import type { DiscoverFacet, SetChapterPlan } from "../api/cuepointBridge.types";
import { NewSetFromDialog } from "./library/NewSetFromDialog";
import { ChapterDialog } from "./prepare/ChapterDialog";
import { NewSetFromListDialog, RenameSetDialog } from "./prepare/NewSetDialogs";
import { SetNotesDialog } from "./prepare/SetNotesDialog";
import { NoteDialog } from "./discover/NoteDialog";
import { PushDialog } from "./discover/PushDialog";
import { ScopeDialog } from "./discover/ScopeDialog";

const FOLDERS = [
  { id: 2, name: "Sets", depth: 0 },
  { id: 5, name: "2026", depth: 1 },
];

const CHAPTER = {
  id: 2,
  position: 1,
  name: "Peak",
  target_seconds: null,
  bpm_min: null,
  bpm_max: null,
  notes: null,
  entry_ids: [],
} as unknown as SetChapterPlan;

const FACET = {
  field: "artist",
  values: [
    { value: "Alpha", count: 12 },
    { value: "Beta", count: 3 },
  ],
  truncated: false,
  total_values: 2,
} as unknown as DiscoverFacet;

describe("dialogs accessibility (HARDEN-08)", () => {
  it("has no violations in How to get your Rekordbox file", async () => {
    render(<RekordboxInstructionsDialog open onClose={vi.fn()} />);
    await expectNoAxeViolations();
  });

  it("has none in New Set from a list", async () => {
    render(
      <ScaleProvider>
        <NewSetFromListDialog
          open
          groups={[
            {
              label: "Collections",
              sources: [{ kind: "collection", id: 7, name: "Warm-up", parentId: null }],
            },
          ]}
          folders={FOLDERS}
          onCreate={vi.fn()}
          onClose={vi.fn()}
        />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in New Set from a Collection", async () => {
    render(
      <ScaleProvider>
        <NewSetFromDialog
          source={{ kind: "collection", id: 7, name: "Warm-up", parentId: null }}
          folders={FOLDERS}
          onCreate={vi.fn()}
          onClose={vi.fn()}
        />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in the Set's name dialog, with a refusal showing", async () => {
    render(
      <ScaleProvider>
        <RenameSetDialog name="Friday" title="Rename the Set" error="A Set with that name already exists." onSave={vi.fn()} onClose={vi.fn()} />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in the Set's notes", async () => {
    render(
      <ScaleProvider>
        <SetNotesDialog set={{ name: "Friday", notes: "The Loft" }} onSave={vi.fn()} onClose={vi.fn()} />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in a chapter's dialog", async () => {
    render(
      <ScaleProvider>
        <ChapterDialog chapter={CHAPTER} canMoveUp canMoveDown canDelete onSave={vi.fn()} onClose={vi.fn()} onMove={vi.fn()} onDelete={vi.fn()} />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in a Wantlist note", async () => {
    render(
      <ScaleProvider>
        <NoteDialog open track="Strobe" note="For the warm-up" maxLength={200} onSave={async () => null} onClose={vi.fn()} />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in the Beatport push dialog, new playlist and existing", async () => {
    render(
      <ScaleProvider>
        <ToastProvider>
          <PushDialog
            open
            what="the 3 selected tracks"
            defaultName="CuePoint dig"
            maxNameLength={100}
            allowExisting
            onPush={async () => null}
            onClose={vi.fn()}
          />
        </ToastProvider>
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });

  it("has none in the artist list dialog", async () => {
    render(
      <ScaleProvider>
        <ScopeDialog
          open
          noun="artist"
          facet={FACET}
          list={{ id: 1, name: "Favourites", members: ["Alpha"] }}
          error={null}
          busy={false}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </ScaleProvider>,
    );
    await expectNoAxeViolations();
  });
});
