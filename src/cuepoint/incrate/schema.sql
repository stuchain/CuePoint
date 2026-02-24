-- inCrate inventory: one row per unique track (by track_key)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_key TEXT NOT NULL UNIQUE,
    track_id TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    remix_version TEXT DEFAULT '',
    label TEXT,
    beatport_track_id TEXT,
    beatport_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_artist ON inventory(artist);
CREATE INDEX IF NOT EXISTS idx_inventory_label ON inventory(label);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_track_key ON inventory(track_key);
