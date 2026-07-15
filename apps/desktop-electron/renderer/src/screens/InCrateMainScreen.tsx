import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge, Panel } from "../components";
import "./screens.css";

const SECTIONS = [
  {
    id: "import",
    title: "Import",
    description: "Load Rekordbox collection XML and build inventory (mock).",
  },
  {
    id: "discover",
    title: "Discover",
    description: "Charts and new releases from Beatport (mock).",
  },
  {
    id: "playlist",
    title: "Playlist",
    description: "Create Beatport playlist from discovery results (mock).",
  },
] as const;

export function InCrateMainScreen() {
  useEffect(() => {
    document.body.classList.add("app-page-scroll");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("app-page-scroll");
  }, []);

  return (
    <div className="screen screen--stack screen--scroll">
      <header className="screen-toolbar">
        <Link to="/" className="screen-toolbar__brand">
          ← CuePoint / inCrate
        </Link>
        <Badge variant="warning">Stub — engine not wired</Badge>
      </header>

      <p className="screen__muted">
        Parity target: Qt <code>incrate_page.py</code> sections. See{" "}
        <code>docs/ui-overhaul/parity-matrix.md</code>.
      </p>

      {SECTIONS.map((section) => (
        <Panel key={section.id} title={section.title} id={section.id}>
          <p className="screen__muted">{section.description}</p>
        </Panel>
      ))}
    </div>
  );
}
