import { MissingValue } from "../MissingValue";
import { keyLabel, keyName } from "./camelot";
import { useKeyNotation } from "./keyNotationSetting";
import { WheelButton } from "./WheelButton";
import { camelotOf } from "./keyColour";
import "./KeyChip.css";

/**
 * A key as a Camelot-coloured chip (R4-2), and the one place a chip is written. The words follow
 * Settings › Tables › Keys written as (K1 to K3: "8A", "Am" or "8A · Am"; display only, so files and
 * exports keep their own notation). The chip reads that one store through `useSyncExternalStore`,
 * which is cheap, and the tables that draw a chip per row are virtualised. The hint (`data-hint`,
 * drawn by the one delegated OverflowHintHost, not a native title) is the key's name (pass `wheel`
 * to make it the button that opens the wheel), and the colours come from the class alone (no
 * style), so the colour is always the Camelot code's. Text that is not a key is shown as it came,
 * and no key is a dash (DEC-201).
 */
export function KeyChip({
  value,
  wheel,
}: {
  value: string | null | undefined;
  /** Make the chip the button that opens the Camelot wheel (Track details, the player bar): which surface it opens for. */
  wheel?: "details" | "player";
}) {
  const notation = useKeyNotation();
  const text = (value ?? "").trim();
  if (wheel) return <WheelButton source={wheel} keyName={text} />;
  if (text === "") return <MissingValue />;
  const code = camelotOf(text);
  if (!code) return <span>{text}</span>;
  return (
    <span className={`key-chip key-chip--${code} cp-data`} data-hint={keyName(code)}>
      {keyLabel(code, notation)}
    </span>
  );
}
