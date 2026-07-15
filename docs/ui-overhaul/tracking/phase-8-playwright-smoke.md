# Milestone — Phase 8 Playwright smoke

**Status:** Done (local)

## Scope

| Slice | Deliverable |
| --- | --- |
| Playwright config | `apps/desktop-electron/playwright.config.ts` |
| Smoke spec | `e2e/smoke.spec.ts` — launch app, title, nav |
| CI | `.github/workflows/desktop-electron.yml` |

## Verification

```bash
cd apps/desktop-electron
npm run build
npx playwright install chromium
npm run test:e2e
```

## Remaining

- Epic E2E paths (match → results → export)
- 3-OS manual RC sign-off
