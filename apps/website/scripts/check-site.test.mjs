import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkPublisherPlaceholders, checkSite, readSiteConfig } from "./check-site.mjs";

/** A PNG header with the given size: all the rule reads. */
function png(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const SITE_URL = "https://example.test/Base/";
const BASE = "/Base/";
const LONG_DESC = "A description that is comfortably long enough to be useful in a search result, and short enough to fit.";

const made = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

/** One page of the clean template. Every option is a single knob a fixture can turn. */
function page({
  title,
  description,
  canonicalPath,
  body = "",
  head = "",
  robots,
  ogImage = `${SITE_URL}og.png`,
  omit = [],
}) {
  const has = (k) => !omit.includes(k);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${has("title") ? `<title>${title}</title>` : ""}
${has("description") ? `<meta name="description" content="${description}">` : ""}
${has("canonical") ? `<link rel="canonical" href="${SITE_URL}${canonicalPath}">` : ""}
${robots ? `<meta name="robots" content="${robots}">` : ""}
${has("icon") ? `<link rel="icon" type="image/svg+xml" href="${BASE}icon.svg"><link rel="icon" sizes="any" href="${BASE}favicon.ico">` : ""}
<link rel="apple-touch-icon" href="${BASE}apple-touch-icon.png">
<link rel="manifest" href="${BASE}site.webmanifest">
${has("og") && ogImage ? `<meta property="og:image" content="${ogImage}">` : ""}
<link rel="stylesheet" href="${BASE}_astro/site.css">
${head}
</head><body><main id="main">${body}</main></body></html>`;
}

const software = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Thing",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Windows, macOS, Linux",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", ratingCount: "12" },
};
const org = { "@context": "https://schema.org", "@type": "Organization", name: "Thing", url: SITE_URL };
const website = { "@context": "https://schema.org", "@type": "WebSite", name: "Thing", url: SITE_URL };
const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Yes." } },
  ],
};
const crumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "About" },
  ],
};
const post = {
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: "A post",
  datePublished: "2026-10-01",
  author: { "@type": "Person", name: "Someone" },
  image: `${SITE_URL}og.png`,
};

/** The clean site as a map of dist-relative path -> content. */
function cleanFiles() {
  const files = {
    "index.html": page({
      title: "Home page title",
      description: `Home. ${LONG_DESC}`,
      canonicalPath: "",
      head: [software, org, website].map(jsonLd).join(""),
      body: `<h1>Home</h1><h2>Part</h2><h3>Detail</h3><img src="${BASE}_astro/pic.png" alt="A picture">
<a href="${BASE}about/">About</a> <a href="about/#team">relative with fragment</a> <a href="${BASE}about/?ref=1">query</a>
<a href="${BASE}faq">no slash dir</a> <a href="#part">self</a> <h2 id="part">Anchor</h2>
<a href="https://other.test/x">external</a> <a href="mailto:a@b.test">mail</a>
<img src="${BASE}_astro/pic.png" srcset="${BASE}_astro/pic.png 1x, ${BASE}_astro/pic2.png 2x" alt="">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><use href="#part"/></svg>`,
    }),
    "about/index.html": page({
      title: "About the thing",
      description: `About. ${LONG_DESC}`,
      canonicalPath: "about/",
      head: jsonLd(crumbs),
      body: `<h1>About</h1><h2 id="team">Team</h2><p><a href="${BASE}">Home</a></p>`,
    }),
    "faq/index.html": page({
      title: "Questions and answers",
      description: `FAQ. ${LONG_DESC}`,
      canonicalPath: "faq/",
      head: jsonLd(faq),
      body: "<h1>FAQ</h1><h2>One</h2>",
    }),
    "blog/post/index.html": page({
      title: "A post about things",
      description: `Post. ${LONG_DESC}`,
      canonicalPath: "blog/post/",
      head: jsonLd(post),
      body: "<h1>Post</h1>",
    }),
    "404.html": page({
      title: "Page not found",
      description: `Not found. ${LONG_DESC}`,
      canonicalPath: "404.html",
      robots: "noindex, nofollow",
      body: `<h1>Not found</h1><a href="${BASE}">Home</a>`,
    }),
    "contact/thank-you/index.html": page({
      title: "Thank you for writing",
      description: `Thanks. ${LONG_DESC}`,
      canonicalPath: "contact/thank-you/",
      robots: "noindex",
      body: "<h1>Thanks</h1>",
    }),
    "_astro/site.css": "body{margin:0}",
    "_astro/pic.png": "png",
    "_astro/pic2.png": "png",
    "og.png": png(1200, 630),
    "icon.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>",
    "favicon.ico": "ico",
    "apple-touch-icon.png": "png",
    "icon-192.png": "png",
    "icon-512.png": "png",
    "site.webmanifest": JSON.stringify({
      name: "Thing",
      start_url: BASE,
      icons: [
        { src: `${BASE}icon-192.png`, sizes: "192x192", type: "image/png" },
        { src: `${BASE}icon-512.png`, sizes: "512x512", type: "image/png" },
      ],
    }),
    "robots.txt": `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap-index.xml\n`,
    "sitemap-index.xml": `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${SITE_URL}sitemap-0.xml</loc></sitemap></sitemapindex>`,
    "sitemap-0.xml": `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "about/", "faq/", "blog/post/"]
      .map((p) => `<url><loc>${SITE_URL}${p}</loc></url>`)
      .join("")}</urlset>`,
  };
  return files;
}

function build(edit) {
  const files = cleanFiles();
  edit?.(files);
  const dir = mkdtempSync(join(tmpdir(), "check-site-"));
  made.push(dir);
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const run = (edit, opts = {}) => checkSite(build(edit), { base: BASE, siteUrl: SITE_URL, preview: false, ...opts });

describe("the clean fixture", () => {
  it("passes", () => {
    expect(run()).toEqual([]);
  });

  it("passes as a preview build when every page carries noindex", () => {
    const edit = (f) => {
      for (const p of ["index.html", "about/index.html", "faq/index.html", "blog/post/index.html"]) {
        f[p] = f[p].replace("<link rel=\"canonical\"", "<meta name=\"robots\" content=\"noindex, nofollow\"><link rel=\"canonical\"");
      }
    };
    expect(run(edit, { preview: true })).toEqual([]);
  });
});

describe("Pagefind's generated files (SITE-09)", () => {
  // They sit in dist/pagefind/, are loaded by script on focus (an address in a data attribute, not a link)
  // and are never linked, so the link check must neither follow nor demand them.
  const withPagefind = (f) => {
    f["pagefind/pagefind.js"] = "export const search = () => {};";
    f["pagefind/pagefind-entry.json"] = "{}";
    f["pagefind/wasm.en.pagefind"] = "wasm";
    f["pagefind/fragment/en_1.pf_fragment"] = "fragment";
    f["about/index.html"] = f["about/index.html"].replace(
      "<h1>About</h1>",
      `<div role="search" data-pagefind-src="${BASE}pagefind/pagefind.js" data-base="${BASE}"></div><h1>About</h1>`,
    );
  };

  it("passes with the index in the build and the search box on a page", () => {
    expect(run(withPagefind)).toEqual([]);
  });

  it("still reports a real link to a pagefind file that is not there", () => {
    const edit = (f) => {
      withPagefind(f);
      f["about/index.html"] = f["about/index.html"].replace("<h1>About</h1>", `<h1>About</h1><a href="${BASE}pagefind/gone.js">x</a>`);
    };
    expect(run(edit).map((r) => r.rule)).toContain("link-broken");
  });
});

const replaceIn = (path, from, to) => (f) => {
  if (!f[path].includes(from)) throw new Error(`fixture: "${from}" not in ${path}`);
  f[path] = f[path].replace(from, to);
};

/** [name, rule it must fail with, the one fault, the page it must name (a file path in dist)] */
const FAULTS = [
  ["no title", "title-missing", replaceIn("about/index.html", "<title>About the thing</title>", ""), "about/index.html"],
  ["no description", "description-missing", replaceIn("about/index.html", /<meta name="description"[^>]*>/.exec(cleanFiles()["about/index.html"])[0], ""), "about/index.html"],
  ["no canonical", "canonical-missing", replaceIn("about/index.html", `<link rel="canonical" href="${SITE_URL}about/">`, ""), "about/index.html"],
  ["shared title", "title-duplicate", replaceIn("faq/index.html", "Questions and answers", "About the thing"), "faq/index.html"],
  ["shared description", "description-duplicate", (f) => {
    f["faq/index.html"] = f["faq/index.html"].replace(`FAQ. ${LONG_DESC}`, `About. ${LONG_DESC}`);
  }, "faq/index.html"],
  ["title of 61 characters", "title-length", replaceIn("about/index.html", "About the thing", "A".repeat(61)), "about/index.html"],
  ["description of 69 characters", "description-length", (f) => {
    f["about/index.html"] = f["about/index.html"].replace(`About. ${LONG_DESC}`, "D".repeat(69));
  }, "about/index.html"],
  ["description of 161 characters", "description-length", (f) => {
    f["about/index.html"] = f["about/index.html"].replace(`About. ${LONG_DESC}`, "D".repeat(161));
  }, "about/index.html"],
  ["no h1", "h1-count", replaceIn("about/index.html", "<h1>About</h1>", ""), "about/index.html"],
  ["two h1", "h1-count", replaceIn("about/index.html", "<h1>About</h1>", "<h1>About</h1><h1>Again</h1>"), "about/index.html"],
  ["h1 then h3", "heading-skip", replaceIn("about/index.html", '<h2 id="team">Team</h2>', '<h3 id="team">Team</h3>'), "about/index.html"],
  ["img with no alt", "img-alt", replaceIn("about/index.html", "<h1>About</h1>", `<h1>About</h1><img src="${BASE}_astro/pic.png">`), "about/index.html"],
  ["noindex on a content page", "noindex-unexpected", (f) => {
    replaceIn("about/index.html", `<link rel="canonical"`, `<meta name="robots" content="noindex"><link rel="canonical"`)(f);
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace(`<url><loc>${SITE_URL}about/</loc></url>`, "");
  }, "about/index.html"],
  ["noindex on a content page, in the googlebot meta", "noindex-unexpected", (f) => {
    replaceIn("about/index.html", `<link rel="canonical"`, `<meta name="googlebot" content="none, noindex"><link rel="canonical"`)(f);
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace(`<url><loc>${SITE_URL}about/</loc></url>`, "");
  }, "about/index.html"],
  ["indexable page not in the sitemap", "sitemap-missing", (f) => {
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace(`<url><loc>${SITE_URL}faq/</loc></url>`, "");
  }, "faq/index.html"],
  ["thank-you page in the sitemap", "sitemap-noindex", (f) => {
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}contact/thank-you/</loc></url></urlset>`);
  }, "contact/thank-you/index.html"],
  ["link without the base", "link-broken", replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="/">Home</a>`), "about/index.html"],
  ["link to a missing page", "link-broken", replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="${BASE}nope/">Home</a>`), "about/index.html"],
  ["link to a missing fragment", "link-broken", replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="${BASE}faq/#nope">Home</a>`), "about/index.html"],
  ["missing asset in srcset", "link-broken", replaceIn("index.html", "pic2.png 2x", "gone.png 2x"), "index.html"],
  ["missing stylesheet", "link-broken", (f) => {
    f["_astro/site.css"] = null;
  }, "index.html"],
  ["absolute link to the site's own missing page", "link-broken", replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="${SITE_URL}nope/">Home</a>`), "about/index.html"],
  ["http:// link", "http-url", replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="http://other.test/">Home</a>`), "about/index.html"],
  ["http:// image", "http-url", replaceIn("about/index.html", "<h1>About</h1>", `<h1>About</h1><img src="http://other.test/a.png" alt="">`), "about/index.html"],
  ["JSON-LD that does not parse", "jsonld-parse", replaceIn("faq/index.html", '"@type":"FAQPage"', '"@type":"FAQPage",'), "faq/index.html"],
  ["SoftwareApplication with no price", "jsonld-properties", (f) => {
    f["index.html"] = f["index.html"].replace('"offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}', '"offers":{"@type":"Offer"}');
  }, "index.html"],
  ["SoftwareApplication with no operatingSystem", "jsonld-properties", replaceIn("index.html", '"operatingSystem":"Windows, macOS, Linux",', ""), "index.html"],
  ["SoftwareApplication with no applicationCategory", "jsonld-properties", replaceIn("index.html", '"applicationCategory":"MultimediaApplication",', ""), "index.html"],
  ["aggregateRating with no ratingCount or reviewCount", "jsonld-properties", replaceIn("index.html", ',"ratingCount":"12"', ""), "index.html"],
  ["aggregateRating with no ratingValue", "jsonld-properties", replaceIn("index.html", '"ratingValue":"4.8",', ""), "index.html"],
  ["a nested Organization with no name", "jsonld-properties", replaceIn("index.html", "</head>", `${jsonLd({ "@context": "https://schema.org", "@type": "WebPage", mainEntity: { "@type": "Organization", url: SITE_URL } })}</head>`), "index.html"],
  ["a title only in an svg in the body", "title-missing", (f) => {
    replaceIn("about/index.html", "<title>About the thing</title>", "")(f);
    replaceIn("about/index.html", "<h1>About</h1>", '<h1>About</h1><svg role="img" viewBox="0 0 1 1"><title>Icon</title></svg>')(f);
  }, "about/index.html"],
  ["relative canonical", "canonical-invalid", replaceIn("about/index.html", `href="${SITE_URL}about/"`, `href="${BASE}about/"`), "about/index.html"],
  ["canonical on another host", "canonical-invalid", replaceIn("about/index.html", `href="${SITE_URL}about/"`, `href="https://other.test/Base/about/"`), "about/index.html"],
  ["canonical of another page", "canonical-invalid", replaceIn("about/index.html", `href="${SITE_URL}about/"`, `href="${SITE_URL}"`), "about/index.html"],
  ["relative link on the 404 page", "link-broken", replaceIn("404.html", `<a href="${BASE}">Home</a>`, `<a href="about/">About</a>`), "404.html"],
  ["relative asset on the 404 page", "link-broken", replaceIn("404.html", `href="${BASE}_astro/site.css"`, `href="_astro/site.css"`), "404.html"],
  ["w3.org http link", "http-url", replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="http://www.w3.org/TR/">Home</a>`), "about/index.html"],
  ["http:// in JSON-LD", "http-url", replaceIn("index.html", `"@type":"Organization","name":"Thing","url":"${SITE_URL}"`, '"@type":"Organization","name":"Thing","url":"http://other.test/"'), "index.html"],
  ["http:// og:url", "http-url", replaceIn("about/index.html", "<link rel=\"canonical\"", '<meta property="og:url" content="http://example.test/Base/about/"><link rel="canonical"'), "about/index.html"],
  ["http:// twitter:image", "http-url", replaceIn("about/index.html", "<link rel=\"canonical\"", '<meta name="twitter:image" content="http://example.test/Base/og.png"><link rel="canonical"'), "about/index.html"],
  ["a name attribute on a div is not an anchor", "link-broken", (f) => {
    replaceIn("about/index.html", '<h2 id="team">Team</h2>', '<h2 id="team">Team</h2><div name="gone">x</div>')(f);
    replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="#gone">Home</a>`)(f);
  }, "about/index.html"],
  ["sitemap lists a page that is not in the build", "sitemap-missing", (f) => {
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}ghost/</loc></url></urlset>`);
  }, "sitemap-0.xml"],
  ["sitemap lists a page from another site", "sitemap-missing", (f) => {
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", "<url><loc>https://other.test/Base/</loc></url></urlset>");
  }, "sitemap-0.xml"],
  ["style guide page in the sitemap", "sitemap-excluded", (f) => {
    f["styleguide/index.html"] = page({ title: "Style guide here", description: `Guide. ${LONG_DESC}`, canonicalPath: "styleguide/", body: "<h1>Style guide</h1>" });
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}styleguide/</loc></url></urlset>`);
  }, "styleguide/index.html"],
  ["Organization with no name", "jsonld-properties", replaceIn("index.html", '"@type":"Organization","name":"Thing",', '"@type":"Organization",'), "index.html"],
  ["WebSite with no url", "jsonld-properties", replaceIn("index.html", `"@type":"WebSite","name":"Thing","url":"${SITE_URL}"`, '"@type":"WebSite","name":"Thing"'), "index.html"],
  ["FAQPage question with no answer", "jsonld-properties", replaceIn("faq/index.html", ',"acceptedAnswer":{"@type":"Answer","text":"Yes."}', ""), "faq/index.html"],
  ["BreadcrumbList with one item", "jsonld-properties", replaceIn("about/index.html", ',{"@type":"ListItem","position":2,"name":"About"}', ""), "about/index.html"],
  ["BreadcrumbList item with no name", "jsonld-properties", replaceIn("about/index.html", '"position":1,"name":"Home",', '"position":1,'), "about/index.html"],
  ["BlogPosting with no datePublished", "jsonld-properties", replaceIn("blog/post/index.html", '"datePublished":"2026-10-01",', ""), "blog/post/index.html"],
  ["JSON-LD without a context", "jsonld-properties", replaceIn("faq/index.html", '"@context":"https://schema.org",', ""), "faq/index.html"],
  ["no og:image", "og-image", replaceIn("about/index.html", `<meta property="og:image" content="${SITE_URL}og.png">`, ""), "about/index.html"],
  ["og:image is the wrong size", "og-image", (f) => { f["og.png"] = png(1200, 600); }, "about/index.html"],
  ["og:image is not a PNG", "og-image", (f) => { f["og.png"] = "png"; }, "about/index.html"],
  ["og:image file missing", "og-image", replaceIn("about/index.html", `${SITE_URL}og.png`, `${SITE_URL}missing.png`), "about/index.html"],
  ["no favicon link", "favicon", replaceIn("about/index.html", `<link rel="icon" type="image/svg+xml" href="${BASE}icon.svg"><link rel="icon" sizes="any" href="${BASE}favicon.ico">`, ""), "about/index.html"],
  ["favicon.ico missing", "favicon", (f) => {
    f["favicon.ico"] = null;
  }, "favicon.ico"],
  ["a manifest icon missing", "favicon", (f) => {
    f["icon-512.png"] = null;
  }, "site.webmanifest"],
  ["no site.webmanifest", "manifest", (f) => {
    f["site.webmanifest"] = null;
  }, "site.webmanifest"],
  ["site.webmanifest that is not JSON", "manifest", (f) => {
    f["site.webmanifest"] = "{";
  }, "site.webmanifest"],
  ["robots.txt without the sitemap", "robots-sitemap", (f) => {
    f["robots.txt"] = "User-agent: *\nAllow: /\n";
  }, "robots.txt"],
  ["no robots.txt", "robots-sitemap", (f) => {
    f["robots.txt"] = null;
  }, "robots.txt"],
  ["robots.txt naming another sitemap", "robots-sitemap", (f) => {
    f["robots.txt"] = "Sitemap: https://example.test/sitemap.xml\n";
  }, "robots.txt"],
];

describe("each rule fails with exactly its own message", () => {
  it.each(FAULTS)("%s", (_name, rule, edit, pageFile) => {
    const results = run(edit);
    expect(results.length).toBeGreaterThan(0);
    expect([...new Set(results.map((r) => r.rule))]).toEqual([rule]);
    for (const r of results) {
      expect(r.message).toBeTruthy();
      expect(r.page).toBeTruthy();
    }
    expect(results.map((r) => r.page)).toContain(pageFile);
  });
});

describe("the sitemap files", () => {
  it("a missing sitemap fails once, with the sitemap rule", () => {
    const results = run((f) => {
      f["sitemap-index.xml"] = null;
    });
    expect([...new Set(results.map((r) => r.rule))]).toEqual(["sitemap-missing"]);
  });

  it("is read through the index, not only sitemap-0.xml", () => {
    const results = run((f) => {
      f["sitemap-index.xml"] = f["sitemap-index.xml"].replace("sitemap-0.xml", "other.xml");
      f["other.xml"] = f["sitemap-0.xml"];
      f["sitemap-0.xml"] = null;
    });
    expect(results).toEqual([]);
  });
});

describe("orphan-js", () => {
  const withScripts = (f) => {
    f["index.html"] = f["index.html"].replace("</head>", `<script type="module" src="${BASE}_astro/page.AAA.js"></script></head>`);
    f["_astro/page.AAA.js"] = 'import("./chunk.BBB.js");';
    f["_astro/chunk.BBB.js"] = "export const x = 1;";
  };

  it("passes when every script is reached from a page, through imports", () => {
    expect(run(withScripts)).toEqual([]);
  });

  it("warns about a script no page reaches, and never fails the build", () => {
    const edit = (f) => {
      withScripts(f);
      f["_astro/entry.CCC.js"] = "export const y = 2;";
    };
    const results = run(edit);
    expect(results.map((r) => [r.rule, r.page, r.severity])).toEqual([["orphan-js", "_astro/entry.CCC.js", "warning"]]);
  });
});

describe("preview builds", () => {
  const noindexAll = (f) => {
    for (const p of ["index.html", "about/index.html", "faq/index.html", "blog/post/index.html"]) {
      f[p] = f[p].replace('<link rel="canonical"', '<meta name="robots" content="noindex, nofollow"><link rel="canonical"');
    }
  };

  it("allows noindex anywhere", () => {
    expect(run(noindexAll, { preview: true })).toEqual([]);
  });

  it("does not run the sitemap-versus-noindex rule", () => {
    const edit = (f) => {
      noindexAll(f);
      f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}about/</loc></url></urlset>`);
    };
    expect(run(edit, { preview: true })).toEqual([]);
  });

  it("keeps the 404 page out of the sitemap even with noindex everywhere", () => {
    const edit = (f) => {
      noindexAll(f);
      f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}404.html</loc></url></urlset>`);
    };
    expect(run(edit, { preview: true }).map((r) => r.rule)).toEqual(["sitemap-excluded"]);
  });

  it("requires noindex on every page", () => {
    const results = run((f) => {
      noindexAll(f);
      f["about/index.html"] = f["about/index.html"].replace('<meta name="robots" content="noindex, nofollow">', "");
    }, { preview: true });
    expect(results.map((r) => [r.rule, r.page])).toEqual([["noindex-missing", "about/index.html"]]);
  });

  it("still requires every indexable page in the sitemap", () => {
    const edit = (f) => {
      noindexAll(f);
      f["sitemap-0.xml"] = f["sitemap-0.xml"].replace(`<url><loc>${SITE_URL}faq/</loc></url>`, "");
    };
    const results = run(edit, { preview: true });
    expect(results.map((r) => r.rule)).toEqual(["sitemap-missing"]);
  });

  it("keeps the style guide out of the sitemap rule", () => {
    const edit = (f) => {
      noindexAll(f);
      f["styleguide/index.html"] = page({
        title: "Style guide here",
        description: `Guide. ${LONG_DESC}`,
        canonicalPath: "styleguide/",
        robots: "noindex, nofollow",
        body: "<h1>Style guide</h1>",
      });
    };
    expect(run(edit, { preview: true })).toEqual([]);
  });
});

describe("readSiteConfig", () => {
  it("reads the real site.config.ts", () => {
    const config = readSiteConfig();
    expect(config.siteUrl).toMatch(/^https:\/\//);
    expect(config.base.startsWith("/") && config.base.endsWith("/")).toBe(true);
    expect(typeof config.preview).toBe("boolean");
    const source = readFileSync(new URL("../site.config.ts", import.meta.url), "utf8");
    expect(source).toContain(config.siteUrl);
  });
});


describe("accepted forms", () => {
  it("accepts a text fragment and an id on any element", () => {
    const edit = replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="${BASE}faq/#:~:text=One">a</a> <a href="${BASE}about/#team:~:text=Team">b</a> <a href="${BASE}about/#legacy">c</a><a name="legacy"></a>`);
    expect(run(edit)).toEqual([]);
  });

  it("does not split a data: URI in srcset on its comma", () => {
    const edit = replaceIn("index.html", "pic2.png 2x", "pic2.png 2x, data:image/png;base64,AAAA,BBBB 3x");
    expect(run(edit)).toEqual([]);
  });

  it("accepts a BreadcrumbList item whose name is on item", () => {
    const edit = replaceIn("about/index.html", '"position":1,"name":"Home","item":"https://example.test/Base/"', '"position":1,"item":{"@id":"https://example.test/Base/","name":"Home"}');
    expect(run(edit)).toEqual([]);
  });

  it("accepts reviewCount in place of ratingCount", () => {
    expect(run(replaceIn("index.html", '"ratingCount"', '"reviewCount"'))).toEqual([]);
  });

  it("lets the 404 page use root-relative, fragment and absolute addresses", () => {
    const edit = replaceIn("404.html", `<a href="${BASE}">Home</a>`, `<a href="${BASE}about/">a</a><a href="#top">b</a><a href="${SITE_URL}">c</a><a href="mailto:a@b.test">d</a>`);
    expect(run(edit)).toEqual([]);
  });

  it("does not demand the canonical of the 404 page be its own address", () => {
    expect(run(replaceIn("404.html", `href="${SITE_URL}404.html"`, `href="${SITE_URL}"`))).toEqual([]);
  });
});

describe("messages", () => {
  it("says to add the trailing slash when a link equals the base without it", () => {
    const results = run(replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="/Base">Home</a>`));
    expect(results.map((r) => r.rule)).toEqual(["link-broken"]);
    expect(results[0].message).toContain("add the trailing slash");
  });

  it("does not say it for other addresses outside the base", () => {
    const results = run(replaceIn("about/index.html", `<a href="${BASE}">Home</a>`, `<a href="/Other/">Home</a>`));
    expect(results[0].message).not.toContain("trailing slash");
  });
});

describe("SoftwareApplication without a rating", () => {
  const withoutRating = (f) => {
    f["index.html"] = f["index.html"].replace(/,"aggregateRating":\{[^}]*\}/, "");
  };

  it("warns, citing Google, and does not fail", () => {
    const results = run(withoutRating);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ rule: "jsonld-properties", page: "index.html", severity: "warning" });
    expect(results[0].message).toContain("aggregateRating or review");
    expect(results[0].message).toMatch(/Google/);
  });

  it("is satisfied by a review", () => {
    const edit = (f) => {
      withoutRating(f);
      f["index.html"] = f["index.html"].replace('"name":"Thing","applicationCategory"', '"name":"Thing","review":{"@type":"Review"},"applicationCategory"');
    };
    expect(run(edit)).toEqual([]);
  });

  it("marks every failure as an error", () => {
    const results = run(replaceIn("index.html", '"applicationCategory":"MultimediaApplication",', ""));
    expect(results.every((r) => r.severity === "error")).toBe(true);
  });
});

describe("the 404 page's canonical", () => {
  it("may be left out, but no other page may", () => {
    const noCanonical = (path) => (f) => {
      f[path] = f[path].replace(/<link rel="canonical"[^>]*>/, "");
    };
    expect(run(noCanonical("404.html"))).toEqual([]);
    expect(run(noCanonical("about/index.html")).map((r) => r.rule)).toContain("canonical-missing");
  });
});

describe("publisher placeholders (DEC-144) and the service keys (DEC-192, DEC-193)", () => {
  const UMAMI = "c1b7a806-c974-4e97-aed1-f94f53b6326c";
  const KEY = "06f937df-8912-4a4f-b495-9686e5714d68";
  const source = (email, publisher, umami = UMAMI, key = KEY) =>
    `export const PUBLISHER = "${publisher}";\nexport const CONTACT_EMAIL = "${email}";\n` +
    `export const UMAMI_WEBSITE_ID = "${umami}";\nexport const WEB3FORMS_ACCESS_KEY: string = "${key}";\n`;

  it("flags the placeholder email and publisher", () => {
    const results = checkPublisherPlaceholders(source("contact@example.com", "stuchain"));
    expect(results.map((r) => r.rule)).toEqual(["placeholder", "placeholder"]);
    expect(results[0].message).toMatch(/CONTACT_EMAIL/);
    expect(results[1].message).toMatch(/PUBLISHER/);
  });

  it("passes real values", () => {
    expect(checkPublisherPlaceholders(source("hello@usecuepoint.com", "Jane Doe"))).toEqual([]);
  });

  it.each(["TODO-umami-website-id", "", "not-an-id", "00000000-0000-0000-0000-000000000000"])("flags the Umami Website ID %j", (value) => {
    const results = checkPublisherPlaceholders(source("hello@usecuepoint.com", "Jane Doe", value));
    expect(results.map((r) => r.rule)).toEqual(["placeholder"]);
    expect(results[0].message).toMatch(/UMAMI_WEBSITE_ID/);
  });

  it.each(["TODO-web3forms-access-key", "", "YOUR_ACCESS_KEY_HERE", "00000000-0000-0000-0000-000000000000"])("flags the Web3Forms key %j", (value) => {
    const results = checkPublisherPlaceholders(source("hello@usecuepoint.com", "Jane Doe", UMAMI, value));
    expect(results.map((r) => r.rule)).toEqual(["placeholder"]);
    expect(results[0].message).toMatch(/WEB3FORMS_ACCESS_KEY/);
  });

  it("fails loudly when the constants move", () => {
    expect(checkPublisherPlaceholders("export const X = 1;")[0].message).toMatch(/could not read/);
  });

  it("fails loudly when only the service keys are missing", () => {
    expect(checkPublisherPlaceholders('export const PUBLISHER = "Jane";\nexport const CONTACT_EMAIL = "a@b.co";')[0].message).toMatch(/could not read/);
  });
});

describe("readSiteConfig on other sources", () => {
  const read = (source) => {
    const dir = mkdtempSync(join(tmpdir(), "site-config-"));
    made.push(dir);
    const path = join(dir, "site.config.ts");
    writeFileSync(path, source);
    return readSiteConfig(path);
  };

  it("ignores commented-out lines", () => {
    const config = read(`// export const SITE_URL = "https://old.test/Old/";
/* export const PUBLIC = true; */
// export const PUBLIC = true;
export const SITE_URL = "https://real.test/Real/";
export const PUBLIC = false;
`);
    expect(config).toEqual({ siteUrl: "https://real.test/Real/", base: "/Real/", preview: true });
  });

  it("reads single quotes and type annotations", () => {
    const config = read(`export const SITE_URL: string = 'https://real.test/Real';
export const PUBLIC: boolean = true;
`);
    expect(config).toEqual({ siteUrl: "https://real.test/Real/", base: "/Real/", preview: false });
  });

  it("still fails loudly when the only line is commented out", () => {
    expect(() => read(`// export const SITE_URL = "https://x.test/";\nexport const PUBLIC = false;\n`)).toThrow(/could not read/);
  });
});

describe("the RSS feed (SITE-10)", () => {
  const ALTERNATE = `<link rel="alternate" type="application/rss+xml" title="Feed" href="${BASE}blog/rss.xml">`;
  const FEED = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>T</title><link>${SITE_URL}blog/</link><description>D</description><item><title>P</title><link>${SITE_URL}blog/post/</link><guid>${SITE_URL}blog/post/</guid><pubDate>Mon, 05 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
  const PAGES = ["index.html", "about/index.html", "faq/index.html", "blog/post/index.html", "contact/thank-you/index.html", "404.html"];
  const withFeed = (feed = FEED, skip = []) => (f) => {
    for (const p of PAGES) if (!skip.includes(p)) f[p] = f[p].replace('<link rel="manifest"', `${ALTERNATE}<link rel="manifest"`);
    f["blog/rss.xml"] = feed;
  };

  it("passes when every page links a valid feed", () => {
    expect(run(withFeed())).toEqual([]);
  });

  it("fails a feed that is not RSS 2.0", () => {
    const results = run(withFeed(FEED.replace('version="2.0"', 'version="0.91"')));
    expect(results.map((r) => r.rule)).toEqual(["feed-invalid"]);
    expect(results[0].page).toBe("blog/rss.xml");
  });

  it("fails a feed link that is in the body, or points at another file", () => {
    const inBody = (f) => {
      withFeed(FEED, ["about/index.html"])(f);
      f["about/index.html"] = f["about/index.html"].replace("<main", `<main>${ALTERNATE}</main><main`);
    };
    expect(run(inBody).map((r) => `${r.rule} ${r.page}`)).toContain("feed-link-missing about/index.html");
    const wrong = (f) => {
      withFeed()(f);
      f["about/index.html"] = f["about/index.html"].replace(`${BASE}blog/rss.xml`, `${BASE}icon.svg`);
    };
    expect(run(wrong).map((r) => `${r.rule} ${r.page}`)).toContain("feed-link-missing about/index.html");
  });

  it("accepts the absolute address of the feed", () => {
    const edit = (f) => {
      withFeed()(f);
      f["about/index.html"] = f["about/index.html"].replace(`href="${BASE}blog/rss.xml"`, `href="${SITE_URL}blog/rss.xml"`);
    };
    expect(run(edit)).toEqual([]);
  });

  it("fails a page that does not link the feed, and a link to a feed that is not built", () => {
    expect(run(withFeed(FEED, ["about/index.html"])).map((r) => `${r.rule} ${r.page}`)).toEqual(["feed-link-missing about/index.html"]);
    const broken = run((f) => {
      withFeed()(f);
      f["blog/rss.xml"] = null;
    });
    expect(broken.some((r) => r.rule === "link-broken")).toBe(true);
  });
});

describe("comparison pages (SITE-08, DEC-197)", () => {
  const source = (date = "2026-10-08", href = "https://tool.test/page") =>
    `<p data-compare-source>Source: <a href="${href}" rel="noopener noreferrer">Their page</a>, read on <time datetime="${date}">${date}</time>.</p>`;
  const fact = (inner) => `<div data-compare-fact>A fact. ${inner}</div>`;
  const withCompare = (body) => (f) => {
    f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}compare/tool/</loc></url></urlset>`);
    f["compare/tool/index.html"] = page({
      title: "CuePoint and a tool",
      description: `Compare. ${LONG_DESC}`,
      canonicalPath: "compare/tool/",
      body: `<h1>Compare</h1><h2>Rows</h2>${body}`,
    });
  };
  const rules = (edit, opts) => run(edit, opts).map((r) => `${r.rule} ${r.page}`);
  const WANT = ["compare-source compare/tool/index.html"];

  it("accepts a page whose every fact has exactly one source naming its page and the date it was read", () => {
    expect(run(withCompare(fact(source())))).toEqual([]);
  });

  it("fails a comparison page with no fact", () => {
    expect(rules(withCompare("<p>Nothing</p>"))).toEqual(WANT);
  });

  it("fails a fact with no source, or with two", () => {
    expect(rules(withCompare(fact("")))).toEqual(WANT);
    expect(rules(withCompare(fact(source() + source())))).toEqual(WANT);
  });

  it("fails a source with no date, no link, a link that is not https, or a date in the future", () => {
    expect(rules(withCompare(fact('<p data-compare-source>No link, <time datetime="2026-10-08">x</time></p>')))).toEqual(WANT);
    expect(rules(withCompare(fact('<p data-compare-source><a href="https://tool.test/x">Link</a> but no date</p>')))).toEqual(WANT);
    expect(rules(withCompare(fact('<p data-compare-source><a href="https://tool.test/x">Link</a> <time datetime="soon">soon</time></p>')))).toEqual(WANT);
    expect(rules(withCompare(fact(source("2026-10-08", "http://tool.test/x"))))).toContain("http-url compare/tool/index.html");
    expect(rules(withCompare(fact(source("2030-01-01"))))).toEqual(WANT);
  });

  it("measures a future date against the build's own day", () => {
    expect(rules(withCompare(fact(source("2026-10-08"))), { today: "2026-10-08" })).toEqual([]);
    expect(rules(withCompare(fact(source("2026-10-09"))), { today: "2026-10-08" })).toEqual(WANT);
  });

  it("leaves the index of comparisons alone", () => {
    const edit = (f) => {
      f["sitemap-0.xml"] = f["sitemap-0.xml"].replace("</urlset>", `<url><loc>${SITE_URL}compare/</loc></url></urlset>`);
      f["compare/index.html"] = page({ title: "Compare tools", description: `Index. ${LONG_DESC}`, canonicalPath: "compare/", body: "<h1>Compare</h1>" });
    };
    expect(run(edit)).toEqual([]);
  });
});

describe("features not shipped yet (SITE-08)", () => {
  const marked = (f) => {
    f["about/index.html"] = f["about/index.html"].replace("<h1>About</h1>", '<h1>About</h1><p data-unshipped="PAGES-16">Keys page</p>');
  };

  it("lets a preview build carry an unshipped marker", () => {
    const edit = (f) => {
      marked(f);
      f["about/index.html"] = f["about/index.html"].replace('<link rel="canonical"', '<meta name="robots" content="noindex, nofollow"><link rel="canonical"');
    };
    const problems = run(edit, { preview: true }).filter((r) => r.rule === "unshipped");
    expect(problems).toEqual([]);
  });

  it("fails a public build while any page carries one, naming the step", () => {
    const problems = run(marked).filter((r) => r.rule === "unshipped");
    expect(problems).toHaveLength(1);
    expect(problems[0].page).toBe("about/index.html");
    expect(problems[0].message).toContain("PAGES-16");
  });
});

describe("lighthouserc.json", () => {
  it("does not skip is-crawlable once the site is public", () => {
    const rc = JSON.parse(readFileSync(new URL("../lighthouserc.json", import.meta.url), "utf8"));
    const skipped = rc.ci.collect.settings?.skipAudits ?? [];
    if (!readSiteConfig().preview) expect(skipped).not.toContain("is-crawlable");
    else expect(skipped).toContain("is-crawlable");
  });
});
