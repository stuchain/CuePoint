# CuePoint website

The Astro site for CuePoint (Phase 17). Static output, built with Node 22.12 or newer.

## Commands

Run these in `apps/website`:

```
npm install      # or `npm ci` for a clean install from the lockfile
npm run dev      # dev server with hot reload
npm run build    # static site into dist/
npm run preview  # serve dist/ locally
npm run check    # astro check and tsc --noEmit
npm test         # vitest
```

## The address and the `/CuePoint/` base

`site.config.ts` holds one address setting, `SITE_URL`. `astro.config.ts` derives Astro's `site` and
`base` from it. On GitHub Pages the base is `/CuePoint/`, so every link and asset must be built from
`import.meta.env.BASE_URL`; a bare `/guide/` breaks on Pages. A custom domain gives a base of `/`.
Local dev and preview also serve under `/CuePoint/`.

## The PUBLIC flag

`PUBLIC` in `site.config.ts` is `false`, so every page carries `noindex, nofollow`. It is switched on
in SITE-13, at launch.

## Product context

`PRODUCT.md` is the product and voice context the design skills read.
