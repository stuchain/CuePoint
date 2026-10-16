import { Fragment, type ReactNode } from "react";
import { formatBpm } from "./format/bpm";
import { FACTS_SEPARATOR } from "../format/trackFacts";
import { KeyChip } from "./wheel/KeyChip";

/**
 * A track's facts outside a table (the queue, search): artist · label · key · BPM · year, in that
 * order, the key as its coloured chip and the digits in the data face (Inter). A missing fact is
 * left out with its separator. The title is never repeated here.
 */
export function TrackFactsLine({
  artist,
  label,
  keyValue,
  bpm,
  year,
  className = "",
}: {
  artist?: string | null;
  label?: string | null;
  keyValue?: string | null;
  bpm?: number | null;
  year?: number | string | null;
  className?: string;
}) {
  const bpmText = formatBpm(bpm ?? null);
  const yearText = year === null || year === undefined || year === 0 || year === "0" ? "" : String(year);
  const parts: ReactNode[] = [];
  if ((artist ?? "").trim()) parts.push((artist ?? "").trim());
  if ((label ?? "").trim()) parts.push((label ?? "").trim());
  if ((keyValue ?? "").trim()) parts.push(<KeyChip value={keyValue} />);
  if (bpmText) parts.push(`${bpmText} BPM`);
  if (yearText) parts.push(yearText);
  return (
    <span className={`cp-data ${className}`.trim()}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? FACTS_SEPARATOR : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
