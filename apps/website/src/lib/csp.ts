/**
 * The Content-Security-Policy, as a `<meta>` tag (GitHub Pages sets no headers, fact 2).
 * `frame-ancestors` is not allowed in a meta tag, so it is left out.
 * Later steps extend the directives here (analytics, SITE-12), not in the layout.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, readonly string[]>> = {
  "default-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "style-src": ["'self'", "'unsafe-inline'"],
  // Pagefind (the guide's search, SITE-09) needs no 'wasm-unsafe-eval': it runs its WebAssembly inside its
  // own worker (pagefind-worker.js, same origin), which this policy already allows. e2e/guide-search.spec.ts
  // searches under this policy, so adding a directive "to make search work" would be a regression to question.
  "script-src": ["'self'", "'unsafe-inline'"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'", "https://api.web3forms.com"],
};

export function buildCsp(directives: Readonly<Record<string, readonly string[]>>): string {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export const CSP = buildCsp(CSP_DIRECTIVES);
