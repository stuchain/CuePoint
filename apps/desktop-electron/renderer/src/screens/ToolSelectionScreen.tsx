import { useNavigate } from "react-router-dom";
import { Badge, Button } from "../components";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import "./screens.css";

/**
 * Home. Matching is Clean's now (DEC-071), so the primary action opens Clean
 * rather than the retired inKey screen; inCrate stays a Tool until Phase 9.
 */
export function ToolSelectionScreen() {
  const navigate = useNavigate();
  const engineAvailable = hasEngineBridge();

  return (
    <div className="screen screen--center tool-landing">
      <div className="tool-landing__hero">
        <p className="tool-landing__brand">CuePoint</p>
        <h1 className="screen__title">Select a tool to get started</h1>
        <p className="screen__subtitle">
          Match your library to Beatport metadata, or explore crate workflows.
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
          onClick={() => navigate("/clean")}
        >
          <span className="tool-landing__primary-title">Clean</span>
          <span className="tool-landing__primary-desc">
            Match on Beatport, review matches and fix your library
          </span>
        </button>

        <PanelLikeTool
          title="inCrate"
          description="Discover and organize crate workflows (preview)."
          onOpen={() => navigate("/incrate")}
        />
      </div>
    </div>
  );
}

function PanelLikeTool({
  title,
  description,
  onOpen,
}: {
  title: string;
  description: string;
  onOpen: () => void;
}) {
  return (
    <div className="tool-landing__secondary">
      <div>
        <h2 className="tool-landing__secondary-title">{title}</h2>
        <p className="tool-landing__secondary-desc">{description}</p>
      </div>
      <Button variant="secondary" onClick={onOpen}>
        Open {title}
      </Button>
    </div>
  );
}
