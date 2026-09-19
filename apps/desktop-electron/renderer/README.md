# CuePoint pixel renderer

Vite + React + TypeScript pixel-art UI lab, promoted to the Electron monorepo renderer.

## Commands

```bash
npm install
npm run dev           # App with mock screens (port 5173)
npm run storybook     # Component catalog (port 6006)
npm run build
```

## Structure

- `src/tokens/` — CSS design tokens, integer scale helper
- `src/components/` — Phase 1 component library + Storybook stories
- `src/screens/` — The pages: home, Library, Clean, inCrate and Settings
- `src/api/` — The bridge types and the pure helpers the pages share

Design sign-off checklist: [../docs/design-signoff.md](../docs/design-signoff.md)
