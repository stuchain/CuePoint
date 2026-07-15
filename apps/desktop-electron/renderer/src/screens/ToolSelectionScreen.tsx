import { useNavigate } from "react-router-dom";
import { Badge, Button } from "../components";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { toolOptions } from "../mocks/fixtures";
import "./screens.css";

export function ToolSelectionScreen() {
  const navigate = useNavigate();
  const engineAvailable = hasEngineBridge();
  const inKey = toolOptions.find((tool) => tool.id === "inkey");
  const inCrate = toolOptions.find((tool) => tool.id === "incrate");

  return (
    <div className="screen screen--center tool-landing">
      <div className="tool-landing__hero">
        <p className="tool-landing__brand">CuePoint</p>
        <h1 className="screen__title">Select a tool to get started</h1>
        <p className="screen__subtitle">
          Match Rekordbox playlists to Beatport metadata, or explore crate workflows.
        </p>
        {engineAvailable ? (
          <Badge variant="success">Engine connected</Badge>
        ) : (
          <Badge variant="warning">Browser lab mode</Badge>
        )}
      </div>

      <div className="tool-landing__actions">
        <button
          type="button"
          className="tool-landing__primary"
          onClick={() => navigate("/match")}
        >
          <span className="tool-landing__primary-title">{inKey?.name ?? "inKey"}</span>
          <span className="tool-landing__primary-desc">Beatport track matching</span>
        </button>

        {inCrate && (
          <PanelLikeTool
            title={inCrate.name}
            description={inCrate.description}
            disabled={!inCrate.available}
            onOpen={() => navigate("/incrate")}
          />
        )}
      </div>
    </div>
  );
}

function PanelLikeTool({
  title,
  description,
  disabled,
  onOpen,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="tool-landing__secondary">
      <div>
        <h2 className="tool-landing__secondary-title">{title}</h2>
        <p className="tool-landing__secondary-desc">{description}</p>
      </div>
      <Button variant="secondary" disabled={disabled} onClick={onOpen}>
        Open {title}
      </Button>
    </div>
  );
}
