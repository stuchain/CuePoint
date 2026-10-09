/**
 * Where each Health count leads (PAGES-07B, FLW-14, DEC-075).
 *
 * A count opens what fixes it: missing files and duplicates open their tabs,
 * "Waiting for you" opens Review, and the rest open the Library on exactly the
 * rules the count came with. "No Beatport key" says how it differs from "Not
 * looked up yet".
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { LibraryHealth } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import fixture from "./cleanEmpty.fixture.json";
import { HealthView } from "./HealthView";

const HEALTH = fixture.untouched.health as LibraryHealth;

function Probe() {
  const location = useLocation();
  return <pre data-testid="location">{JSON.stringify({ path: location.pathname, state: location.state })}</pre>;
}

function renderHealth(health: LibraryHealth = HEALTH) {
  const onOpenSection = vi.fn();
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/clean"]}>
        <Routes>
          <Route
            path="/clean"
            element={
              <HealthView
                health={health}
                error={null}
                loading={false}
                onHealthChanged={() => {}}
                onOpenSection={onOpenSection}
              />
            }
          />
          <Route path="/library" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  return { onOpenSection };
}

function link(id: string) {
  const count = HEALTH.counts.find((entry) => entry.id === id)!;
  return screen.getByRole("button", { name: new RegExp(`^${count.count.toLocaleString()} ${count.label}:`) });
}

describe("counts that have a tab of their own", () => {
  it.each([
    ["missing_files", "missing"],
    ["duplicates", "duplicates"],
    ["needs_review", "review"],
  ])("opens %s on its tab, not the Library", (id, section) => {
    const { onOpenSection } = renderHealth();
    fireEvent.click(link(id));
    expect(onOpenSection).toHaveBeenCalledWith(section);
    expect(screen.queryByTestId("location")).toBeNull();
  });

  it("says where each one goes", () => {
    renderHealth();
    expect(link("missing_files")).toHaveAccessibleName(/open Missing files$/);
    expect(link("duplicates")).toHaveAccessibleName(/open Duplicates$/);
    expect(link("needs_review")).toHaveAccessibleName(/open Review matches$/);
    expect(link("missing_bpm")).toHaveAccessibleName(/open in the Library$/);
  });
});

describe("counts without a tab", () => {
  it.each(["not_matched", "disputed", "missing_key", "missing_bpm", "missing_genre", "no_artwork"])(
    "opens the Library on exactly the rules %s came with",
    async (id) => {
      const { onOpenSection } = renderHealth();
      fireEvent.click(link(id));
      const where = JSON.parse((await screen.findByTestId("location")).textContent ?? "{}");
      expect(where.path).toBe("/library");
      expect(where.state.cuepointLibraryRules).toEqual(HEALTH.counts.find((c) => c.id === id)!.rules);
      expect(onOpenSection).not.toHaveBeenCalled();
    },
  );

  it("opens No Beatport key on Key is empty, the rule its count is", async () => {
    renderHealth();
    fireEvent.click(link("missing_key"));
    const where = JSON.parse((await screen.findByTestId("location")).textContent ?? "{}");
    expect(where.state.cuepointLibraryRules).toEqual({
      match: "all",
      rules: [{ field: "key", operator: "is_empty" }],
    });
  });
});

describe("the hint on No Beatport key", () => {
  it("says a matched track can still have no key, and how that differs from Not matched", () => {
    renderHealth();
    const hint = screen.getByText(/Beatport's record has none/);
    expect(hint).toHaveTextContent(/not the same as Not matched/i);
    expect(hint).toHaveTextContent(/matched track can still have no key/i);
  });
});
