/**
 * useReloadOnToken: a reload token is handled once, not on every show of a kept-alive page.
 */
import { render } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";

import { useReloadOnToken } from "./useReloadOnToken";

function Probe({ reload, token }: { reload: () => void; token: number }) {
  useReloadOnToken(reload, token);
  return null;
}

function Page({ mode, reload, token }: { mode: "visible" | "hidden"; reload: () => void; token: number }) {
  return (
    <Activity mode={mode}>
      <Probe reload={reload} token={token} />
    </Activity>
  );
}

describe("useReloadOnToken", () => {
  it("does not reload for token 0, reloads once per new token, and not again on show", () => {
    const reload = vi.fn();
    const view = render(<Page mode="visible" reload={reload} token={0} />);
    expect(reload).not.toHaveBeenCalled();

    view.rerender(<Page mode="visible" reload={reload} token={1} />);
    expect(reload).toHaveBeenCalledTimes(1);

    view.rerender(<Page mode="hidden" reload={reload} token={1} />);
    view.rerender(<Page mode="visible" reload={reload} token={1} />);
    expect(reload).toHaveBeenCalledTimes(1);

    view.rerender(<Page mode="visible" reload={reload} token={2} />);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
