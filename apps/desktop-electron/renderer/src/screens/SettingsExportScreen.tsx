import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Modal, Panel, Select, TextField } from "../components";
import { useToast } from "../components";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import "./screens.css";

export function SettingsExportScreen() {
  const { push } = useToast();
  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState("csv");

  useEffect(() => {
    document.body.classList.add("app-page-scroll");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("app-page-scroll");
  }, []);

  return (
    <div className="screen screen--stack screen--scroll">
      <header className="screen-toolbar">
        <Link to="/match" className="screen-toolbar__brand">
          ← Back to inKey
        </Link>
      </header>

      <ThemeSettingsPanel />

      <Panel title="Settings">
        <div className="settings-form">
          <TextField label="Beatport token" type="password" placeholder="••••••••" hint="Stored locally in engine (mock)." />
          <Select
            label="Default export folder"
            value="downloads"
            options={[
              { value: "downloads", label: "Downloads" },
              { value: "desktop", label: "Desktop" },
              { value: "custom", label: "Custom…" },
            ]}
          />
        </div>
      </Panel>

      <Panel title="Export">
        <p className="screen__muted">Export matched metadata to CSV, JSON, or Excel.</p>
        <Button variant="primary" onClick={() => setExportOpen(true)}>
          Export results…
        </Button>
      </Panel>

      <Modal
        open={exportOpen}
        title="Export results"
        onClose={() => setExportOpen(false)}
        secondaryAction={{ label: "Cancel", onClick: () => setExportOpen(false) }}
        primaryAction={{
          label: "Export",
          onClick: () => {
            push(`Exported as ${format.toUpperCase()} (mock).`, "success");
            setExportOpen(false);
          },
        }}
      >
        <Select
          label="Format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          options={[
            { value: "csv", label: "CSV" },
            { value: "json", label: "JSON" },
            { value: "xlsx", label: "Excel (.xlsx)" },
          ]}
        />
        <TextField label="Filename prefix" defaultValue="cuepoint-export" />
      </Modal>
    </div>
  );
}
