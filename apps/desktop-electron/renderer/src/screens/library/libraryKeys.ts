/**
 * Whether the whole library has no Beatport key at all (DEC-201).
 *
 * Asked of the engine over the whole library, never guessed from the rows on
 * screen: a note that is wrong about the user's own library is worse than none.
 * `null` means the engine could not say.
 */
export async function libraryHasNoKeys(): Promise<boolean | null> {
  const facet = window.cuepoint?.getLibraryFacet;
  if (!facet) return null;
  const answer = await facet({ field: "key", playlistId: null, collectionId: null });
  // The "no key" bucket is the one with a null value. An answer with no buckets
  // at all says nothing about keys, so it says nothing.
  if (answer.values.length === 0) return null;
  return !answer.values.some((entry) => entry.value !== null && entry.count > 0);
}
