import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Source maps are written beside the bundle with no `sourceMappingURL` comment, so
    // the app does not ship a pointer to them. REPORT-07 uploads them to Sentry
    // (REPORT-06, DEC-126).
    sourcemap: "hidden",
  },
  server: {
    fs: {
      // `desktopContract.test.ts` reads the Electron main-process files as text
      // to check that a feature crossing the engine boundary moved every file it
      // has to. Named explicitly rather than allowing the parent directory
      // wholesale. `expected.test.ts` reads the engine's list of expected job
      // errors the same way.
      allow: [".", "../electron", "../../../src/cuepoint/reporting"],
    },
  },
  test: {
    // jsdom, not node: the suite previously covered only pure utility modules,
    // so nothing could render a component even though the app is entirely
    // components. `.test.tsx` files were not collected at all.
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    // Each test file gets a fresh jsdom document.
    restoreMocks: true,
    // CSS is stubbed out in tests, except the theme files, which
    // `waveformTokens.test.ts` reads as text to hold every theme's waveform
    // colours to their contrast (WAVE-05).
    css: { include: [/\/tokens\/themes\/[^/]+\.css/] },
  },
});
