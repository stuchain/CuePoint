import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * The opening shot is the website's own 3D scene (apps/website/src/three), imported read-only so the
 * video and the site tell the same story. Its bare imports ("three") resolve from this package.
 */
export default defineConfig({
  base: "./",
  resolve: {
    alias: [{ find: /^three$/, replacement: here("./node_modules/three/build/three.module.js") }],
    dedupe: ["three"],
  },
  // the website's tsconfig extends Astro's, which this package does not install: give esbuild its own
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: "es2022", useDefineForClassFields: true, verbatimModuleSyntax: false } }) },
  server: { fs: { allow: [here("../..")] } },
  build: { target: "es2022", assetsInlineLimit: 0 },
});
