/**
 * Type-level tests: `npm run check` (tsc) fails if any `@ts-expect-error` below stops being an
 * error, i.e. if the prop types loosen. Nothing here runs.
 */
import type { ImgProps } from "./Img.types";
import type { PageProps } from "../layouts/Page.types";
import type { ButtonProps } from "./Button.types";

declare const src: ImgProps["src"];

// Img: alt is required
// @ts-expect-error no alt
export const imgNoAlt: ImgProps = { src };

// Img: alt="" needs decorative
// @ts-expect-error empty alt without decorative
export const imgEmptyAlt: ImgProps = { src, alt: "" };

// @ts-expect-error decorative false does not excuse an empty alt
export const imgEmptyAltFalse: ImgProps = { src, alt: "", decorative: true as false };

// Img: a decorative image cannot carry text
// @ts-expect-error decorative with a description
export const imgDecorativeWithText: ImgProps = { src, alt: "A picture", decorative: true };

export const imgOk: ImgProps = { src, alt: "The Library page" };
export const imgDecorativeOk: ImgProps = { src, alt: "", decorative: true };

// Page: title and description are required
// @ts-expect-error no title
export const pageNoTitle: PageProps = { description: "d", path: "" };

// @ts-expect-error no description
export const pageNoDescription: PageProps = { title: "t", path: "" };

// @ts-expect-error no path
export const pageNoPath: PageProps = { title: "t", description: "d" };

// Page: noindex is a reason, not a boolean
// @ts-expect-error boolean noindex
export const pageNoindexTrue: PageProps = { title: "t", description: "d", path: "", noindex: true };

// @ts-expect-error a reason that is not allowed
export const pageNoindexOther: PageProps = { title: "t", description: "d", path: "", noindex: "guide" };

export const pageOk: PageProps = { title: "t", description: "d", path: "" };
export const page404: PageProps = { title: "t", description: "d", path: "404.html", noindex: "404" };

// Button: a link and a button are different things
// @ts-expect-error a link cannot be a submit button
export const buttonLinkSubmit: ButtonProps = { href: "/x", type: "submit" };

export const buttonOk: ButtonProps = { href: "https://example.com" };
