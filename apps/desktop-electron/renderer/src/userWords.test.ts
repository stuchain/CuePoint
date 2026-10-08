/**
 * The words guard (DEC-155, DEC-158).
 *
 * No text the user reads says "engine", "job" or "jobs", and none is spelled the
 * British way. Both rules were broken in about thirty places before this test, so
 * it reads every source file the way the compiler does and checks each string
 * literal and each piece of JSX text.
 *
 * A literal is checked only when it reads as a sentence or a label: it has a
 * space in it, or is one capitalized word. A bare identifier, a path, a CSS class
 * or an event key ("listJobs", "/jobs/", "cp-status__job") is not text anyone
 * reads. What is left and is still not user-visible goes in ALLOWED, a file at a
 * time with its reason; keep it small, and reword instead where the string could be seen.
 */
import { describe, expect, it } from "vitest";
import ts from "typescript";

const SOURCES = import.meta.glob<string>(
  ["./**/*.{ts,tsx}", "!./**/*.d.ts", "!./**/*.test.{ts,tsx}", "!./**/*.stories.tsx", "!./test/**"],
  { query: "?raw", import: "default", eager: true },
);

const INTERNAL = /\b(engine|jobs?)\b/i;
// The forms DEC-158 names: colour, analyse, behaviour, neighbour, organise, licence.
const BRITISH =
  /colour|\banalys(e|ed|es|ing)\b|behaviour|neighbour|\borganis(e|ed|es|ing|ation|ations)\b|licence/i;

/** Where a literal is not text for the user, by file and the literal's pattern. */
const ALLOWED: { file: RegExp; reason: string }[] = [
  {
    file: /\.\/components\/(DiagnosticsDialog|LogViewerDialog)\.tsx$/,
    reason: "Diagnostics and the log viewer are developer surfaces and keep the word (DEC-155)",
  },
  {
    file: /\.\/reporting\/reporting\.ts$/,
    reason: "matches the main process's own error text to tell an outage from a bug; never shown",
  },
];

interface Hit {
  file: string;
  line: number;
  text: string;
  word: string;
}

/** Reads like text for a person rather than an identifier, path or key. */
function readsAsText(text: string): boolean {
  const t = text.trim();
  // A single token counts when it is capitalized ("Engine", "ENGINE") or ends in
  // punctuation ("Jobs:", "engine…"), case-blind; a bare lowercase word is a key.
  return (
    /\s/.test(t) ||
    /^[A-Z][A-Za-z]*[….:!?,;]*$/.test(t) ||
    /^[A-Za-z]+[….:!?,;]+$/.test(t)
  );
}

/** True for a literal in a place the user never sees: an import path, a console call. */
function isHidden(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)) {
    // import("x"), require("x")
    if (parent.expression.text === "require") return true;
  }
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  // console.warn("...") and the like are for developers.
  if (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    ts.isIdentifier(parent.expression.expression) &&
    parent.expression.expression.text === "console"
  ) {
    return true;
  }
  return false;
}

function scan(file: string, source: string): Hit[] {
  const hits: Hit[] = [];
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const check = (node: ts.Node, text: string) => {
    if (!text.trim()) return;
    const word = INTERNAL.exec(text)?.[0] ?? BRITISH.exec(text)?.[0];
    if (!word) return;
    // British spellings are looked for in every literal that reads as text; the
    // stored ids that keep them (DEC-158) are single tokens and so are skipped.
    if (!readsAsText(text) && !(node.kind === ts.SyntaxKind.JsxText)) return;
    if (isHidden(node)) return;
    if (ALLOWED.some((a) => a.file.test(file))) return;
    hits.push({
      file,
      line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      text: text.trim().slice(0, 100),
      word,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      check(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      check(node, node.head.text);
      for (const span of node.templateSpans) check(span.literal, span.literal.text);
    } else if (node.kind === ts.SyntaxKind.JsxText) {
      check(node, (node as ts.JsxText).text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return hits;
}

describe("user-visible words", () => {
  const hits = Object.entries(SOURCES).flatMap(([file, source]) => scan(file, source));

  it("never says engine, job or jobs, or a British spelling", () => {
    const report = hits.map((h) => `${h.file}:${h.line}  "${h.text}"  (${h.word})`);
    expect(report).toEqual([]);
  });

  it("looks at the source it is meant to (a guard that reads nothing passes)", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(Object.keys(SOURCES).some((f) => f.endsWith("StatusStrip.tsx"))).toBe(true);
  });

  it("finds the words in a literal, in JSX text and in a template", () => {
    const found = scan(
      "x.tsx",
      'const a = "Engine offline"; const b = <p>No jobs running</p>; const c = `Could not analyse ${a}`; const d = "listJobs"; const e = "colour"; const f = "Jobs:"; const g = "ENGINE"; const h = "engine…";',
    );
    expect(found.map((h) => h.text)).toEqual([
      "Engine offline",
      "No jobs running",
      "Could not analyse",
      "Jobs:",
      "ENGINE",
      "engine…",
    ]);
  });

  it("skips import paths and console output", () => {
    expect(
      scan("x.ts", 'import x from "engine thing"; console.warn("engine is slow");'),
    ).toEqual([]);
  });
});
