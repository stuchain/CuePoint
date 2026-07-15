import type { HTMLAttributes, ReactNode } from "react";
import "./ListRow.css";

export interface ListRowProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  matched?: boolean;
  primary: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function ListRow({
  selected = false,
  matched,
  primary,
  secondary,
  meta,
  actions,
  className = "",
  ...rest
}: ListRowProps) {
  return (
    <div
      className={`cp-list-row ${selected ? "cp-list-row--selected" : ""} ${matched === false ? "cp-list-row--unmatched" : ""} ${className}`.trim()}
      role="row"
      {...rest}
    >
      <div className="cp-list-row__main">
        <div className="cp-list-row__primary">{primary}</div>
        {secondary && <div className="cp-list-row__secondary">{secondary}</div>}
      </div>
      {meta && <div className="cp-list-row__meta">{meta}</div>}
      {actions && <div className="cp-list-row__actions">{actions}</div>}
    </div>
  );
}
