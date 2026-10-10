import type { ImageMetadata } from "astro";

type Lower =
  | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m"
  | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Punctuation = "'" | '"' | "(" | "[" | "{" | "$" | "#" | "@" | "&" | "*" | "-" | "+" | "." | "!" | "?" | ":" | "_" | "/" | "<" | "%" | "~" | "=";

/**
 * Alt text that is not empty. TypeScript has no "non-empty string" type, so this is a string whose
 * first character is a letter, digit or common punctuation: a literal `""` is rejected. Text that
 * is only known at run time goes through `altText()`, which checks it.
 */
export type AltText = `${Lower | Uppercase<Lower> | Digit | Punctuation}${string}`;

/** Marks run-time text as alt text; throws if it is empty. */
export function altText(text: string): AltText {
  if (text.trim() === "") throw new Error("Alt text must not be empty; mark the image decorative instead.");
  return text as AltText;
}

interface ImgBase {
  src: ImageMetadata;
  width?: number;
  height?: number;
  sizes?: string;
  /** The widths to make the picture at, for a `srcset` (a screenshot is read at a 2x screen's size). */
  widths?: number[];
  loading?: "lazy" | "eager";
  class?: string;
}

/** A picture that says something: `alt` describes it. */
export interface DescribedImg extends ImgBase {
  alt: AltText;
  decorative?: false;
}

/** A picture that adds nothing for a screen reader: `alt=""` is allowed only with `decorative`. */
export interface DecorativeImg extends ImgBase {
  alt: "";
  decorative: true;
}

export type ImgProps = DescribedImg | DecorativeImg;
