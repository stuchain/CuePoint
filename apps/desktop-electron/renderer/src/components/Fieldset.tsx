import type { FieldsetHTMLAttributes, ReactNode } from "react";
import "./Fieldset.css";

interface FieldsetProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "title"> {
  /** The group's name, drawn as the one legend style (10, bold, muted) and read as its label. */
  legend: ReactNode;
  children?: ReactNode;
}

/** A group of related controls with its legend: the label sits 4 above the first control. */
export function Fieldset({ legend, className = "", children, ...rest }: FieldsetProps) {
  return (
    <fieldset className={`cp-fieldset ${className}`.trim()} {...rest}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}
