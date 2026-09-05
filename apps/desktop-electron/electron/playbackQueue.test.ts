import { describe, expect, it } from "vitest";

import { PREVIOUS_RESTART_THRESHOLD_SECONDS, PlaybackQueue } from "./playbackQueue";

/**
 * The queue's rules (PLAYER-04).
 *
 * Index bookkeeping under mutation is where this kind of model breaks, so most
 * of what follows is deliberately awkward: remove the playing item, remove the
 * one above it, reorder across it, shuffle and unshuffle mid-track. The model
 * tracks the current item by identity precisely so these cases have boring
 * answers, and these tests are what keep them boring.
 */

const track = (name: string) => ({ filePath: `/music/${name}.flac`, title: name });
const tracks = (...names: string[]) => names.map(track);

/** A deterministic "random" that reverses, so shuffled order is predictable. */
const reversing = () => 0;

function queueOf(...names: string[]) {
  const queue = new PlaybackQueue();
  queue.replace(tracks(...names));
  return queue;
}

const titles = (queue: PlaybackQueue) => queue.snapshot().items.map((item) => item.title);
const playTitles = (queue: PlaybackQueue) =>
  queue.snapshot().playOrder.map((id) => queue.itemById(id)?.title);

describe("an empty queue", () => {
  it("has nothing current", () => {
    const queue = new PlaybackQueue();
    expect(queue.isEmpty).toBe(true);
    expect(queue.current).toBeNull();
    expect(queue.currentIndex).toBe(-1);
  });

  it("advances to nothing rather than throwing", () => {
    // Every transport operation on an empty queue has to be a no-op, not an
    // exception: the transport buttons exist before the queue does.
    const queue = new PlaybackQueue();
    expect(queue.next()).toBeNull();
    expect(queue.peekNext()).toBeNull();
    expect(queue.jumpTo(0)).toBeNull();
    expect(queue.previous(0)).toEqual({ action: "none", item: null });
  });

  it("ignores edits to items that are not there", () => {
    const queue = new PlaybackQueue();
    expect(queue.removeById("nope")).toEqual({ removed: null, nextToPlay: null });
    expect(queue.move(0, 1)).toBe(false);
    expect(() => queue.markFailed("nope")).not.toThrow();
  });
});

describe("building a queue", () => {
  it("replaces everything and starts where the user clicked (DEC-012)", () => {
    const queue = new PlaybackQueue();
    const started = queue.replace(tracks("a", "b", "c"), 1);

    expect(started?.title).toBe("b");
    expect(queue.current?.title).toBe("b");
    expect(queue.length).toBe(3);
  });

  it("starts at the top when no index is given", () => {
    expect(queueOf("a", "b").current?.title).toBe("a");
  });

  it("survives a start index past the end", () => {
    const queue = new PlaybackQueue();
    expect(queue.replace(tracks("a", "b"), 99)?.title).toBe("a");
  });

  it("replacing an existing queue discards the old one (DEC-013)", () => {
    const queue = queueOf("a", "b");
    queue.replace(tracks("x", "y", "z"), 0);
    expect(titles(queue)).toEqual(["x", "y", "z"]);
    expect(queue.current?.title).toBe("x");
  });

  it("marks the starting item as playing", () => {
    const queue = queueOf("a", "b");
    expect(queue.current?.status).toBe("playing");
    expect(queue.itemById(queue.snapshot().playOrder[1])?.status).toBe("pending");
  });

  it("gives repeated tracks distinct identities", () => {
    // The same file twice is a legitimate queue, and the two entries have to be
    // separately removable.
    const queue = new PlaybackQueue();
    queue.replace([track("a"), track("a")]);
    const [first, second] = queue.snapshot().items;
    expect(first.id).not.toBe(second.id);
  });
});

describe("Play Next and Add to Queue (DEC-013)", () => {
  it("inserts Play Next directly after the playing track", () => {
    const queue = queueOf("a", "b", "c");
    queue.playNext(tracks("x"));
    expect(titles(queue)).toEqual(["a", "x", "b", "c"]);
  });

  it("makes Play Next play next", () => {
    const queue = queueOf("a", "b", "c");
    queue.playNext(tracks("x"));
    expect(queue.peekNext()?.title).toBe("x");
  });

  it("keeps several Play Next items in the order they were given", () => {
    const queue = queueOf("a", "b");
    queue.playNext(tracks("x", "y"));
    expect(titles(queue)).toEqual(["a", "x", "y", "b"]);
  });

  it("appends Add to Queue at the end", () => {
    const queue = queueOf("a", "b");
    queue.append(tracks("z"));
    expect(titles(queue)).toEqual(["a", "b", "z"]);
  });

  it("neither action interrupts what is playing", () => {
    const queue = queueOf("a", "b");
    const before = queue.currentId;
    queue.playNext(tracks("x"));
    queue.append(tracks("z"));
    expect(queue.currentId).toBe(before);
    expect(queue.current?.title).toBe("a");
  });

  it("can build a queue from nothing by appending", () => {
    const queue = new PlaybackQueue();
    queue.append(tracks("a", "b"));
    expect(queue.length).toBe(2);
    // Nothing is playing yet: appending is not playing.
    expect(queue.current).toBeNull();
    expect(queue.peekNext()?.title).toBe("a");
  });
});

describe("removing items", () => {
  it("removing a later item leaves playback alone", () => {
    const queue = queueOf("a", "b", "c");
    const result = queue.removeById(queue.snapshot().items[2].id);
    expect(result.nextToPlay).toBeNull();
    expect(queue.current?.title).toBe("a");
  });

  it("removing an item ABOVE the playing one does not change what plays", () => {
    // The classic index bug: with a stored index this silently makes the
    // neighbour "current" and the next advance skips a track.
    const queue = queueOf("a", "b", "c");
    queue.jumpTo(2); // playing "c"
    queue.removeById(queue.snapshot().items[0].id); // remove "a"

    expect(queue.current?.title).toBe("c");
    expect(queue.currentIndex).toBe(1);
  });

  it("advancing after removing an earlier item still goes to the right track", () => {
    const queue = queueOf("a", "b", "c", "d");
    queue.jumpTo(1); // playing "b"
    queue.removeById(queue.snapshot().items[0].id); // remove "a"
    expect(queue.next()?.title).toBe("c");
  });

  it("removing the playing item hands over to the next one", () => {
    const queue = queueOf("a", "b", "c");
    const result = queue.removeById(queue.currentId!);
    expect(result.nextToPlay?.title).toBe("b");
    expect(queue.current?.title).toBe("b");
  });

  it("removing the last playing item stops playback", () => {
    const queue = queueOf("a");
    const result = queue.removeById(queue.currentId!);
    expect(result.nextToPlay).toBeNull();
    expect(queue.current).toBeNull();
    expect(queue.isEmpty).toBe(true);
  });

  it("removing the playing item at the end stops rather than wrapping", () => {
    const queue = queueOf("a", "b");
    queue.jumpTo(1);
    const result = queue.removeById(queue.currentId!);
    expect(result.nextToPlay).toBeNull();
  });

  it("removing the playing item under repeat-all wraps to the start", () => {
    const queue = queueOf("a", "b");
    queue.setRepeat("all");
    queue.jumpTo(1);
    const result = queue.removeById(queue.currentId!);
    expect(result.nextToPlay?.title).toBe("a");
  });

  it("removing the only item under repeat-one stops instead of looping a ghost", () => {
    const queue = queueOf("a");
    queue.setRepeat("one");
    const result = queue.removeById(queue.currentId!);
    expect(result.nextToPlay).toBeNull();
    expect(queue.current).toBeNull();
  });
});

describe("reordering", () => {
  it("moves an item in view order", () => {
    const queue = queueOf("a", "b", "c");
    expect(queue.move(0, 2)).toBe(true);
    expect(titles(queue)).toEqual(["b", "c", "a"]);
  });

  it("keeps playing the same track when it is moved", () => {
    const queue = queueOf("a", "b", "c");
    queue.move(0, 2); // "a" is playing and moves to the end
    expect(queue.current?.title).toBe("a");
    expect(queue.currentIndex).toBe(2);
  });

  it("changes what comes next when the order changes", () => {
    const queue = queueOf("a", "b", "c");
    queue.move(2, 1); // c before b
    expect(queue.peekNext()?.title).toBe("c");
  });

  it("refuses out-of-range moves", () => {
    const queue = queueOf("a", "b");
    expect(queue.move(-1, 0)).toBe(false);
    expect(queue.move(0, 5)).toBe(false);
    expect(queue.move(1, 1)).toBe(false);
  });
});

describe("advancing", () => {
  it("plays through the queue in order", () => {
    const queue = queueOf("a", "b", "c");
    expect(queue.next()?.title).toBe("b");
    expect(queue.next()?.title).toBe("c");
  });

  it("stops at the end", () => {
    const queue = queueOf("a", "b");
    queue.next();
    expect(queue.next()).toBeNull();
    expect(queue.current).toBeNull();
  });

  it("keeps the queue after it ends, so the panel still shows it", () => {
    const queue = queueOf("a");
    queue.next();
    expect(queue.length).toBe(1);
  });

  it("leaves nothing marked playing once the queue ends", () => {
    // Otherwise the snapshot says "no current track" and "this one is playing"
    // at the same time, and the queue panel draws a track that stopped.
    const queue = queueOf("a", "b");
    queue.next();
    queue.next();

    expect(queue.currentIndex).toBe(-1);
    expect(queue.snapshot().items.some((item) => item.status === "playing")).toBe(false);
  });

  it("jumps to an arbitrary position", () => {
    const queue = queueOf("a", "b", "c");
    expect(queue.jumpTo(2)?.title).toBe("c");
    expect(queue.currentIndex).toBe(2);
  });

  it("ignores a jump past the end", () => {
    const queue = queueOf("a", "b");
    expect(queue.jumpTo(9)).toBeNull();
    expect(queue.current?.title).toBe("a");
  });

  it("only one item is ever marked playing", () => {
    const queue = queueOf("a", "b", "c");
    queue.next();
    const playing = queue.snapshot().items.filter((item) => item.status === "playing");
    expect(playing).toHaveLength(1);
    expect(playing[0].title).toBe("b");
  });
});

describe("repeat", () => {
  it("off stops at the end", () => {
    const queue = queueOf("a", "b");
    queue.jumpTo(1);
    expect(queue.next()).toBeNull();
  });

  it("all wraps to the first track", () => {
    const queue = queueOf("a", "b");
    queue.setRepeat("all");
    queue.jumpTo(1);
    expect(queue.next()?.title).toBe("a");
  });

  it("one replays the same track", () => {
    const queue = queueOf("a", "b");
    queue.setRepeat("one");
    expect(queue.next()?.title).toBe("a");
    expect(queue.next()?.title).toBe("a");
  });

  it("one still reports the same track as what comes next", () => {
    // What makes a preloaded, gapless repeat possible (DEC-056).
    const queue = queueOf("a", "b");
    queue.setRepeat("one");
    expect(queue.peekNext()?.title).toBe("a");
  });

  it("all on a single-track queue repeats it", () => {
    const queue = queueOf("a");
    queue.setRepeat("all");
    expect(queue.next()?.title).toBe("a");
  });

  it("switching repeat mid-queue takes effect immediately", () => {
    const queue = queueOf("a", "b");
    queue.jumpTo(1);
    expect(queue.peekNext()).toBeNull();
    queue.setRepeat("all");
    expect(queue.peekNext()?.title).toBe("a");
  });
});

describe("previous", () => {
  it("goes back when pressed early in a track", () => {
    const queue = queueOf("a", "b", "c");
    queue.jumpTo(1);
    const result = queue.previous(1);
    expect(result.action).toBe("changed");
    expect(result.item?.title).toBe("a");
  });

  it("restarts the track when pressed later", () => {
    // The convention every player shares: someone who missed the intro means
    // "play this again", not "go back".
    const queue = queueOf("a", "b");
    queue.jumpTo(1);
    const result = queue.previous(PREVIOUS_RESTART_THRESHOLD_SECONDS + 1);
    expect(result.action).toBe("restart");
    expect(queue.current?.title).toBe("b");
  });

  it("treats exactly the threshold as still going back", () => {
    const queue = queueOf("a", "b");
    queue.jumpTo(1);
    expect(queue.previous(PREVIOUS_RESTART_THRESHOLD_SECONDS).action).toBe("changed");
  });

  it("restarts rather than doing nothing at the first track", () => {
    const queue = queueOf("a", "b");
    const result = queue.previous(0);
    expect(result.action).toBe("restart");
    expect(queue.current?.title).toBe("a");
  });

  it("treats an unknown position as the start of the track", () => {
    const queue = queueOf("a", "b");
    queue.jumpTo(1);
    expect(queue.previous(null).action).toBe("changed");
  });
});

describe("shuffle", () => {
  it("keeps the current track playing when turned on", () => {
    const queue = queueOf("a", "b", "c", "d");
    queue.jumpTo(2);
    queue.setShuffle(true);
    expect(queue.current?.title).toBe("c");
    expect(queue.currentIndex).toBe(0);
  });

  it("plays the current track first and the rest after", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c"), 1);
    queue.setShuffle(true);
    expect(playTitles(queue)[0]).toBe("b");
    expect(playTitles(queue)).toHaveLength(3);
  });

  it("does not reorder the view (DEC-052)", () => {
    // Shuffle reorders the queue, not the table the queue came from.
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c"));
    queue.setShuffle(true);
    expect(titles(queue)).toEqual(["a", "b", "c"]);
  });

  it("restores the original order when turned off, still playing the same track", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c", "d"), 2);
    queue.setShuffle(true);
    queue.setShuffle(false);

    expect(playTitles(queue)).toEqual(["a", "b", "c", "d"]);
    expect(queue.current?.title).toBe("c");
    expect(queue.currentIndex).toBe(2);
  });

  it("contains exactly the same items after shuffling", () => {
    const queue = new PlaybackQueue({ random: () => 0.5 });
    queue.replace(tracks("a", "b", "c", "d", "e"));
    queue.setShuffle(true);
    expect([...playTitles(queue)].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("advances through shuffled order, not view order", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c"));
    queue.setShuffle(true);
    const expected = playTitles(queue)[1];
    expect(queue.next()?.title).toBe(expected);
  });

  it("turning it on twice does not reshuffle", () => {
    const queue = new PlaybackQueue({ random: () => 0.5 });
    queue.replace(tracks("a", "b", "c", "d"));
    queue.setShuffle(true);
    const first = playTitles(queue);
    queue.setShuffle(true);
    expect(playTitles(queue)).toEqual(first);
  });

  it("shuffles a queue built while shuffle was already on", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.setShuffle(true);
    queue.replace(tracks("a", "b", "c"));
    expect(queue.snapshot().playOrder).toHaveLength(3);
    expect(queue.current?.title).toBe("a");
  });

  it("Play Next still means next while shuffled", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c"));
    queue.setShuffle(true);
    queue.playNext(tracks("x"));
    expect(queue.peekNext()?.title).toBe("x");
  });
});

describe("failures", () => {
  it("marks an item failed without removing it", () => {
    // PLAYER-10 shows this in the panel after the toast is gone (DEC-054).
    const queue = queueOf("a", "b");
    queue.markFailed(queue.currentId!);
    expect(queue.snapshot().items[0].status).toBe("failed");
    expect(queue.length).toBe(2);
  });

  it("a failed item stays failed when passed over", () => {
    const queue = queueOf("a", "b");
    const failedId = queue.currentId!;
    queue.markFailed(failedId);
    queue.next();
    expect(queue.itemById(failedId)?.status).toBe("failed");
  });

  it("can still be played again later", () => {
    // The drive may be back; DEC-054 says a failure is not permanent.
    const queue = queueOf("a", "b");
    const failedId = queue.currentId!;
    queue.markFailed(failedId);
    queue.next();
    expect(queue.jumpToId(failedId)?.id).toBe(failedId);
    expect(queue.current?.id).toBe(failedId);
  });
});

describe("nothing is persisted (DEC-014, DEC-050)", () => {
  it("exposes no serialization of its own", () => {
    // Quitting is meant to lose the queue. A `toJSON` here would be the first
    // step toward restoring it, which is exactly what DEC-014 rules out.
    const queue = queueOf("a");
    expect((queue as unknown as { toJSON?: unknown }).toJSON).toBeUndefined();
    expect((queue as unknown as { save?: unknown }).save).toBeUndefined();
  });

  it("starts empty every time", () => {
    expect(new PlaybackQueue().isEmpty).toBe(true);
  });
});
