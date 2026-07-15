import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Panel, TextField, useToast } from "../components";
import type { IncrateInventoryResponse } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import "./screens.css";

const SECTIONS = [
  {
    id: "import",
    title: "Import",
    description: "Load Rekordbox collection XML into the inCrate inventory database.",
  },
  {
    id: "discover",
    title: "Discover",
    description: "Charts and new releases from Beatport (not wired yet).",
  },
  {
    id: "playlist",
    title: "Playlist",
    description: "Create Beatport playlist from discovery results (not wired yet).",
  },
] as const;

export function InCrateMainScreen() {
  const { push } = useToast();
  const engineAvailable = hasEngineBridge();
  const [inventory, setInventory] = useState<IncrateInventoryResponse | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preferLive, setPreferLive] = useState(false);

  useEffect(() => {
    document.body.classList.add("app-page-scroll");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("app-page-scroll");
  }, []);

  const loadInventory = useCallback(
    async (options?: { live?: boolean }) => {
      if (!window.cuepoint?.getIncrateInventory) {
        setInventory(null);
        return;
      }
      const live = options?.live ?? preferLive;
      setLoading(true);
      try {
        const payload = await window.cuepoint.getIncrateInventory({
          limit: 25,
          search: search.trim() || undefined,
          demo: !search.trim() && !live,
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

  useEffect(() => {
    if (engineAvailable) {
      void loadInventory();
    }
  }, [engineAvailable, loadInventory]);

  const handleImport = async () => {
    if (!window.cuepoint?.openXmlFileDialog || !window.cuepoint.importIncrateXml) {
      push("Import requires the Electron app with engine connected.", "warning");
      return;
    }
    const picked = await window.cuepoint.openXmlFileDialog();
    if (picked.canceled) return;

    setImporting(true);
    try {
      const result = await window.cuepoint.importIncrateXml({
        xml_path: picked.filePath,
        enrich: false,
      });
      push(
        `Imported ${result.imported ?? 0} tracks${result.enriched ? `, enriched ${result.enriched}` : ""}.`,
        "success",
      );
      setPreferLive(true);
      await loadInventory({ live: true });
    } catch (error) {
      push(error instanceof Error ? error.message : "Import failed", "warning");
    } finally {
      setImporting(false);
    }
  };

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

      <p className="screen__muted">
        Parity target: Qt <code>incrate_page.py</code> sections. Inventory loads from{" "}
        <code>GET /api/v1/incrate/inventory</code>.
      </p>

      {SECTIONS.map((section) => (
        <Panel key={section.id} title={section.title} id={section.id}>
          <p className="screen__muted">{section.description}</p>
          {section.id === "import" && (
            <div className="match-actions">
              <Button variant="primary" loading={importing} onClick={() => void handleImport()}>
                Import collection XML…
              </Button>
              <Button
                variant="secondary"
                loading={loading}
                onClick={() => {
                  setPreferLive(true);
                  void loadInventory({ live: true });
                }}
              >
                Refresh inventory
              </Button>
            </div>
          )}
        </Panel>
      ))}

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
    </div>
  );
}
