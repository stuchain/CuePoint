import { GlobalSearch } from "./GlobalSearch";
import "./ShellHeader.css";

/**
 * The shell header (HDR-6): the library search, centered, and an empty place beside it
 * for PAGES-10's Camelot wheel button (HDR-4, DEC-133).
 *
 * The `search` landmark is the search field's own container, not this row, so the wheel
 * button is not inside it. The brand left with the menu bar and sits atop the sidebar.
 */
export function ShellHeader() {
  return (
    <div className="cp-shell-header">
      <div className="cp-shell-header__row">
        <GlobalSearch />
        <div data-slot="wheel" className="cp-shell-header__wheel" />
      </div>
    </div>
  );
}
