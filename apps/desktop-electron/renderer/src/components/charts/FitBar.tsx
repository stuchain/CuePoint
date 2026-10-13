/**
 * How well a suggestion fits, as five pixel blocks (R4-8, DEC-261).
 *
 * A score out of 100 is read at a glance as a bar, where a number or a band
 * word ("Strong") had to be read. The first `fitSteps(score)` blocks are
 * filled; the number stays in the title, for whoever wants it. The bar is a
 * fixed width and height, so a row never shifts for it.
 */
import { fitSteps } from "./fitSteps";
import "./FitBar.css";

const BLOCKS = [0, 1, 2, 3, 4] as const;

export function FitBar({ score, title }: { score: number; title?: string }) {
  const shown = Number.isFinite(score) ? Math.round(score) : 0;
  const steps = fitSteps(shown);
  return (
    <span
      className="cp-fit-bar"
      role="img"
      aria-label={`Fit ${shown} out of 100`}
      title={title ?? `${shown}/100`}
    >
      {BLOCKS.map((block) => (
        <span
          key={block}
          className={block < steps ? "cp-fit-bar__block cp-fit-bar__block--filled" : "cp-fit-bar__block"}
        />
      ))}
    </span>
  );
}
