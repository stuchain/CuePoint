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

/**
 * The queue as the panel sees it: play order, read through a window.
 *
 * The snapshot no longer carries the items themselves (PLAYER-08) — at
 * PLAYER-05's 50,000-track cap that is 14.5 MB per push — so this is how the
 * contents are read now.
 */
const titles = (queue: PlaybackQueue) => queue.window(0, 1_000).items.map((item) => item.title);
const playTitles = titles;
const statuses = (queue: PlaybackQueue) => queue.window(0, 1_000).items.map((item) => item.status);

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
    expect(queue.window(0, 1_000).items[1].status).toBe("pending");
  });

  it("gives repeated tracks distinct identities", () => {
    // The same file twice is a legitimate queue, and the two entries have to be
    // separately removable.
    const queue = new PlaybackQueue();
    queue.replace([track("a"), track("a")]);
    const [first, second] = queue.window(0, 1_000).items;
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
    const result = queue.removeById(queue.window(0, 1_000).items[2].id);
    expect(result.nextToPlay).toBeNull();
    expect(queue.current?.title).toBe("a");
  });

  it("removing an item ABOVE the playing one does not change what plays", () => {
    // The classic index bug: with a stored index this silently makes the
    // neighbour "current" and the next advance skips a track.
    const queue = queueOf("a", "b", "c");
    queue.jumpTo(2); // playing "c"
    queue.removeById(queue.window(0, 1_000).items[0].id); // remove "a"

    expect(queue.current?.title).toBe("c");
    expect(queue.currentIndex).toBe(1);
  });

  it("advancing after removing an earlier item still goes to the right track", () => {
    const queue = queueOf("a", "b", "c", "d");
    queue.jumpTo(1); // playing "b"
    queue.removeById(queue.window(0, 1_000).items[0].id); // remove "a"
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
    expect(statuses(queue).some((status) => status === "playing")).toBe(false);
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
    const playing = queue.window(0, 1_000).items.filter((item) => item.status === "playing");
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

  it("keeps the queue's own order to restore (DEC-052)", () => {
    // Shuffle reorders the queue, not the list it was built from — which is
    // why turning it off can put things back exactly. That the *table* is
    // untouched is asserted where the table actually lives, in
    // `playerOrderIsolation.test.tsx`.
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c"));
    queue.setShuffle(true);
    queue.setShuffle(false);
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
    expect(queue.window(0, 1_000).items).toHaveLength(3);
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
    expect(queue.window(0, 1_000).items[0].status).toBe("failed");
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

describe("reading the queue a window at a time (PLAYER-08)", () => {
  it("does not put the queue's contents in the snapshot", () => {
    // At PLAYER-05's 50,000-track cap the contents are ~14.5 MB, and the
    // snapshot is pushed several times a second while a track plays.
    const queue = queueOf("a", "b", "c");
    const snapshot = queue.snapshot() as unknown as Record<string, unknown>;

    expect(snapshot.items).toBeUndefined();
    expect(snapshot.playOrder).toBeUndefined();
    expect(snapshot.length).toBe(3);
  });

  it("carries the playing entry, so the bar needs no window", () => {
    const queue = queueOf("a", "b");
    expect(queue.snapshot().currentItem?.title).toBe("a");
  });

  it("carries no playing entry once the queue ends", () => {
    const queue = queueOf("a");
    queue.next();
    expect(queue.snapshot().currentItem).toBeNull();
  });

  it("returns the page asked for, in play order", () => {
    const queue = queueOf("a", "b", "c", "d", "e");
    const page = queue.window(1, 2);
    expect(page.items.map((item) => item.title)).toEqual(["b", "c"]);
    expect(page.offset).toBe(1);
    expect(page.total).toBe(5);
  });

  it("reports the whole length so a scrollbar can be sized", () => {
    const queue = queueOf("a", "b", "c");
    expect(queue.window(0, 1).total).toBe(3);
  });

  it("follows play order while shuffled, not the order it was built in", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c", "d"), 0);
    queue.setShuffle(true);

    const windowed = queue.window(0, 10).items.map((item) => item.title);
    expect(windowed[0]).toBe("a"); // the playing track stays first
    expect([...windowed].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("answers an out-of-range page with nothing rather than throwing", () => {
    // A panel scrolling while the queue shrinks underneath it is ordinary.
    const queue = queueOf("a", "b");
    expect(queue.window(50, 10).items).toEqual([]);
    expect(queue.window(-5, 10).items).toHaveLength(2);
    expect(queue.window(0, 0).items).toEqual([]);
  });

  it("hands out copies, so a caller cannot edit the queue by accident", () => {
    const queue = queueOf("a", "b");
    const page = queue.window(0, 10);
    page.items[0].title = "tampered";
    expect(queue.window(0, 10).items[0].title).toBe("a");
  });

  it("pages a large queue without repeating or skipping", () => {
    const queue = new PlaybackQueue();
    queue.replace(
      Array.from({ length: 5_000 }, (_, index) => ({
        filePath: `/music/${index}.flac`,
        title: `Track ${index}`,
      })),
      0,
    );

    const collected: string[] = [];
    for (let offset = 0; offset < 5_000; offset += 250) {
      collected.push(...queue.window(offset, 250).items.map((item) => item.title));
    }

    expect(collected).toHaveLength(5_000);
    expect(new Set(collected).size).toBe(5_000);
    expect(collected[0]).toBe("Track 0");
    expect(collected.at(-1)).toBe("Track 4999");
  });
});

describe("reordering in play order (PLAYER-08)", () => {
  it("moves a track sooner", () => {
    const queue = queueOf("a", "b", "c");
    expect(queue.move(2, 0)).toBe(true);
    expect(titles(queue)).toEqual(["c", "a", "b"]);
  });

  it("reorders only the queue while shuffled, never the list it came from", () => {
    const queue = new PlaybackQueue({ random: reversing });
    queue.replace(tracks("a", "b", "c", "d"), 0);
    queue.setShuffle(true);

    queue.move(3, 1);
    queue.setShuffle(false);

    // Unshuffling still restores the order the queue was built in.
    expect(titles(queue)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("what crosses the IPC boundary (PLAYER-08)", () => {
  /** A queue the size PLAYER-05 allows, with realistic paths and titles. */
  function bigQueue(count: number): PlaybackQueue {
    const queue = new PlaybackQueue();
    queue.replace(
      Array.from({ length: count }, (_, index) => ({
        trackId: index,
        filePath: `C:/Users/dj/Music/Some Artist/Some Album/${index} - A Reasonably Long Track Title.flac`,
        title: `A Reasonably Long Track Title ${index}`,
        artist: `Some Artist With A Long Name ${index}`,
        key: "8A",
        bpm: 128,
        durationSeconds: 360,
      })),
      0,
    );
    return queue;
  }

  it("keeps the snapshot small however long the queue is", () => {
    // Measured before this step: a 50,000-track queue serialized to 14.5 MB,
    // pushed several times a second while a track plays — about 58 MB/s of IPC
    // for a panel showing twenty rows.
    const bytes = (queue: PlaybackQueue) =>
      Buffer.byteLength(JSON.stringify(queue.snapshot()), "utf8");

    const small = bytes(bigQueue(10));
    const huge = bytes(bigQueue(50_000));

    expect(huge).toBeLessThan(2_000);
    // Not merely "small": the same size, because length is a number either way.
    expect(huge).toBeLessThan(small * 1.2);
  });

  it("a window stays proportional to what was asked for", () => {
    const queue = bigQueue(50_000);
    const page = Buffer.byteLength(JSON.stringify(queue.window(0, 100)), "utf8");
    expect(page).toBeLessThan(60_000);
  });
});
