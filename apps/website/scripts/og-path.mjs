/**
 * Where a page's sharing picture lives. Its own file with no imports, so Page.astro can use it
 * without pulling the image renderer into the page build.
 *
 * "" -> og/index.png, "blog/a/" -> og/blog/a.png, "404.html" -> og/404.png
 */
export function ogImagePath(pagePath) {
  const clean = pagePath.replace(/^\/+/, "").replace(/\.html$/, "").replace(/\/+$/, "");
  return `og/${clean === "" ? "index" : clean}.png`;
}
