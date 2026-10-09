# The opening scene, frozen

A snapshot of the website's 3D opening (`apps/website/src/three` at feature commit 537bbf3, 2026-10-09):
the voxel crate whose records become the Camelot wheel. The promo was approved on this exact scene, so it
keeps its own copy and the website is free to rework its home page without changing the video.

Only the files the opening shot needs are here: `opening.ts` (and its `types.ts`), `phases.ts`,
`palette.ts`, `pixel-font.ts`, `pixel.ts` and `renderer.ts`. Bare `three` imports resolve from this
package. Edit these for the video alone; the site's copy is not kept in step.
