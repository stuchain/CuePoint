import type { CSSProperties } from "react";
import "./RankBar.css";

export interface RankBarProps {
  /** The bar's length as a share of the longest bar in its list: 0 to 1. Out-of-range values are clamped. */
  share: number;
  /** A CSS colour (a token like `var(--key)`) for a bar whose colour means something. Default: the chart accent. */
  color?: string;
  className?: string;
}

/**
 * The one horizontal bar, for a ranked list (area 68): top artists, labels, genres, the Keys
 * counts. A flat block as long as its share of the first row, the same thickness and colour
 * everywhere (`--chart-bar*`). The leader (the full-length bar) carries `data-lead`, which draws it in
 * `--chart-bar-lead` (P15). It is decoration for the number beside it: it is hidden from
 * assistive technology, so the row's text must carry the value. For a range of values (tempo,
 * year, loudness) use the vertical PixelBars instead.
 *
 *     <span className="rank__name"><span>{name}</span><RankBar share={count / top} /></span>
 */
export function RankBar({ share, color, className = "" }: RankBarProps) {
  const clamped = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  const style = {
    "--share": `${(clamped * 100).toFixed(2)}%`,
    ...(color ? { "--bar-color": color } : {}),
  } as CSSProperties;
  return <span className={`cp-rank-bar ${className}`.trim()} style={style} aria-hidden="true" data-empty={clamped === 0 ? "true" : undefined} data-lead={clamped === 1 ? "true" : undefined} />;
}
