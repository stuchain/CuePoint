import { useNavigate } from "react-router-dom";
import { Badge, Button, Panel } from "../components";
import { toolOptions } from "../mocks/fixtures";
import "./screens.css";

export function ToolSelectionScreen() {
  const navigate = useNavigate();

  return (
    <div className="screen screen--center">
      <div className="screen__hero">
        <h1 className="screen__title">CuePoint</h1>
        <p className="screen__subtitle">Pick a tool to begin your library workflow.</p>
      </div>
      <div className="tool-grid">
        {toolOptions.map((tool) => (
          <Panel
            key={tool.id}
            title={tool.name}
            badge={!tool.available ? <Badge variant="warning">Soon</Badge> : undefined}
            variant={tool.id === "inkey" ? "default" : "alt"}
          >
            <p className="tool-card__desc">{tool.description}</p>
            <Button
              variant="primary"
              disabled={!tool.available}
              onClick={() => navigate(tool.id === "inkey" ? "/match" : "/incrate")}
            >
              Open {tool.name}
            </Button>
          </Panel>
        ))}
      </div>
    </div>
  );
}
