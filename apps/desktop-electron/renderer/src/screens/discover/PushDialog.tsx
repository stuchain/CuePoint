/**
 * "Make a playlist on Beatport", or add to one (DISCOVER-10, DEC-099, DSC-7).
 *
 * Makes a new playlist on the user's Beatport account, or (where the caller
 * allows it) adds to one they already have, and adds the tracks, as work the
 * status strip follows. The dialog asks only what it needs: the name, defaulted
 * to the engine's, or which playlist, and whether tracks already in the library
 * go too — by default they do not, since buying one twice is the mistake a
 * wantlist exists to prevent (DEC-092).
 *
 * A refusal — no token, too many tracks, a name too long, a playlist already
 * being made — is shown here in the engine's words, and the dialog stays open,
 * so the person can change what was refused rather than start again.
 */
import { useEffect, useState } from "react";

import type { BeatportPlaylistChoice, DiscoverRefusal } from "../../api/cuepointBridge.types";
import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import { refusalText } from "./discoverFormat";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

/** Where the tracks go: a new playlist by name, or one that exists. */
export type PushTarget = { name: string } | { name: string; playlistId: string };

interface PushDialogProps {
  open: boolean;
  /**
   * What goes in the playlist, as a phrase: "the 3 selected tracks". A function
   * when it depends on whether tracks already in the library go too.
   */
  what: string | ((includeOwned: boolean) => string);
  defaultName: string;
  maxNameLength: number;
  /** Offer the user's existing Beatport playlists too. */
  allowExisting?: boolean;
  onPush: (target: PushTarget, includeOwned: boolean) => Promise<DiscoverRefusal | null>;
  onClose: () => void;
}

type Mode = "new" | "existing";

export function PushDialog({
  open,
  what,
  defaultName,
  maxNameLength,
  allowExisting = false,
  onPush,
  onClose,
}: PushDialogProps) {
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState(defaultName);
  const [includeOwned, setIncludeOwned] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // null: not read yet (or not asked for); the playlists the account has otherwise.
  const [playlists, setPlaylists] = useState<BeatportPlaylistChoice[] | null>(null);
  const [playlistsNote, setPlaylistsNote] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("new");
    setName(defaultName);
    setIncludeOwned(false);
    setRefusal(null);
    setPushing(false);
    setPlaylistId("");
  }, [defaultName, open]);

  // The playlists are read when the dialog opens, and only when it offers them.
  useEffect(() => {
    if (!open || !allowExisting) return;
    const bridge = window.cuepoint?.getBeatportPlaylists;
    if (!bridge) {
      setPlaylists([]);
      return;
    }
    let current = true;
    setPlaylists(null);
    setPlaylistsNote(null);
    void bridge()
      .then((answer) => {
        if (!current) return;
        if (answer.refusal) {
          setPlaylists([]);
          setPlaylistsNote(refusalText(answer.refusal));
        } else {
          setPlaylists(answer.value.playlists);
        }
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (!current) return;
        setPlaylists([]);
        setPlaylistsNote(userMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [allowExisting, open]);

  const whatText = typeof what === "function" ? what(includeOwned) : what;
  const trimmed = name.trim();
  const tooLong = trimmed.length > maxNameLength;
  const chosen = playlists?.find((playlist) => playlist.id === playlistId) ?? null;
  const ready = mode === "new" ? trimmed !== "" && !tooLong : chosen !== null;

  const push = async () => {
    setPushing(true);
    setRefusal(null);
    try {
      const target: PushTarget =
        mode === "existing" && chosen ? { name: chosen.name, playlistId: chosen.id } : { name: trimmed };
      const refused = await onPush(target, includeOwned);
      if (refused) setRefusal(refusalText(refused));
    } catch (cause) {
      reportUnexpected(cause);
      setRefusal(userMessage(cause));
    } finally {
      setPushing(false);
    }
  };

  return (
    <Modal
      open={open}
      title={mode === "existing" ? "Add to a playlist on Beatport" : "Make a playlist on Beatport"}
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{
        label: mode === "existing" ? "Add to playlist" : "Make playlist",
        onClick: () => void push(),
        loading: pushing,
        disabled: !ready,
      }}
    >
      <div className="discover-dialog">
        <p className="discover-dialog__text">
          {mode === "existing"
            ? `Adds ${whatText} to a playlist you already have on Beatport, in the order shown.`
            : `Makes a new playlist on your Beatport account with ${whatText}, in the order shown. Each time makes another new playlist.`}
        </p>
        {allowExisting && (
          <fieldset className="discover-dialog__choice">
            <legend className="cp-field__label">Add to</legend>
            <label className="discover-dialog__check">
              <input
                type="radio"
                name="discover-push-mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
              />
              A new playlist
            </label>
            <label className="discover-dialog__check">
              <input
                type="radio"
                name="discover-push-mode"
                checked={mode === "existing"}
                disabled={playlists !== null && playlists.length === 0}
                onChange={() => setMode("existing")}
              />
              A playlist I already have
            </label>
            {playlistsNote && <p className="discover-note">{playlistsNote}</p>}
            {playlists !== null && playlists.length === 0 && !playlistsNote && (
              <p className="discover-note">You have no playlists on Beatport yet.</p>
            )}
          </fieldset>
        )}
        {mode === "new" ? (
          <TextField
            label="Playlist name"
            id="discover-push-name"
            value={name}
            maxLength={maxNameLength + 1}
            onChange={(event) => setName(event.target.value)}
            error={
              tooLong
                ? `A playlist name is at most ${maxNameLength} characters.`
                : trimmed === ""
                  ? "A playlist needs a name."
                  : undefined
            }
          />
        ) : (
          <Select
            label="Playlist"
            id="discover-push-playlist"
            value={playlistId}
            onChange={(event) => setPlaylistId(event.target.value)}
            options={[
              { value: "", label: "Choose a playlist", disabled: true },
              ...(playlists ?? []).map((playlist) => ({ value: playlist.id, label: playlist.name })),
            ]}
          />
        )}
        <label className="discover-dialog__check">
          <input
            type="checkbox"
            checked={includeOwned}
            onChange={(event) => setIncludeOwned(event.target.checked)}
          />
          Include tracks already in your library
        </label>
        {refusal && <Notice>{refusal}</Notice>}
      </div>
    </Modal>
  );
}
