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
    file: /\.\/api\/userMessage\.ts$/,
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
  // A piece of a template or a JSX line that is padded with a space is a sentence's
  // middle (" accepted", "(accepted) "); a key is never padded.
  if (t !== text && /[A-Za-z]/.test(t) && !/^[\w-]*[-_][\w-]*$/.test(t)) return true;
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

/** The word a literal breaks, for the engine/job and British rules. */
function internalWord(text: string): string | undefined {
  return INTERNAL.exec(text)?.[0] ?? BRITISH.exec(text)?.[0];
}

function scan(
  file: string,
  source: string,
  find: (text: string, file: string) => string | undefined = internalWord,
  allowed: { file: RegExp }[] = ALLOWED,
): Hit[] {
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
    const word = find(text, file);
    if (!word) return;
    // British spellings are looked for in every literal that reads as text; the
    // stored ids that keep them (DEC-158) are single tokens and so are skipped.
    if (!readsAsText(text) && !(node.kind === ts.SyntaxKind.JsxText)) return;
    if (isHidden(node)) return;
    if (allowed.some((a) => a.file.test(file))) return;
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

/**
 * The glossary guard (docs/user-guide/glossary.md, "Words CuePoint uses").
 *
 * One word for each idea: the "never" form is what older screens said. Each
 * entry is checked in every literal that reads as text, the same way as above.
 */
const TOKEN = /\btokens?\b/i;
const RESTORE_APPROVED: { file: RegExp; text: string }[] = [
  ...["Restoring", "Restoring your library…"].map((text) => ({ file: /\.\/components\/shell\/OfflineBanner\.tsx$/, text })),
  { file: /\.\/components\/shell\/StatusStrip\.tsx$/, text: "Cancel restore" },
  ...["Restoring your library…", "Cancel restore"].map((text) => ({ file: /\.\/screens\/BackupsSection\.tsx$/, text })),
  ...["Restore the backup from", "Restore"].map((text) => ({ file: /\.\/screens\/backups\/BackupRows\.tsx$/, text })),
  { file: /\.\/screens\/backups\/backupWords\.ts$/, text: "Before restoring" },
  { file: /\.\/screens\/backups\/restoreStore\.ts$/, text: "Restores your library when" },
  ...[
    "Restore when they are done, or stop them and restore now.",
    "Restore when it's done, or stop it and restore now.",
    "Restore this backup?",
    "Stop it and restore now",
    "Restore when done",
    "Restore",
  ].map((text) => ({ file: /\.\/screens\/backups\/useRestoreFlow\.tsx$/, text })),
  ...[
    ". Install the newer version, or restore a backup from before it.",
    "Restore that copy",
    "Restore this backup",
    "Choose the backup to restore. Your library file as it is now is set aside first.",
    "There are no backups to restore.",
    "Restoring your library…",
  ].map((text) => ({ file: /\.\/screens\/recovery\/LibraryRecovery\.tsx$/, text })),
];

const GLOSSARY: { never: RegExp; say: string; only?: RegExp; approved?: { file: RegExp; text: string }[] }[] = [
  { never: TOKEN, say: "Sign in to Beatport" },
  { never: /\b(revert|reverted|reverting|reverts|put back)\b/i, say: "Undo" },
  { never: /\bgo back to\b/i, say: "Undo" },
  {
    never: /\brestor(e|ed|es|ing)\b/i,
    say: "Undo",
    // A backup is restored (HARDEN-01, DEC-305): "Undo" is for taking back a change, not for going back to a
    // copy. Only these exact words, in these files.
    approved: RESTORE_APPROVED,
  },
  { never: /\baccepted\b/i, say: "confirmed (a match), Mark OK (a warning)" },
  { never: /rekordbox export|xml export|your export|this export/i, say: "Rekordbox file" },
  { never: /library service/i, say: "not named (CuePoint stopped working in the background)" },
  { never: /rekordbox collection/i, say: "Rekordbox file" },
  { never: /save changes into the files|into the files themselves/i, say: "Sync to files" },
  { never: /\bundo accept\b|^accept$/i, say: "Mark OK (a Prepare warning)" },
  { never: /import another file/i, say: "Import a Rekordbox file…" },
  { never: /\bwrit(e|ing) tags\b/i, say: "Sync to files" },
  { never: /\(not used\)|\bno value\b/i, say: "— in a table, not set in a sentence" },
  {
    never: /\bnew search\b|this search found/i,
    say: "New dig / This dig found nothing",
    only: /\.\/(screens\/discover|components\/discover)\//,
  },
];

/**
 * Where a never-form is not a word the user reads as that idea, by file and why.
 * ("engine" in Diagnostics and the log viewer is allowed by ALLOWED above.)
 */
const GLOSSARY_ALLOWED: { file: RegExp; text: RegExp; reason: string }[] = [
  {
    file: /\.\/screens\/BeatportSettingsPanel\.tsx$/,
    text: /^(Paste a token instead|Beatport token|Paste a new token to replace the saved one|Paste your Beatport access token|Loading token status…|Save token|Saved token|\. Paste a new one to replace it\.)$/,
    reason: "the pasted-token fallback behind \"Paste a token instead\" (glossary)",
  },
  {
    file: /\.\/hooks\/useBeatportToken\.ts$/,
    text: /^Could not save the token\. Try again\.$/,
    reason: "the pasted-token fallback's own error (glossary)",
  },
];

function glossaryWord(text: string, file: string): string | undefined {
  for (const g of GLOSSARY) {
    if (g.only && !g.only.test(file)) continue;
    if (g.approved?.some((a) => a.file.test(file) && a.text === text.trim())) continue;
    const m = g.never.exec(text);
    if (!m) continue;
    if (g.never === TOKEN && GLOSSARY_ALLOWED.some((a) => a.file.test(file) && a.text.test(text.trim()))) continue;
    return `${m[0]} -> ${g.say}`;
  }
  return undefined;
}

describe("the glossary", () => {
  it("uses one word for each idea", () => {
    const report = Object.entries(SOURCES)
      .flatMap(([file, source]) => scan(file, source, glossaryWord, []))
      .map((h) => `${h.file}:${h.line}  "${h.text}"  (${h.word})`);
    expect(report).toEqual([]);
  });

  it("finds a never-form in a literal, in JSX text and in a template", () => {
    const found = scan(
      "./screens/discover/x.tsx",
      'const a = "Revert this"; const b = <p>Your export is old</p>; const c = `Paste a token ${a}`; const d = "tokenKey"; const e = "New search";',
      glossaryWord,
      [],
    );
    expect(found.map((h) => h.text)).toEqual([
      "Revert this",
      "Your export is old",
      "Paste a token",
      "New search",
    ]);
  });
});

describe("one user message for every failure", () => {
  const files = Object.entries(SOURCES);
  const MESSAGE_OF = /(function|const|let)\s+messageOf\b/;
  const INLINE = /instanceof Error\s*\?\s*\w+\.message/;

  /** Files that may keep the inline form, with the reason. */
  const KEPT: { file: RegExp; reason: string }[] = [
    { file: /^\.\/api\/userMessage\.ts$/, reason: "the one function" },
    { file: /^\.\/reporting\//, reason: "reporting reads the raw error text" },
    { file: /^\.\/api\/bridgeError\.ts$/, reason: "reads the error's own fields" },
  ];

  it("defines messageOf nowhere but api/userMessage.ts", () => {
    const found = files
      .filter(([file, source]) => file !== "./api/userMessage.ts" && MESSAGE_OF.test(source))
      .map(([file]) => file);
    expect(found).toEqual([]);
  });

  it("never turns a caught error into text by hand", () => {
    const found = files
      .filter(([file, source]) => !KEPT.some((k) => k.file.test(file)) && INLINE.test(source))
      .map(([file]) => file);
    expect(found).toEqual([]);
  });
});
