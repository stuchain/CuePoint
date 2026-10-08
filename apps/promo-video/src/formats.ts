/** The two cuts, rendered from one timeline. `?format=tall` picks the vertical one. */
export const FORMATS = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 },
} as const;

export type FormatId = keyof typeof FORMATS;

export function formatFrom(search: string): FormatId {
  const f = new URLSearchParams(search).get("format");
  return f === "tall" ? "tall" : "wide";
}
