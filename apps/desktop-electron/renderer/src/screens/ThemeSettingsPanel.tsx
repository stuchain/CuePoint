import { useEffect, useState } from "react";
import { Badge, Button, Modal, Panel, Select, TextField } from "../components";
import {
  createEmptyCustomTheme,
  NEO_DARK_EDITOR_COLORS,
  type CustomTheme,
  type CustomThemeColors,
} from "../tokens/customThemes";
import { useScale } from "../tokens/ScaleContext";
import type { ScaleFactor } from "../tokens/scale";
import { isCustomThemeId } from "../tokens/theme";
import { useTheme } from "../tokens/ThemeContext";
import "./theme-settings.css";

const COLOR_FIELDS: { key: keyof CustomThemeColors; label: string }[] = [
  { key: "bgApp", label: "App background" },
  { key: "bgPanel", label: "Panel background" },
  { key: "bgInput", label: "Input background" },
  { key: "fgPrimary", label: "Primary text" },
  { key: "fgMuted", label: "Muted text" },
  { key: "accentPrimary", label: "Accent" },
  { key: "accentSuccess", label: "Success" },
  { key: "accentWarning", label: "Warning" },
  { key: "accentDanger", label: "Danger" },
];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="theme-color-field">
      <span className="theme-color-field__label">{label}</span>
      <input
        type="color"
        className="theme-color-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="theme-color-field__hex">{value}</span>
    </label>
  );
}

export function ThemeSettingsPanel() {
  const {
    activeThemeId,
    themeOptions,
    customThemes,
    setTheme,
    saveCustomTheme,
    deleteCustomTheme,
    previewCustomColors,
    endPreview,
  } = useTheme();
  const { scale, setScale } = useScale();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColors, setDraftColors] = useState<CustomThemeColors>(NEO_DARK_EDITOR_COLORS);

  const seedFromActive = (): CustomThemeColors => {
    if (isCustomThemeId(activeThemeId)) {
      const bare = activeThemeId.slice("custom:".length);
      const found = customThemes.find((t) => t.id === bare);
      if (found) return { ...found.colors };
    }
    return { ...NEO_DARK_EDITOR_COLORS };
  };

  const openCreate = () => {
    setEditingId(null);
    setDraftName("");
    setDraftColors(seedFromActive());
    setEditorOpen(true);
  };

  const openEdit = (theme: CustomTheme) => {
    setEditingId(theme.id);
    setDraftName(theme.name);
    setDraftColors({ ...theme.colors });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    endPreview();
  };

  useEffect(() => {
    if (editorOpen) previewCustomColors(draftColors);
  }, [draftColors, editorOpen, previewCustomColors]);

  const updateColor = (key: keyof CustomThemeColors, value: string) => {
    setDraftColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const name = draftName.trim() || "My theme";
    if (editingId) {
      const existing = customThemes.find((t) => t.id === editingId);
      if (existing) {
        saveCustomTheme({
          ...existing,
          name,
          colors: draftColors,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      saveCustomTheme(createEmptyCustomTheme(name, draftColors));
    }
    closeEditor();
  };

  return (
    <Panel title="Appearance" badge={<Badge variant="info">Themes</Badge>}>
      <div className="theme-settings">
        <Select
          label="Active theme"
          value={activeThemeId}
          onChange={(e) => setTheme(e.target.value as typeof activeThemeId)}
          options={themeOptions.map((o) => ({ value: o.id, label: o.label }))}
        />

        <Select
          label="UI scale"
          value={String(scale)}
          onChange={(e) => setScale(Number(e.target.value) as ScaleFactor)}
          options={[
            { value: "1", label: "1× (compact)" },
            { value: "2", label: "2× (default)" },
            { value: "3", label: "3× (large)" },
          ]}
        />

        <div className="theme-settings__actions">
          <Button variant="primary" onClick={openCreate}>
            Create custom theme…
          </Button>
        </div>

        {customThemes.length > 0 ? (
          <ul className="theme-settings__list">
            {customThemes.map((theme) => (
              <li key={theme.id} className="theme-settings__row">
                <div className="theme-settings__swatches">
                  {(["bgApp", "bgPanel", "accentPrimary"] as const).map((key) => (
                    <span
                      key={key}
                      className="theme-settings__swatch"
                      style={{ background: theme.colors[key] }}
                      title={key}
                    />
                  ))}
                </div>
                <span className="theme-settings__name">{theme.name}</span>
                <div className="theme-settings__row-actions">
                  <Button variant="secondary" onClick={() => setTheme(`custom:${theme.id}`)}>
                    Apply
                  </Button>
                  <Button variant="secondary" onClick={() => openEdit(theme)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => deleteCustomTheme(theme.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="theme-settings__hint">
            No custom themes yet. Create one with eight colors — borders and bevels are derived
            automatically.
          </p>
        )}
      </div>

      <Modal
        open={editorOpen}
        title={editingId ? "Edit custom theme" : "Create custom theme"}
        onClose={closeEditor}
        secondaryAction={{ label: "Cancel", onClick: closeEditor }}
        primaryAction={{ label: "Save theme", onClick: handleSave }}
      >
        <div className="theme-editor">
          <TextField
            label="Theme name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="My theme"
          />
          <div className="theme-editor__colors">
            {COLOR_FIELDS.map(({ key, label }) => (
              <ColorField
                key={key}
                label={label}
                value={draftColors[key]}
                onChange={(v) => updateColor(key, v)}
              />
            ))}
          </div>
          <p className="theme-settings__hint">Changes preview live across the app while this dialog is open.</p>
        </div>
      </Modal>
    </Panel>
  );
}
