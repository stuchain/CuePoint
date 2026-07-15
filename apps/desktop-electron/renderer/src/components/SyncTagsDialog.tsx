import { useEffect, useState } from "react";
import { Modal, TextField } from "../components";
import type { SyncKeyFormat, SyncTagsOptions } from "../api/syncTagsUtils";
import { loadSyncOptions, saveSyncOptions } from "../api/syncTagsUtils";
import "./SyncTagsDialog.css";

export interface SyncTagsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: SyncTagsOptions) => void;
  loading?: boolean;
}

export function SyncTagsDialog({ open, onClose, onConfirm, loading = false }: SyncTagsDialogProps) {
  const [options, setOptions] = useState<SyncTagsOptions>(() => loadSyncOptions());

  useEffect(() => {
    if (open) setOptions(loadSyncOptions());
  }, [open]);

  if (!open) return null;

  const setKeyFormat = (key_format: SyncKeyFormat) => {
    setOptions((prev) => ({ ...prev, key_format }));
  };

  const handleConfirm = () => {
    saveSyncOptions(options);
    onConfirm(options);
  };

  return (
    <Modal
      open={open}
      title="Sync with Rekordbox"
      onClose={onClose}
      primaryAction={{ label: "Sync", onClick: handleConfirm, loading }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="sync-tags-dialog">
        <fieldset className="sync-tags-dialog__group">
          <legend>Key format</legend>
          <label className="sync-tags-dialog__radio">
            <input
              type="radio"
              name="key-format"
              checked={options.key_format === "normal"}
              onChange={() => setKeyFormat("normal")}
            />
            Normal (e.g. Am, G, C#m)
          </label>
          <label className="sync-tags-dialog__radio">
            <input
              type="radio"
              name="key-format"
              checked={options.key_format === "camelot"}
              onChange={() => setKeyFormat("camelot")}
            />
            Camelot (e.g. 8A, 12B)
          </label>
          <label className="sync-tags-dialog__radio">
            <input
              type="radio"
              name="key-format"
              checked={options.key_format === "short"}
              onChange={() => setKeyFormat("short")}
            />
            Short (e.g. Amin, Gmaj)
          </label>
        </fieldset>

        <fieldset className="sync-tags-dialog__group">
          <legend>Tags to write</legend>
          {(
            [
              ["write_key", "Key"],
              ["write_year", "Release year"],
              ["write_bpm", "BPM"],
              ["write_label", "Label"],
              ["write_genre", "Genre"],
              ["write_comment", "Comment"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="sync-tags-dialog__check">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(event) =>
                  setOptions((prev) => ({ ...prev, [key]: event.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </fieldset>

        <TextField
          label="Comment text"
          value={options.comment_text}
          onChange={(event) =>
            setOptions((prev) => ({ ...prev, comment_text: event.target.value }))
          }
          hint="Written when Comment is enabled."
        />
      </div>
    </Modal>
  );
}
