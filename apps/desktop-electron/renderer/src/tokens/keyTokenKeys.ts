/**
 * The names of the 24 key-colour tokens, "key-1A" to "key-12B": a leaf of its own so that
 * `themeDerivation.ts` can list them without importing `keyColourDerive.ts`, which imports it.
 */
export const KEY_TOKEN_KEYS: readonly string[] = (["A", "B"] as const).flatMap((letter) =>
  Array.from({ length: 12 }, (_, index) => `key-${index + 1}${letter}`),
);
