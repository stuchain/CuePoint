/**
 * An artist's or label's picture (DEC-318): asked for by kind and Beatport id through the one art
 * route, drawn when the bridge answers, and a neutral shape when it does not. The renderer never
 * sees a URL, and nothing is asked for when the row says there is no picture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { resetCoversForTests } from "../../api/coverLoader";
import { EntityArt } from "./EntityArt";

type Bridge = { getDiscoveryEntityArt?: ReturnType<typeof vi.fn> };

function install(bridge: Bridge) {
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

beforeEach(() => resetCoversForTests());

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("EntityArt", () => {
  it("asks with the kind, the id and the row size, and draws the picture it is given", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => "blob:mara");
    install({ getDiscoveryEntityArt });
    const { container } = render(<EntityArt kind="artist" beatportId={301001} hasArt className="box" />);
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:mara"));
    expect(getDiscoveryEntityArt).toHaveBeenCalledTimes(1);
    expect(getDiscoveryEntityArt).toHaveBeenCalledWith({ kind: "artist", beatport_id: 301001, size: "row" });
  });

  it("keeps what it was given in the shared loader, one request for a name shown twice", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => "blob:once");
    install({ getDiscoveryEntityArt });
    const first = render(<EntityArt kind="label" beatportId={40211} hasArt className="box" />);
    await waitFor(() => expect(first.container.querySelector("img")).not.toBeNull());
    const second = render(<EntityArt kind="label" beatportId={40211} hasArt className="box" />);
    expect(second.container.querySelector("img")).toHaveAttribute("src", "blob:once");
    expect(getDiscoveryEntityArt).toHaveBeenCalledTimes(1);
  });

  it("keeps the neutral shape and draws no picture when the bridge answers null", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => null);
    install({ getDiscoveryEntityArt });
    const { container } = render(<EntityArt kind="artist" beatportId={9} hasArt className="box" />);
    await waitFor(() => expect(getDiscoveryEntityArt).toHaveBeenCalled());
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".discover-entity-art")).not.toBeNull();
  });

  it("keeps the neutral shape when the read fails", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => {
      throw new Error("offline");
    });
    install({ getDiscoveryEntityArt });
    const { container } = render(<EntityArt kind="artist" beatportId={10} hasArt className="box" />);
    await waitFor(() => expect(getDiscoveryEntityArt).toHaveBeenCalled());
    expect(container.querySelector("img")).toBeNull();
  });

  it("never asks when the row has no picture, when asking is held back, or without the bridge method", () => {
    const getDiscoveryEntityArt = vi.fn(async () => "blob:never");
    install({ getDiscoveryEntityArt });
    const noArt = render(<EntityArt kind="artist" beatportId={1} hasArt={false} className="box" />);
    const held = render(<EntityArt kind="artist" beatportId={2} hasArt ask={false} className="box" />);
    expect(getDiscoveryEntityArt).not.toHaveBeenCalled();
    expect(noArt.container.querySelector("img")).toBeNull();
    expect(held.container.querySelector("img")).toBeNull();

    install({});
    const bare = render(<EntityArt kind="artist" beatportId={3} hasArt className="box" />);
    expect(bare.container.querySelector("img")).toBeNull();
  });

  it("asks once asking is no longer held back", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => "blob:later");
    install({ getDiscoveryEntityArt });
    const view = render(<EntityArt kind="artist" beatportId={4} hasArt ask={false} className="box" />);
    expect(getDiscoveryEntityArt).not.toHaveBeenCalled();
    view.rerender(<EntityArt kind="artist" beatportId={4} hasArt ask className="box" />);
    await waitFor(() => expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:later"));
  });

  it("is round for an artist and square for a label, hidden from assistive tech, with empty alt text", async () => {
    install({ getDiscoveryEntityArt: vi.fn(async () => "blob:x") });
    const artist = render(<EntityArt kind="artist" beatportId={5} hasArt className="box" />);
    const label = render(<EntityArt kind="label" beatportId={6} hasArt className="box" />);
    const round = artist.container.firstElementChild!;
    const square = label.container.firstElementChild!;
    expect(round).toHaveClass("box--artist");
    expect(square).toHaveClass("box--label");
    expect(round).not.toHaveClass("box--label");
    expect(round).toHaveAttribute("aria-hidden", "true");
    await waitFor(() => expect(artist.container.querySelector("img")).not.toBeNull());
    expect(artist.container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("keeps a picture it has drawn when asking is held back again, and lets go for another name", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => "blob:kept");
    install({ getDiscoveryEntityArt });
    const view = render(<EntityArt kind="artist" beatportId={21} hasArt ask className="box" />);
    await waitFor(() => expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:kept"));
    view.rerender(<EntityArt kind="artist" beatportId={21} hasArt ask={false} className="box" />);
    expect(view.container.querySelector("img")).toHaveAttribute("src", "blob:kept");
    // Another name that is held back draws nothing.
    view.rerender(<EntityArt kind="artist" beatportId={22} hasArt ask={false} className="box" />);
    expect(view.container.querySelector("img")).toBeNull();
    expect(getDiscoveryEntityArt).toHaveBeenCalledTimes(1);
  });

  it("draws a kept answer on a new mount even while asking is held back", async () => {
    const getDiscoveryEntityArt = vi.fn(async () => "blob:cached");
    install({ getDiscoveryEntityArt });
    const first = render(<EntityArt kind="label" beatportId={23} hasArt ask className="box" />);
    await waitFor(() => expect(first.container.querySelector("img")).not.toBeNull());
    const second = render(<EntityArt kind="label" beatportId={23} hasArt ask={false} className="box" />);
    expect(second.container.querySelector("img")).toHaveAttribute("src", "blob:cached");
    expect(getDiscoveryEntityArt).toHaveBeenCalledTimes(1);
  });
});
