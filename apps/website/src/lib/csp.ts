import { PUBLIC } from "../../site.config";

/**
 * The Content-Security-Policy, as a `<meta>` tag (GitHub Pages sets no headers, fact 2).
 * `frame-ancestors` is not allowed in a meta tag, so it is left out.
 * Later steps extend the directives here (analytics, SITE-12), not in the layout.
 */
export type Directives = Readonly<Record<string, readonly string[]>>;

/**
 * Umami Cloud's hosts (DEC-192), allowed only in a public build, the only one that loads its script.
 * The script comes from cloud.umami.is and sends its events to the host it was loaded from, or to
 * api-gateway.umami.dev; both are connect targets.
 */
const UMAMI_SCRIPT_HOSTS = ["https://cloud.umami.is"] as const;
const UMAMI_CONNECT_HOSTS = ["https://cloud.umami.is", "https://api-gateway.umami.dev"] as const;

export function directivesFor(isPublic: boolean): Directives {
  return {
    "default-src": ["'self'"],
    "img-src": ["'self'", "data:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Pagefind (the guide's search, SITE-09) needs no 'wasm-unsafe-eval': it runs its WebAssembly inside its
    // own worker (pagefind-worker.js, same origin), which this policy already allows. e2e/guide-search.spec.ts
    // searches under this policy, so adding a directive "to make search work" would be a regression to question.
    "script-src": ["'self'", "'unsafe-inline'", ...(isPublic ? UMAMI_SCRIPT_HOSTS : [])],
    "font-src": ["'self'"],
    // the forms send with fetch (Web3Forms, DEC-193)
    "connect-src": ["'self'", "https://api.web3forms.com", ...(isPublic ? UMAMI_CONNECT_HOSTS : [])],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://api.web3forms.com"],
  };
}

export const CSP_DIRECTIVES: Directives = directivesFor(PUBLIC);

export function buildCsp(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export const CSP = buildCsp(CSP_DIRECTIVES);
