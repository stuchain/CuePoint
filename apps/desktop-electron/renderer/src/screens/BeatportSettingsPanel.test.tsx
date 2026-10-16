/**
 * Settings → Beatport (C12, C15e): one line for where the sign-in stands, the one button it
 * needs, and the paste fallback behind "Paste a token instead". The bridge is faked; main's
 * sign-in is tested on its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render as baseRender, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { resetEngineReadsForTests } from "../api/engineReads";
import type { BeatportAuth } from "../api/cuepointBridge.types";
import { BEATPORT_TOKEN_STATUS, useSharedRead } from "../api/sharedReads";
import { useBeatportToken } from "../hooks/useBeatportToken";
import { BeatportSettingsPanel } from "./BeatportSettingsPanel";
import {
  INCLUDE_USER_CHARTS_STORAGE_KEY,
  resetIncludeUserChartsForTests,
} from "./discover/includeUserCharts";
import type { ReactElement } from "react";
import { ToastProvider } from "../components";

/** The panels' Reset offers Undo in a toast, so they render inside the provider the app has. */
const render = (ui: ReactElement) => baseRender(ui, { wrapper: ToastProvider });

const FIELD_ID = "settings-beatport-token";

const SIGNED_OUT: BeatportAuth = { state: "signed_out", masked: null, expires_at: null, secure_storage: true };

type Fn = ReturnType<typeof vi.fn>;

let auth: BeatportAuth;
// Everyone who subscribed (the panel, the shared cache): main announces to all of them.
const subscribers = new Set<(next: BeatportAuth) => void>();
const listener = (next: BeatportAuth) => subscribers.forEach((fn) => fn(next));
let bridge: Record<string, Fn>;

function install(initial: BeatportAuth, overrides: Record<string, Fn> = {}) {
  auth = initial;
  subscribers.clear();
  bridge = {
    // What makes the engine reachable at all.
    getJob: vi.fn(),
    getBeatportAuth: vi.fn(async () => auth),
    getBeatportTokenStatus: vi.fn(async () => ({
      configured: auth.state !== "signed_out" && auth.state !== "expired",
      masked: auth.masked,
    })),
    beatportSignIn: vi.fn(async () => {
      auth = { state: "signed_in", masked: "••••abcd", expires_at: "2099-01-01T00:00:00Z", secure_storage: true };
      return auth;
    }),
    beatportSignOut: vi.fn(async () => {
      auth = SIGNED_OUT;
      return auth;
    }),
    saveBeatportPastedToken: vi.fn(async () => {
      auth = { state: "pasted", masked: "••••wxyz", expires_at: null, secure_storage: true };
      return auth;
    }),
    onBeatportAuthChanged: vi.fn((next: (value: BeatportAuth) => void) => {
      subscribers.add(next);
      return () => {
        subscribers.delete(next);
      };
    }),
    testBeatportToken: vi.fn(async () => ({ ok: true, message: "ok" })),
    // The old engine call must never be used for a paste.
    setBeatportToken: vi.fn(),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function renderPanel(focusToken: string | null = null) {
  return render(<BeatportSettingsPanel fieldId={FIELD_ID} focusToken={focusToken} />);
}

const panel = () => document.body;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
  localStorage.clear();
  resetIncludeUserChartsForTests();
});

describe("charts by regular Beatport users", () => {
  const label = "Include charts by regular Beatport users";

  it("is off to begin with", async () => {
    install(SIGNED_OUT);
    renderPanel();
    expect(await screen.findByRole("checkbox", { name: label })).not.toBeChecked();
  });

  it("is remembered when turned on, and off again", async () => {
    install(SIGNED_OUT);
    renderPanel();
    const box = await screen.findByRole("checkbox", { name: label });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(localStorage.getItem(INCLUDE_USER_CHARTS_STORAGE_KEY)).toBe("on");
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(localStorage.getItem(INCLUDE_USER_CHARTS_STORAGE_KEY)).toBe("off");
  });
});

describe("signed out", () => {
  it("says what signing in is for and offers it first", async () => {
    install(SIGNED_OUT);
    renderPanel();
    expect(await screen.findByText("Sign in to let Discover search Beatport.")).toBeInTheDocument();
    const primary = within(panel()).getByRole("button", { name: "Sign in to Beatport" });
    expect(primary).toBeEnabled();
    expect(within(panel()).queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("keeps the paste field behind 'Paste a token instead', collapsed", async () => {
    install(SIGNED_OUT);
    renderPanel();
    const toggle = await screen.findByRole("button", { name: "Paste a token instead" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const field = document.getElementById(FIELD_ID)!;
    expect(field).not.toBeVisible();
    await userEvent.click(toggle);
    expect(field).toBeVisible();
    expect(screen.getByText("Without a sign-in, past digs and wantlist still open.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save token" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeVisible();
  });

  it("is open on arrival when a link asked for the token field, and focuses it", async () => {
    install(SIGNED_OUT);
    renderPanel("focus-1");
    await waitFor(() => expect(document.getElementById(FIELD_ID)).toHaveFocus());
    expect(document.getElementById(FIELD_ID)).toBeVisible();
  });

  it("holds the Sign in button busy while the window is open, then shows the new state", async () => {
    let finish: (value: BeatportAuth) => void = () => {};
    install(SIGNED_OUT, {
      beatportSignIn: vi.fn(
        () =>
          new Promise<BeatportAuth>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Sign in to Beatport" }));
    expect(screen.getByRole("status")).toHaveTextContent("Finish signing in in the Beatport window.");
    expect(screen.getByRole("button", { name: "Sign in to Beatport" })).toBeDisabled();
    auth = { state: "signed_in", masked: "••••abcd", expires_at: null, secure_storage: true };
    await act(async () => finish(auth));
    expect(await screen.findByText("Signed in to Beatport · ••••abcd · renews by itself")).toBeInTheDocument();
    expect(screen.queryByText("Finish signing in in the Beatport window.")).toBeNull();
  });

  it("shows one line when the sign-in window could not open", async () => {
    install(SIGNED_OUT, {
      beatportSignIn: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Sign in to Beatport" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open the Beatport sign-in. Try again.");
    expect(screen.getByRole("button", { name: "Sign in to Beatport" })).toBeEnabled();
  });

  it("saves a pasted token through main, never through the engine", async () => {
    install(SIGNED_OUT);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Paste a token instead" }));
    const field = document.getElementById(FIELD_ID) as HTMLInputElement;
    await waitFor(() => expect(field).toBeEnabled());
    await userEvent.type(field, "  secret-token  ");
    await userEvent.click(screen.getByRole("button", { name: "Save token" }));
    await waitFor(() => expect(bridge.saveBeatportPastedToken).toHaveBeenCalledWith("secret-token"));
    expect(bridge.setBeatportToken).not.toHaveBeenCalled();
    expect(await screen.findByText("Using a pasted token · ••••wxyz")).toBeInTheDocument();
    // The pasted token is not kept anywhere on the page afterwards.
    expect(document.body.innerHTML).not.toContain("secret-token");
  });

  it("says in one line when a paste could not be saved", async () => {
    install(SIGNED_OUT, {
      saveBeatportPastedToken: vi.fn(async () => {
        throw new Error("no key store");
      }),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Paste a token instead" }));
    const field = document.getElementById(FIELD_ID) as HTMLInputElement;
    await waitFor(() => expect(field).toBeEnabled());
    await userEvent.type(field, "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the token. Try again.");
  });

  it("drops a half-typed token when the sign-in goes through (type, then sign in)", async () => {
    install(SIGNED_OUT);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Paste a token instead" }));
    const field = document.getElementById(FIELD_ID) as HTMLInputElement;
    await waitFor(() => expect(field).toBeEnabled());
    await userEvent.type(field, "half-typed");
    await userEvent.click(screen.getByRole("button", { name: "Sign in to Beatport" }));
    await screen.findByText("Signed in to Beatport · ••••abcd · renews by itself");
    // Signing out brings the field back empty, and Test connection must not send the old text.
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("Sign in to let Discover search Beatport.");
    await userEvent.click(screen.getByRole("button", { name: "Paste a token instead" }));
    expect((document.getElementById(FIELD_ID) as HTMLInputElement).value).toBe("");
  });

  it("does not let Save token run while the sign-in window is open", async () => {
    install(SIGNED_OUT, { beatportSignIn: vi.fn(() => new Promise<BeatportAuth>(() => {})) });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Paste a token instead" }));
    const field = document.getElementById(FIELD_ID) as HTMLInputElement;
    await waitFor(() => expect(field).toBeEnabled());
    await userEvent.type(field, "abc");
    expect(screen.getByRole("button", { name: "Save token" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Sign in to Beatport" }));
    expect(screen.getByRole("button", { name: "Save token" })).toBeDisabled();
  });

  it("moves focus to the status line once the sign-in is over", async () => {
    install(SIGNED_OUT);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Sign in to Beatport" }));
    const line = await screen.findByText("Signed in to Beatport · ••••abcd · renews by itself");
    await waitFor(() => expect(line).toHaveFocus());
  });

  it("shows a neutral line, and no state, until main has answered", async () => {
    let answer: (value: BeatportAuth) => void = () => {};
    install(SIGNED_OUT, { getBeatportAuth: vi.fn(() => new Promise<BeatportAuth>((resolve) => (answer = resolve))) });
    renderPanel();
    expect(screen.getByText("Checking Beatport…")).toBeInTheDocument();
    expect(screen.queryByText("Sign in to let Discover search Beatport.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
    await act(async () => answer({ state: "pasted", masked: "••••abcd", expires_at: null, secure_storage: true }));
    expect(await screen.findByText("Using a pasted token · ••••abcd")).toBeInTheDocument();
  });

  it("says when the token in use is the one in the config file", async () => {
    install(SIGNED_OUT, {
      getBeatportTokenStatus: vi.fn(async () => ({ configured: true, masked: "••••cfg1", source: "config" })),
    });
    renderPanel();
    expect(await screen.findByText("Using the sign-in saved in CuePoint's config file · ••••cfg1")).toBeInTheDocument();
  });

  it("has no 'How do I get a token?' help any more", async () => {
    install(SIGNED_OUT);
    renderPanel();
    await screen.findByText("Sign in to let Discover search Beatport.");
    expect(screen.queryByText("How do I get a token?")).toBeNull();
  });
});

describe("signed in", () => {
  it("shows the masked end of the token, Test connection and Sign out", async () => {
    install({ state: "signed_in", masked: "••••abcd", expires_at: "2099-01-01T00:00:00Z", secure_storage: true });
    renderPanel();
    expect(await screen.findByText("Signed in to Beatport · ••••abcd · renews by itself")).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Test connection" })).toBeEnabled();
    expect(within(panel()).getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(within(panel()).queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
    expect(document.getElementById(FIELD_ID)).toBeNull();
  });

  it("tests the connection with the token main holds, sending none", async () => {
    install({ state: "signed_in", masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(bridge.testBeatportToken).toHaveBeenCalledWith(undefined));
    expect(await screen.findByRole("status")).toHaveTextContent("Connected. Beatport let CuePoint in.");
  });

  it("tests the held token even with text typed into the replace field", async () => {
    install({ state: "pasted", masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel("focus-2");
    await waitFor(() => expect(document.getElementById(FIELD_ID)).toBeEnabled());
    const field = document.getElementById(FIELD_ID) as HTMLInputElement;
    await userEvent.type(field, "typed-but-unsaved");
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(bridge.testBeatportToken).toHaveBeenCalledWith(undefined));
  });

  it("signs out and goes back to the signed-out view", async () => {
    install({ state: "signed_in", masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(bridge.beatportSignOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Sign in to let Discover search Beatport.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to Beatport" })).toBeInTheDocument();
  });

  it("follows a change main announces", async () => {
    install({ state: "signed_in", masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel();
    await screen.findByText("Signed in to Beatport · ••••abcd · renews by itself");
    await act(async () => listener({ state: "expired", masked: null, expires_at: null, secure_storage: true }));
    expect(await screen.findByText("Beatport sign-in ended")).toBeInTheDocument();
  });

  it("stops listening when it goes away", async () => {
    install(SIGNED_OUT);
    const view = renderPanel();
    await screen.findByText("Sign in to let Discover search Beatport.");
    // The panel's own, and the shared cache's.
    expect(subscribers.size).toBe(2);
    view.unmount();
    expect(subscribers.size).toBe(1);
    resetEngineReadsForTests();
    expect(subscribers.size).toBe(0);
  });

  it("asks the engine for the token status again after a change", async () => {
    install(SIGNED_OUT);
    renderPanel();
    await screen.findByText("Sign in to let Discover search Beatport.");
    const before = bridge.getBeatportTokenStatus.mock.calls.length;
    await act(async () => listener({ state: "signed_in", masked: "••••abcd", expires_at: null, secure_storage: true }));
    await waitFor(() => expect(bridge.getBeatportTokenStatus.mock.calls.length).toBeGreaterThan(before));
  });
});

describe("a pasted token", () => {
  it("says so, with the masked end", async () => {
    install({ state: "pasted", masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel();
    expect(await screen.findByText("Using a pasted token · ••••abcd")).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Test connection" })).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("opened by a link that wants the token field, while signed in", () => {
  it.each(["signed_in", "pasted"] as const)("opens the paste field to replace the token (%s) and focuses it", async (state) => {
    install({ state, masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel("focus-3");
    await waitFor(() => expect(document.getElementById(FIELD_ID)).toHaveFocus());
    expect(document.getElementById(FIELD_ID)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("leaves the field out on an ordinary visit", async () => {
    install({ state: "pasted", masked: "••••abcd", expires_at: null, secure_storage: true });
    renderPanel();
    await screen.findByText("Using a pasted token · ••••abcd");
    expect(document.getElementById(FIELD_ID)).toBeNull();
  });
});

describe("expired", () => {
  it("says the sign-in ended and offers Sign in to Beatport", async () => {
    install({ state: "expired", masked: null, expires_at: null, secure_storage: true });
    renderPanel();
    expect(await screen.findByText("Beatport sign-in ended")).toBeInTheDocument();
    await userEvent.click(within(panel()).getByRole("button", { name: "Sign in to Beatport" }));
    await waitFor(() => expect(bridge.beatportSignIn).toHaveBeenCalledTimes(1));
    expect(within(panel()).queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
  });
});

describe("a token from the environment", () => {
  it("names the variable and offers no sign-in", async () => {
    install({ state: "env", masked: null, expires_at: null, secure_storage: true });
    renderPanel();
    expect(await screen.findByText("Using BEATPORT_ACCESS_TOKEN from the environment")).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Sign in to Beatport" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Paste a token instead" })).toBeNull();
    expect(within(panel()).getByRole("button", { name: "Test connection" })).toBeEnabled();
  });
});

describe("no secure key store", () => {
  it("says in one line that the sign-in lasts until CuePoint quits", async () => {
    install({ ...SIGNED_OUT, secure_storage: false });
    renderPanel();
    expect(
      await screen.findByText("This system has no secure key store, so you sign in again each time CuePoint starts."),
    ).toBeInTheDocument();
  });

  it("says nothing of it when the store is secure", async () => {
    install(SIGNED_OUT);
    renderPanel();
    await screen.findByText("Sign in to let Discover search Beatport.");
    expect(screen.queryByText(/no secure key store/)).toBeNull();
  });
});

describe("without the desktop app", () => {
  it("disables sign-in and the field, and says why", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderPanel();
    expect(screen.getByText("Sign in to let Discover search Beatport.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to Beatport" })).toBeDisabled();
    // Said in plain view, not inside the collapsed paste region.
    expect(screen.getAllByText("This needs the CuePoint desktop app.")[0]).toBeVisible();
  });
});

function StatusProbe() {
  const status = useSharedRead(BEATPORT_TOKEN_STATUS).value;
  return <output data-testid="probe">{status ? `${status.configured}:${status.masked}` : "none"}</output>;
}

describe("revisiting Settings (C19d)", () => {
  it("revisit shows the old value immediately and refetches after an announce", async () => {
    install(SIGNED_OUT, {
      getBeatportTokenStatus: vi.fn(async () => ({ configured: true, masked: "••••cfg1", source: "config" })),
    });
    const first = renderHook(() => useBeatportToken());
    await waitFor(() => expect(first.result.current.status.masked).toBe("••••cfg1"));
    first.unmount();
    const before = bridge.getBeatportTokenStatus.mock.calls.length;

    const again = renderHook(() => useBeatportToken());
    // The first render: no loading, the saved token is already there.
    expect(again.result.current.status.masked).toBe("••••cfg1");
    expect(again.result.current.loading).toBe(false);
    expect(again.result.current.loaded).toBe(true);
    await waitFor(() => expect(again.result.current.auth).not.toBeNull());
    expect(bridge.getBeatportTokenStatus.mock.calls.length).toBe(before);

    bridge.getBeatportTokenStatus.mockResolvedValue({ configured: true, masked: "••••cfg2", source: "config" });
    act(() => listener({ state: "signed_in", masked: "••••cfg2", expires_at: null, secure_storage: true }));
    await waitFor(() => expect(again.result.current.status.masked).toBe("••••cfg2"));
  });

  it("leaves the new status on the shared key after a sign-in, for the other screens", async () => {
    install(SIGNED_OUT);
    render(
      <>
        <BeatportSettingsPanel fieldId={FIELD_ID} focusToken={null} />
        <StatusProbe />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("false:null"));
    await userEvent.click(await screen.findByRole("button", { name: "Sign in to Beatport" }));
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true:••••abcd"));
  });
});
