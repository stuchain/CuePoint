/**
 * What More's Copy and Show in folder do on the Prepare page, for both its lists (area 38).
 *
 * The Set table and the source panel's tables hold different row types, so each hands in its
 * visible columns and the rows; what is said afterwards is the Library's own wording.
 */
import type { TrackColumnDef } from "../../components/table";
import { revealTrack } from "../clean/revealTrack";
import { copySummary, gatherTracksAsText, writeClipboard } from "../library/trackClipboard";
import { COPY_LIMIT } from "../library/useTrackSelection";

type Say = (message: string, tone: "success" | "info" | "warning") => void;

/** Copy these rows as the table's text, and say how many went. */
export async function copyTrackRows<Row>(
  columns: readonly TrackColumnDef<Row>[],
  rows: readonly Row[],
  say: Say,
): Promise<void> {
  const copied = rows.slice(0, COPY_LIMIT);
  const text = await gatherTracksAsText(columns, copied);
  const wrote = text === "" ? false : await writeClipboard(text);
  say(wrote ? copySummary(copied.length, rows.length) : "Could not copy to the clipboard.", wrote ? "success" : "warning");
}

/** Show one track's file (or the nearest folder that exists), saying so when it is not there. */
export async function revealOne(trackId: number, say: Say): Promise<void> {
  const outcome = await revealTrack(trackId);
  if (outcome) say(outcome.message, outcome.tone);
}
