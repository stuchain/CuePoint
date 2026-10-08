/**
 * Link rewriting for the guide (SITE-09). The guide is `docs/user-guide/*.md`, written for GitHub with
 * relative links (`library.md`, `clean.md#matching`, `../policy/privacy-notice.md`). On the site:
 *
 *   - a link to another guide page becomes that page's address under the base (`/guide/library/`),
 *     keeping its `#part`;
 *   - a link to a repository file outside the guide becomes a GitHub link on the branch the site is
 *     built from (`GITHUB_BRANCH` in src/data/site.ts);
 *   - a link to a page that does not exist, a heading that is not on the page, or a repository file that
 *     is not in the repository throws, so the build fails.
 *
 * Headings are matched with the slugs Astro generates (its own heading-id plugin, github-slugger over
 * the heading's text), found by running that same plugin over the target page.
 *
 * Astro 7 renders Markdown with Sätteri, so this is an mdast plugin, not a remark plugin.
 *
 * The guide has no pictures, and a raw HTML link would escape the rewriting above, so an image or an
 * `<a>`/`<img>` tag in a guide file fails the build with a message (add the support here when one is needed).
 *
 * Validation runs when the content loader syncs (a build, or the dev server starting). A change to a guide
 * file while `npm run dev` is running is rendered but not re-validated: the next build catches it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { satteriHeadingIdsPlugin } from "@astrojs/markdown-satteri";
import { defineMdastPlugin, markdownToHtml, type MdastPluginDefinition } from "satteri";

export interface GuideLinkConfig {
  /** Absolute path of docs/user-guide. */
  readonly guideDir: string;
  /** Absolute path of the repository root, for links that leave the guide. */
  readonly repoRoot: string;
  /** The site's base, with both slashes ("/" or "/CuePoint/"). */
  readonly base: string;
  /** `https://github.com/<owner>/<repo>` with the branch: `.../blob/<branch>/` is built from these. */
  readonly githubUrl: string;
  readonly branch: string;
}

/** A thrown link problem, naming the file and the link. */
export class GuideLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideLinkError";
  }
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const slugCache = new Map<string, { stamp: string; slugs: Set<string> }>();

/** The heading ids Astro gives a page, found by running Astro's own heading-id plugin over it. */
export async function headingSlugs(source: string): Promise<Set<string>> {
  const astro = { frontmatter: {}, headings: [] as { depth: number; slug: string; text: string }[], localImagePaths: new Set<string>(), remoteImagePaths: new Set<string>() };
  await markdownToHtml(source, {
    hastPlugins: [satteriHeadingIdsPlugin()],
    features: { gfm: true, smartPunctuation: true },
    data: { astro },
  });
  return new Set(astro.headings.map((h) => h.slug));
}

/** The slugs of one file on disk, cached until the file changes. */
export async function headingSlugsOfFile(file: string): Promise<Set<string>> {
  const st = statSync(file);
  const stamp = `${st.mtimeMs}:${st.size}`;
  const hit = slugCache.get(file);
  if (hit?.stamp === stamp) return hit.slugs;
  const slugs = await headingSlugs(readFileSync(file, "utf8"));
  slugCache.set(file, { stamp, slugs });
  return slugs;
}

/** The guide files (names ending in .md, top level of the folder), sorted. */
export function guideFiles(guideDir: string): string[] {
  return readdirSync(guideDir)
    .filter((n) => n.endsWith(".md"))
    .sort();
}

/** True when the file or folder is there under exactly this spelling (a case-insensitive disk would say yes to "Library.md"). */
function existsExactly(path: string): boolean {
  return existsSync(path) && readdirSync(dirname(path)).includes(basename(path));
}

const inside = (parent: string, child: string) => child === parent || child.startsWith(parent + sep);

function decode(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/** The address of a guide page under the base. */
export const guideUrl = (base: string, slug: string, hash = ""): string => `${base}guide/${slug}/${hash ? `#${hash}` : ""}`;

/**
 * Rewrites one link found in `fromFile`. Addresses with a scheme (https:, mailto:) and site paths are
 * returned unchanged. Throws `GuideLinkError` for a link that cannot be followed.
 */
export async function rewriteLink(href: string, fromFile: string, cfg: GuideLinkConfig): Promise<string> {
  const raw = href.trim();
  const where = `${relative(cfg.repoRoot, fromFile).split(sep).join("/")}: the link "${href}"`;
  if (raw === "" || SCHEME.test(raw) || raw.startsWith("//") || raw.startsWith("/")) return href;

  const hashAt = raw.indexOf("#");
  const pathPart = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : raw.slice(hashAt + 1);

  // A link within the page: only the heading is checked.
  if (pathPart === "") {
    if (hash !== "" && hash !== "top" && !(await headingSlugsOfFile(fromFile)).has(decode(hash))) {
      throw new GuideLinkError(`${where} points at a heading that is not on this page (#${hash})`);
    }
    return href;
  }

  const pathOnly = decode(pathPart.split("?")[0] ?? "");
  const target = resolve(dirname(fromFile), pathOnly);

  if (dirname(target) === cfg.guideDir && target.endsWith(".md")) {
    if (!guideFiles(cfg.guideDir).includes(basename(target))) {
      throw new GuideLinkError(`${where} points at a guide page that does not exist (${basename(target)})`);
    }
    if (hash !== "" && !(await headingSlugsOfFile(target)).has(decode(hash))) {
      throw new GuideLinkError(`${where} points at a heading that is not on ${basename(target)} (#${hash})`);
    }
    return guideUrl(cfg.base, basename(target, ".md"), hash);
  }

  if (!inside(cfg.repoRoot, target)) throw new GuideLinkError(`${where} leaves the repository`);
  if (!existsExactly(target)) throw new GuideLinkError(`${where} points at a file that is not in the repository`);
  const repoPath = relative(cfg.repoRoot, target).split(sep).join("/");
  const kind = statSync(target).isDirectory() ? "tree" : "blob";
  return `${cfg.githubUrl}/${kind}/${cfg.branch}/${repoPath}${hash ? `#${hash}` : ""}`;
}

/**
 * The mdast plugin for Astro's `markdown.processor`: rewrites every link and link definition in a file
 * that lives in the guide folder, and leaves all other Markdown untouched.
 */
export function guideLinksPlugin(cfg: GuideLinkConfig) {
  return (factory: { readonly fileURL: URL | undefined }): MdastPluginDefinition | null => {
    if (!factory.fileURL || factory.fileURL.protocol !== "file:") return null;
    const file = fileURLToPath(factory.fileURL);
    if (dirname(file) !== cfg.guideDir) return null;
    const pending: Promise<void>[] = [];
    return defineMdastPlugin({
      name: "guide-links",
      image(node) {
        throw new GuideLinkError(`${relative(cfg.repoRoot, file).split(sep).join("/")}: the image "${node.url}" cannot be used: the guide has no pictures on the site (add image support in src/lib/guide-links.ts first)`);
      },
      html(node) {
        const tag = /<\s*(a|img)\b/i.exec(node.value);
        if (tag) {
          throw new GuideLinkError(`${relative(cfg.repoRoot, file).split(sep).join("/")}: raw HTML <${tag[1]}> is not rewritten or checked; write it as a Markdown link or image`);
        }
      },
      link(node, ctx) {
        pending.push(rewriteLink(node.url, file, cfg).then((url) => void (url !== node.url && ctx.setProperty(node, "url", url))));
      },
      definition(node, ctx) {
        pending.push(rewriteLink(node.url, file, cfg).then((url) => void (url !== node.url && ctx.setProperty(node, "url", url))));
      },
      // Settle every rewrite (and surface the first error) before the tree is turned into HTML.
      async after() {
        await Promise.all(pending);
      },
    });
  };
}

/**
 * Checks every link of every guide page, throwing the first problem found. Astro's glob loader logs a
 * render error and carries on, so the loader runs this first to make a broken link fail the build.
 */
export async function validateGuideLinks(cfg: GuideLinkConfig, files: readonly string[] = guideFiles(cfg.guideDir)): Promise<void> {
  const problems: string[] = [];
  for (const name of files) {
    const file = resolve(cfg.guideDir, name);
    try {
      await markdownToHtml(readFileSync(file, "utf8"), {
        mdastPlugins: [guideLinksPlugin(cfg)],
        features: { gfm: true },
        fileURL: pathToFileURL(file),
      });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length > 0) throw new GuideLinkError(`The guide has links that do not work:\n  ${problems.join("\n  ")}`);
}
