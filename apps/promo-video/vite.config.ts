import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * The opening shot is a frozen copy of the website's 3D scene (src/scene, see its README), so the video
 * stays as approved while the site's home page changes. Its bare imports ("three") resolve from this package.
 */
export default defineConfig({
  base: "./",
  resolve: {
    alias: [{ find: /^three$/, replacement: here("./node_modules/three/build/three.module.js") }],
    dedupe: ["three"],
  },
  // the scene files came from the website, whose tsconfig extends Astro's: give esbuild its own
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "es2022", useDefineForClassFields: true, verbatimModuleSyntax: false } }) },
  build: { target: "es2022", assetsInlineLimit: 0 },
});
