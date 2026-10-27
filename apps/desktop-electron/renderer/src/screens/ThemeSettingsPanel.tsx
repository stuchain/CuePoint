import { useEffect, useRef, useState } from "react";
import { Badge, Button, ConfirmDialog, Panel, Select, TextField, TrackContextMenu } from "../components";
import { PanelTools, SettingsActions, SettingsHint } from "./SettingsParts";
import { colorsInUse } from "./themeSeed";
import { deleteLabel, deleteLead, deleteTitle, opensDialog } from "../format/words";
import { SavedTick, useSavedSignal } from "../components/SavedTick";
import {
  createEmptyCustomTheme,
  type CustomTheme,
  type CustomThemeColors,
} from "../tokens/customThemes";
import { useScale } from "../tokens/ScaleContext";
import { DEFAULT_SCALE, scaleChoices, scaleName, screenAvailHeight, type ScaleFactor } from "../tokens/scale";
import { DEFAULT_THEME, isCustomThemeId, type ThemeId } from "../tokens/theme";
import { useTheme } from "../tokens/ThemeContext";
import { useKeyColours } from "../components/wheel/keyColourSetting";
import { saveKeyNotation, useKeyNotation } from "../components/wheel/keyNotationSetting";
import { useRowDensity } from "../tokens/rowDensity";
import { ResetToDefaults } from "./ResetToDefaults";
import { TableSettings } from "./TableSettings";
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

/** A colour written as #rrggbb (three digits are widened), or null when it is not one (M41). */
function parseHex(text: string): string | null {
  const bare = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(bare)) return `#${[...bare].map((c) => c + c).join("")}`.toLowerCase();
  return /^[0-9a-f]{6}$/i.test(bare) ? `#${bare}`.toLowerCase() : null;
}

/**
 * One colour: its name above, the app's own hex field and the swatch beside it (M41, D7 B). A code
 * can be typed or pasted; the swatch still opens the system colour dialog, which stays native.
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [touched, setTouched] = useState(false);
  // The swatch (or a reset) moved the colour: the text follows it.
  useEffect(() => setText(value), [value]);
  const valid = parseHex(text) !== null;
  return (
    <div className="theme-color-field">
      <TextField
        label={label}
        width="short"
        value={text}
        spellCheck={false}
        autoComplete="off"
        placeholder="#rrggbb"
        error={touched && !valid ? "Use six digits, like #1a1a2e" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          // Only a whole code applies while typing: a three-digit one is widened on leaving the field,
          // or "#ff0" on the way to "#ff0000" would rewrite itself under the cursor.
          if (/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) onChange(parseHex(e.target.value)!);
        }}
        onBlur={() => {
          setTouched(true);
          const hex = parseHex(text);
          if (hex) {
            setText(hex);
            onChange(hex);
          }
        }}
      />
      <input
        type="color"
        aria-label={`${label} swatch`}
        className="theme-color-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * One custom theme: its swatches and name, "In use" in place of Apply on the theme on screen, and
 * Edit and Delete in a "..." menu (M241), as a dig's card does.
 */
function ThemeRow({
  theme,
  inUse,
  onApply,
  onEdit,
  onDelete,
}: {
  theme: CustomTheme;
  inUse: boolean;
  onApply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <li className="theme-settings__row">
      <div className="theme-settings__swatches">
        {(["bgApp", "bgPanel", "accentPrimary"] as const).map((key) => (
          <span key={key} className="theme-settings__swatch" style={{ background: theme.colors[key] }} aria-hidden="true" />
        ))}
      </div>
      <span className="theme-settings__name">{theme.name}</span>
      <div className="theme-settings__row-actions">
        {inUse ? (
          <Badge variant="accent">In use</Badge>
        ) : (
          <Button variant="secondary" size="sm" onClick={onApply}>
            Apply
          </Button>
        )}
        <Button
          ref={anchor}
          variant="quiet"
          size="sm"
          iconOnly
          icon="more"
          aria-label={`More for ${theme.name}`}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={(event) => {
            if (menu) {
              setMenu(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom });
          }}
        />
      </div>
      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label={`${theme.name} actions`}
          anchor={anchor}
          onClose={() => setMenu(null)}
          items={[
            { id: "edit", label: opensDialog("Edit"), onSelect: onEdit },
            { id: "delete", label: opensDialog("Delete"), danger: true, onSelect: onDelete },
          ]}
        />
      )}
    </li>
  );
}

/** The size control's id: what the update note's Change size focuses (DEC-207). */
export const SIZE_FIELD_ID = "settings-ui-size";
const SIZE_HINT_ID = "settings-ui-size-hint";

/** "Large is too big" / "Large and Extra large are too big" / "Large, Huge and Extra large are too big". */
function tooBigNames(values: number[]): string {
  const names = values.map((value) => scaleName(value));
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]!;
  return `${list} ${names.length > 1 ? "are" : "is"} too big`;
}

export function ThemeSettingsPanel({ focusSizeToken = null }: { focusSizeToken?: string | null } = {}) {
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
  const sizes = scaleChoices(scale, screenAvailHeight());
  const tooBig = sizes.filter((size) => size.disabled);
  const [saved, markSaved] = useSavedSignal();
  const [density, setDensity] = useRowDensity();
  const [coloured, setColoured] = useKeyColours();
  const notation = useKeyNotation();
  // A link that asks for the size control gets it scrolled into view and focused, once.
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!focusSizeToken || focusedFor.current === focusSizeToken) return;
    focusedFor.current = focusSizeToken;
    const field = document.getElementById(SIZE_FIELD_ID);
    field?.scrollIntoView?.({ block: "center" });
    field?.focus();
  }, [focusSizeToken]);
  const [deleting, setDeleting] = useState<CustomTheme | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColors, setDraftColors] = useState<CustomThemeColors>(colorsInUse);
  // The app is previewed in the draft's colors only once one is changed: opening the editor must
  // not restyle anything.
  const [edited, setEdited] = useState(false);

  const seedFromActive = (): CustomThemeColors => {
    if (isCustomThemeId(activeThemeId)) {
      const bare = activeThemeId.slice("custom:".length);
      const found = customThemes.find((t) => t.id === bare);
      if (found) return { ...found.colors };
    }
    // A built-in theme: the colors it is drawn with now, so the draft starts as what is on screen.
    return colorsInUse();
  };

  const openCreate = () => {
    setEditingId(null);
    setDraftName("");
    setDraftColors(seedFromActive());
    setEdited(false);
    setEditorOpen(true);
  };

  const openEdit = (theme: CustomTheme) => {
    setEditingId(theme.id);
    setDraftName(theme.name);
    setDraftColors({ ...theme.colors });
    setEdited(false);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    endPreview();
  };

  useEffect(() => {
    if (editorOpen && edited) previewCustomColors(draftColors);
  }, [draftColors, edited, editorOpen, previewCustomColors]);

  const updateColor = (key: keyof CustomThemeColors, value: string) => {
    setEdited(true);
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
    markSaved();
  };

  const confirmDelete = () => {
    if (deleting) {
      deleteCustomTheme(deleting.id);
      // The theme being edited is gone: the editor goes with it.
      if (deleting.id === editingId) closeEditor();
    }
    setDeleting(null);
    markSaved();
  };

  // SET-11. A custom theme is not touched; only which theme and size are in use,
  // and the Tables choices (Compact rows, coloured keys, keys written as Camelot).
  const resetToDefaults = () => {
    const before = { theme: activeThemeId, scale, density, coloured, notation };
    setTheme(DEFAULT_THEME);
    setScale(DEFAULT_SCALE);
    setDensity("compact");
    setColoured(true);
    saveKeyNotation("camelot");
    markSaved();
    return () => {
      setTheme(before.theme);
      setScale(before.scale);
      setDensity(before.density);
      setColoured(before.coloured);
      saveKeyNotation(before.notation);
      markSaved();
    };
  };

  return (
    <Panel
      title="Appearance"
      badge={
        <PanelTools
          saved={<SavedTick signal={saved} />}
          reset={
            <ResetToDefaults
              section="Appearance"
              onReset={resetToDefaults}
              atDefaults={
                activeThemeId === DEFAULT_THEME &&
                scale === DEFAULT_SCALE &&
                density === "compact" &&
                coloured &&
                notation === "camelot"
              }
            />
          }
        />
      }
    >
      <div className="theme-settings">
        <Select
          label="Theme"
          width="standard"
          value={activeThemeId}
          onChange={(e) => {
            setTheme(e.target.value as ThemeId);
            markSaved();
          }}
          options={themeOptions.map((o) => ({ value: o.id, label: o.label }))}
        />

        <div className="settings-option">
          <Select
            id={SIZE_FIELD_ID}
            label="Size of text and controls"
            width="standard"
            value={String(scale)}
            onChange={(e) => {
              setScale(Number(e.target.value) as ScaleFactor);
              markSaved();
            }}
            aria-describedby={tooBig.length > 0 ? SIZE_HINT_ID : undefined}
            options={sizes.map((option) => ({
              value: String(option.value),
              label: option.label,
              disabled: option.disabled,
            }))}
          />
          {tooBig.length > 0 ? (
            <SettingsHint id={SIZE_HINT_ID}>
              {tooBigNames(tooBig.map((size) => size.value))} for this screen: not enough rows would
              fit in the Library.
            </SettingsHint>
          ) : null}
        </div>

        {customThemes.length > 0 && (
          <ul className="theme-settings__list">
            {customThemes.map((theme) => (
              <ThemeRow
                key={theme.id}
                theme={theme}
                inUse={activeThemeId === `custom:${theme.id}`}
                onApply={() => setTheme(`custom:${theme.id}`)}
                onEdit={() => openEdit(theme)}
                onDelete={() => setDeleting(theme)}
              />
            ))}
          </ul>
        )}

        {editorOpen ? (
          // Inline, on the page, so the live preview is seen undimmed and nothing can drop the
          // nine colours with a stray click (M239, M240).
          <section className="theme-editor" aria-label={editingId ? "Edit custom theme" : "Create custom theme"}>
            <h3 className="theme-editor__title cp-text-subhead">{editingId ? "Edit custom theme" : "Create custom theme"}</h3>
            <TextField
              label="Theme name"
              width="standard"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="My theme"
              autoFocus
            />
            <div className="theme-editor__colors">
              {COLOR_FIELDS.map(({ key, label }) => (
                <ColorField key={key} label={label} value={draftColors[key]} onChange={(v) => updateColor(key, v)} />
              ))}
            </div>
            <SettingsHint>Once you change a color, the app previews it live while you edit.</SettingsHint>
            <div className="theme-editor__footer">
              {editingId ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    const existing = customThemes.find((t) => t.id === editingId);
                    if (existing) setDeleting(existing);
                  }}
                >
                  {deleteLabel("theme") + "…"}
                </Button>
              ) : null}
              <span className="theme-editor__spacer" />
              <Button variant="secondary" onClick={closeEditor}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                Save theme
              </Button>
            </div>
          </section>
        ) : (
          <SettingsActions>
            <Button variant="secondary" onClick={openCreate}>
              Create custom theme…
            </Button>
          </SettingsActions>
        )}

        {customThemes.length === 0 && !editorOpen ? <SettingsHint>No custom themes yet.</SettingsHint> : null}

        <TableSettings onChange={markSaved} />
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={deleteTitle("theme", deleting?.name)}
        confirmLabel={deleteLabel("theme")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
        danger
      >
        {deleteLead}
      </ConfirmDialog>
    </Panel>
  );
}
