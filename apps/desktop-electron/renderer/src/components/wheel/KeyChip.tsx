import { MissingValue } from "../MissingValue";
import { keyName } from "./camelot";
import { WheelButton } from "./WheelButton";
import { camelotOf } from "./keyColour";
import "./KeyChip.css";

/**
 * A key as a Camelot-coloured chip (R4-2): the code is always written ("8A", never "Am"), the
 * hint (`data-hint`, drawn by the one delegated OverflowHintHost, not a native title) is the key's name (pass `wheel` to make it the button that opens the wheel), and the colours come from the class alone (no style, no hook), because
 * a table renders a chip per row. Text that is not a key is shown as it came, and no key is a dash
 * (DEC-201).
 */
export function KeyChip({
  value,
  wheel,
}: {
  value: string | null | undefined;
  /** Make the chip the button that opens the Camelot wheel (Track details, the player bar): which surface it opens for. */
  wheel?: "details" | "player";
}) {
  const text = (value ?? "").trim();
  if (wheel) return <WheelButton source={wheel} keyName={text} />;
  if (text === "") return <MissingValue />;
  const code = camelotOf(text);
  if (!code) return <span>{text}</span>;
  return (
    <span className={`key-chip key-chip--${code} cp-data`} data-hint={keyName(code)}>
      {code}
    </span>
  );
}
