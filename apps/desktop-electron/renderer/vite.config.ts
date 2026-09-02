import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    fs: {
      // `desktopContract.test.ts` reads the Electron main-process files as text
      // to check that a feature crossing the engine boundary moved every file it
      // has to. Named explicitly rather than allowing the parent directory
      // wholesale.
      allow: [".", "../electron"],
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
  },
});
