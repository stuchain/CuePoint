import "./PixelSpinner.css";

/**
 * The pixel spinner (PAGES-12, loading): one cell hopping round a two-by-two block.
 * Still when the Loading kind is off or the system asks for reduced motion, and
 * then it is a cell in the corner beside the words, so nothing is hidden.
 */
export function PixelSpinner({ label = "Loading" }: { label?: string | null }) {
  // With no label the words are already beside it (the strip's "Importing"), so it is only a picture.
  return (
    <span className="cp-spinner" role={label === null ? undefined : "status"} aria-hidden={label === null ? true : undefined}>
      <span className="cp-spinner__block" aria-hidden>
        <span className="cp-spinner__cell" />
      </span>
      {label !== null && <span className="cp-spinner__label">{label}</span>}
    </span>
  );
}
