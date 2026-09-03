# RB-RELINK-NOT-REMOVED — a renumbered track must never preview as a deletion

## What this protects

Rekordbox reassigns `TrackID`s when its database is rebuilt or repaired. Every
track in the collection can come back with a different id while pointing at the
same file on disk. DEC-002 exists for exactly this: the library re-links those
tracks by normalized path, so the tags, ratings and Collection membership
attached to them survive.

The refresh preview (DEC-032) has to describe that correctly. If it classified a
re-linked track as **removed** — and its replacement as **added** — then:

- the preview would tell the user that most of their library is about to be
  deleted, which is alarming and false; and
- if they confirmed it anyway, DEC-003's deletion is irreversible.

The failure is quiet in the other direction too. A preview that says "3,879
removed, 3,880 added" *looks* like a lot of change and might simply be believed,
because a Rekordbox rebuild really did happen.

## Why it is easy to reintroduce

The obvious way to write a diff is to compare the two sets of `TrackID`s. That
is one line, it is correct for every other category, and it is wrong only here.
Anything that resolves identity by id alone — a rewrite, an optimization, a
"simplification" of the snapshot — brings the bug back.

The other way to break it is subtler: resolving identity against the *live*
table instead of a snapshot taken before the comparison, so a row matched once
can be matched again and the counts drift.

## How it was found

Not by a bug report — by the specification. LIBRARY-07 named the removed-versus-
re-linked distinction as "where irreversible deletion meets identity" and asked
for a regression test written to fail first. This one does: run it against a
diff that compares `TrackID`s and it reports removals and additions instead of
re-links.

## The shape that matters

A collection where *every* id changed and no file moved. The correct answer is:
nothing added, nothing removed, everything re-linked, and — because the same
tracks are still in the same playlists — no playlist reported as edited either.
