/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// tsc does not read .astro files; this lets the tests import them. `astro check` types the
// components' props from their own frontmatter; the type-level tests are in props.typecheck.ts.
declare module "*.astro" {
  import type { AstroComponentFactory } from "astro/runtime/server/index.js";
  const component: AstroComponentFactory;
  export default component;
}
