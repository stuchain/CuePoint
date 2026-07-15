import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Panel, TextField, useToast } from "../components";
import type {
  IncrateDiscoverOptions,
  IncrateDiscoverTrack,
  IncrateInventoryResponse,
} from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { useFileDrop } from "../hooks/useFileDrop";
import "./screens.css";

export function InCrateMainScreen() {
  const { push } = useToast();
  const engineAvailable = hasEngineBridge();
  const [inventory, setInventory] = useState<IncrateInventoryResponse | null>(null);
  const [options, setOptions] = useState<IncrateDiscoverOptions | null>(null);
  const [discovered, setDiscovered] = useState<IncrateDiscoverTrack[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [xmlPath, setXmlPath] = useState("");
  const [enrichLabels, setEnrichLabels] = useState(true);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [preferLive, setPreferLive] = useState(false);
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);
  const [chartsFrom, setChartsFrom] = useState("");
  const [chartsTo, setChartsTo] = useState("");
  const [newReleasesDays, setNewReleasesDays] = useState("30");
  const [playlistName, setPlaylistName] = useState("feb26");
  const [playlistStatus, setPlaylistStatus] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("app-page-scroll");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("app-page-scroll");
  }, []);

  const loadInventory = useCallback(
    async (live?: boolean) => {
      if (!window.cuepoint?.getIncrateInventory) {
        setInventory(null);
        return;
      }
      const useLive = live ?? preferLive;
      setLoading(true);
      try {
        const payload = await window.cuepoint.getIncrateInventory({
          limit: 25,
          search: search.trim() || undefined,
          demo: !search.trim() && !useLive,
        });
        setInventory(payload);
      } catch (error) {
        push(error instanceof Error ? error.message : "Failed to load inventory", "warning");
      } finally {
        setLoading(false);
      }
    },
    [preferLive, push, search],
  );

  const loadDiscoverOptions = useCallback(async () => {
    if (!window.cuepoint?.getIncrateDiscoverOptions) {
      setOptions(null);
      return;
    }
    try {
      const payload = await window.cuepoint.getIncrateDiscoverOptions();
      setOptions(payload);
      setChartsFrom(payload.defaults.charts_from);
      setChartsTo(payload.defaults.charts_to);
      setNewReleasesDays(String(payload.defaults.new_releases_days));
      if (payload.genres.length > 0 && selectedGenreIds.length === 0) {
        setSelectedGenreIds([payload.genres[0].id]);
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "Failed to load discover options", "warning");
    }
  }, [push, selectedGenreIds.length]);

  useEffect(() => {
    if (engineAvailable) {
      void loadInventory();
      void loadDiscoverOptions();
    }
  }, [engineAvailable, loadDiscoverOptions, loadInventory]);

  const handleBrowse = async () => {
    if (!window.cuepoint?.openXmlFileDialog) {
      push("Browse requires the Electron app.", "warning");
      return;
    }
    const picked = await window.cuepoint.openXmlFileDialog();
    if (picked.canceled) return;
    setXmlPath(picked.filePath);
    setImportStatus(null);
  };

  const handleImport = async () => {
    if (!window.cuepoint?.importIncrateXml) {
      push("Import requires the Electron app with engine connected.", "warning");
      return;
    }
    if (!xmlPath.trim()) {
      push("Select a Rekordbox XML file first.", "warning");
      return;
    }

    setImporting(true);
    setImportStatus("Parsing XML and importing tracks…");
    try {
      const result = await window.cuepoint.importIncrateXml({
        xml_path: xmlPath.trim(),
        enrich: enrichLabels,
      });
      const errors = result.errors ?? [];
      if (errors.length > 0) {
        setImportStatus(errors[0] ?? "Import completed with errors.");
        push(errors[0] ?? "Import completed with errors.", "warning");
      } else {
        const summary = `Imported ${result.imported ?? 0} tracks${
          enrichLabels && result.enriched ? `, enriched ${result.enriched} labels` : ""
        }.`;
        setImportStatus(summary);
        push(summary, "success");
      }
      setPreferLive(true);
      await loadInventory(true);
      await loadDiscoverOptions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setImportStatus(message);
      push(message, "warning");
    } finally {
      setImporting(false);
    }
  };

  const handleResetInventory = async () => {
    if (!window.cuepoint?.resetIncrateInventory) {
      push("Reset requires the Electron app with engine connected.", "warning");
      return;
    }
    const confirmed = window.confirm(
      "Clear all inCrate inventory? You can then import a different collection.xml.",
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      await window.cuepoint.resetIncrateInventory();
      setDiscovered([]);
      setPlaylistStatus(null);
      setImportStatus("Inventory cleared.");
      setPreferLive(true);
      await loadInventory(true);
      await loadDiscoverOptions();
      push("Inventory reset.", "info");
    } catch (error) {
      push(error instanceof Error ? error.message : "Reset failed", "warning");
    } finally {
      setResetting(false);
    }
  };

  const inventoryStatsLabel = useMemo(() => {
    if (options && options.inventory_stats.total > 0) {
      return `${options.inventory_stats.total} tracks · ${options.artists.length} artists · ${options.labels.length} labels`;
    }
    if (inventory?.demo) {
      return "Demo inventory loaded — import a collection for live data.";
    }
    return "No inventory yet. Import Rekordbox XML first.";
  }, [inventory?.demo, options]);

  const applyDroppedXml = useCallback(
    (path: string) => {
      setXmlPath(path);
      setImportStatus(null);
      push("Collection XML dropped.", "success");
    },
    [push],
  );

  const { dragOver: importDragOver, dropHandlers: importDropHandlers } = useFileDrop({
    kind: "xml",
    onFile: applyDroppedXml,
    onError: (message) => push(message, "warning"),
    disabled: importing,
  });

  const toggleGenre = (genreId: number) => {
    setSelectedGenreIds((current) =>
      current.includes(genreId) ? current.filter((id) => id !== genreId) : [...current, genreId],
    );
  };

  const handleDiscover = async (demo = false) => {
    if (!window.cuepoint?.runIncrateDiscover) {
      push("Discover requires the Electron app with engine connected.", "warning");
      return;
    }
    setDiscovering(true);
    setPlaylistStatus(null);
    try {
      const payload = await window.cuepoint.runIncrateDiscover(
        demo
          ? { demo: true }
          : {
              genre_ids: selectedGenreIds,
              charts_from: chartsFrom,
              charts_to: chartsTo,
              new_releases_days: Number.parseInt(newReleasesDays, 10) || 30,
            },
      );
      setDiscovered(payload.tracks);
      push(
        demo
          ? `Loaded ${payload.count} demo discovery tracks.`
          : `Discovery found ${payload.count} tracks.`,
        "success",
      );
    } catch (error) {
      push(error instanceof Error ? error.message : "Discovery failed", "warning");
    } finally {
      setDiscovering(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!window.cuepoint?.createIncratePlaylist) {
      push("Playlist creation requires the Electron app with engine connected.", "warning");
      return;
    }
    if (!discovered.length) {
      push("Run discovery first.", "warning");
      return;
    }
    const name = playlistName.trim();
    if (!name) {
      push("Enter a playlist name.", "warning");
      return;
    }
    setCreatingPlaylist(true);
    setPlaylistStatus(null);
    try {
      const result = await window.cuepoint.createIncratePlaylist({
        name,
        tracks: discovered,
      });
      if (result.success) {
        const message = result.playlist_url
          ? `Added ${result.added_count} tracks. ${result.playlist_url}`
          : `Added ${result.added_count} tracks to playlist.`;
        setPlaylistStatus(message);
        push(message, "success");
      } else {
        const message = result.error ?? "Playlist creation failed.";
        setPlaylistStatus(message);
        push(message, "warning");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Playlist creation failed.";
      setPlaylistStatus(message);
      push(message, "warning");
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const canDiscover = useMemo(() => {
    if (!engineAvailable) return false;
    if (!options) return true;
    return options.inventory_stats.total > 0 || inventory?.demo;
  }, [engineAvailable, inventory?.demo, options]);

  return (
    <div className="screen screen--stack screen--scroll">
      <header className="screen-toolbar">
        <Link to="/" className="screen-toolbar__brand">
          ← CuePoint / inCrate
        </Link>
        <Badge variant={engineAvailable ? "success" : "warning"}>
          {engineAvailable ? "Engine connected" : "Browser mock"}
        </Badge>
      </header>

      <Panel title="Import" id="import">
        <p className="screen__muted">Load Rekordbox collection XML into the inCrate inventory database.</p>
        <div
          className={`drop-zone drop-zone--compact ${importDragOver ? "drop-zone--active" : ""}`}
          {...importDropHandlers}
        >
          <p>Drop Rekordbox collection XML here</p>
        </div>
        <TextField
          label="Collection XML"
          value={xmlPath}
          onChange={(event) => setXmlPath(event.target.value)}
          hint="Browse or paste the path to your Rekordbox export."
        />
        <label className="incrate-import-option">
          <input
            type="checkbox"
            checked={enrichLabels}
            onChange={(event) => setEnrichLabels(event.target.checked)}
          />
          Enrich empty labels via Beatport (requires token in Settings)
        </label>
        <div className="match-actions">
          <Button variant="secondary" disabled={importing} onClick={() => void handleBrowse()}>
            Browse…
          </Button>
          <Button
            variant="primary"
            loading={importing}
            disabled={!xmlPath.trim()}
            onClick={() => void handleImport()}
          >
            Import
          </Button>
          <Button
            variant="secondary"
            loading={resetting}
            disabled={importing}
            onClick={() => void handleResetInventory()}
          >
            Reset database
          </Button>
          <Button
            variant="secondary"
            loading={loading}
            onClick={() => {
              setPreferLive(true);
              void loadInventory(true);
            }}
          >
            Refresh inventory
          </Button>
        </div>
        {importing ? (
          <p className="screen__muted">{importStatus ?? "Importing…"}</p>
        ) : importStatus ? (
          <p className="screen__muted">{importStatus}</p>
        ) : null}
        <p className="screen__muted">{inventoryStatsLabel}</p>
      </Panel>

      <Panel
        title="Discover"
        id="discover"
        badge={
          options ? (
            <Badge variant={options.token_configured ? "success" : "warning"}>
              {options.token_configured ? "Token configured" : "Token missing"}
            </Badge>
          ) : undefined
        }
      >
        <p className="screen__muted">
          Charts and new releases from Beatport. Requires imported inventory and Beatport token.
        </p>
        {options ? (
          <div className="settings-form">
            <TextField label="Charts from" value={chartsFrom} onChange={(e) => setChartsFrom(e.target.value)} />
            <TextField label="Charts to" value={chartsTo} onChange={(e) => setChartsTo(e.target.value)} />
            <TextField
              label="New releases (days)"
              value={newReleasesDays}
              onChange={(e) => setNewReleasesDays(e.target.value)}
            />
            {options.genres.length > 0 ? (
              <div>
                <p className="screen__muted">Genres</p>
                <div className="match-actions">
                  {options.genres.slice(0, 8).map((genre) => (
                    <Button
                      key={genre.id}
                      variant={selectedGenreIds.includes(genre.id) ? "primary" : "secondary"}
                      onClick={() => toggleGenre(genre.id)}
                    >
                      {genre.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="screen__muted">Configure Beatport token in Settings to load genres.</p>
            )}
          </div>
        ) : null}
        <div className="match-actions">
          <Button
            variant="primary"
            loading={discovering}
            disabled={!canDiscover}
            onClick={() => void handleDiscover(false)}
          >
            Run discovery
          </Button>
          <Button variant="secondary" loading={discovering} onClick={() => void handleDiscover(true)}>
            Demo discovery
          </Button>
        </div>
      </Panel>

      <Panel title="Playlist" id="playlist">
        <p className="screen__muted">Create a Beatport playlist from discovery results.</p>
        <div className="settings-form">
          <TextField
            label="Playlist name"
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
            placeholder="feb26"
          />
        </div>
        <div className="match-actions">
          <Button
            variant="primary"
            loading={creatingPlaylist}
            disabled={!discovered.length}
            onClick={() => void handleCreatePlaylist()}
          >
            Add to playlist
          </Button>
        </div>
        {playlistStatus ? <p className="screen__muted">{playlistStatus}</p> : null}
      </Panel>

      <Panel
        title="Inventory preview"
        badge={
          inventory ? (
            <Badge variant="info">
              {inventory.stats.total} tracks · {inventory.rows.length} shown
              {inventory.demo ? " · demo" : ""}
            </Badge>
          ) : undefined
        }
      >
        {engineAvailable ? (
          <>
            <TextField
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              hint="Leave empty to load demo rows until you import a collection."
            />
            {loading ? (
              <p className="screen__muted">Loading…</p>
            ) : inventory?.rows.length ? (
              <ul className="incrate-inventory-list">
                {inventory.rows.map((row) => (
                  <li key={row.id}>
                    <strong>{row.artist}</strong> — {row.title}
                    {row.label ? ` · ${row.label}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="screen__muted">No inventory rows yet. Import a collection or use demo data.</p>
            )}
          </>
        ) : (
          <p className="screen__muted">Open in Electron to load inventory from the engine.</p>
        )}
      </Panel>

      <Panel
        title="Discovery results"
        badge={
          discovered.length ? <Badge variant="info">{discovered.length} tracks</Badge> : undefined
        }
      >
        {discovered.length ? (
          <ul className="incrate-inventory-list">
            {discovered.map((track) => (
              <li key={`${track.beatport_track_id}-${track.title}`}>
                <strong>{track.artists}</strong> — {track.title}
                <span className="screen__muted"> · {track.source_type}: {track.source_name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="screen__muted">Run discovery to populate tracks for playlist creation.</p>
        )}
      </Panel>
    </div>
  );
}
