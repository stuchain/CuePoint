import { keyName } from "./camelot";
import { camelotOf } from "./keyColour";
import "./KeyChip.css";

/**
 * A key as a Camelot-coloured chip (R4-2): the code is always written ("8A", never "Am"), the
 * title is the key's name, and the colours come from the class alone (no style, no hook), because
 * a table renders a chip per row. Text that is not a key is shown as it came, and no key is a dash
 * (DEC-201).
 */
export function KeyChip({ value }: { value: string | null | undefined }) {
  const text = (value ?? "").trim();
  if (text === "") return <span>—</span>;
  const code = camelotOf(text);
  if (!code) return <span>{text}</span>;
  return (
    <span className={`key-chip key-chip--${code} cp-data`} title={keyName(code)}>
      {code}
    </span>
  );
}
