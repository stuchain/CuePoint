# inCrate

inCrate is CuePoint’s second tool: a music-digging workflow that uses your Rekordbox collection to discover new music on Beatport and build a Beatport playlist.

## What inCrate does

1. **Inventory** — Build a queryable index from your full Rekordbox collection (artist, title, remix/version, label). Optionally enrich missing labels using the same Beatport matching flow as inKey.
2. **Charts** — Discover Beatport genre charts published in the past month where the chart author is one of your library artists, and add whole charts to a playlist.
3. **New releases** — For each label in your inventory, find releases from the last 30 days on Beatport and add them to the same playlist.
4. **Beatport playlist** — Create or use a Beatport playlist per run (e.g. date-based name like `feb26` or `2025-02-26`) and add discovered tracks to it.

## Where it lives in the app

From the CuePoint start screen you can choose **inKey** (metadata enrichment) or **inCrate** (inventory and discovery). inCrate uses its own UI flow: inventory, discovery (charts + new releases), and playlist creation.

## Implementation and design

- **Requirements and decisions:** [inCrate spec](../incrate-spec.md)
- **Implementation order and detailed design:** [Feature implementation designs (inCrate)](../feature/README.md) — phases 1–5 (inventory, Beatport API, discovery, playlist/auth, UI).

Core code areas: `src/cuepoint/incrate/` (inventory, discovery, playlist writer, enrichment), `InventoryService`, `IncrateDiscoveryService`, Beatport API client and playlist auth as described in the spec and feature docs.
