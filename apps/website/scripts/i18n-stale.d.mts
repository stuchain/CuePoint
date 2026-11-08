export interface EnglishSource {
  source: string;
  translation(language: string): string;
}
export interface RecordedSource {
  hash: string;
  commit: string | null;
  recordedAt: string | null;
}
export interface SourcesFile {
  locales: Record<string, { files: Record<string, RecordedSource> }>;
  [key: string]: unknown;
}
export interface StalePair {
  language: string;
  source: string;
  translation: string;
  status: "stale" | "unrecorded" | "no-translation";
  commit: string | null;
}
export interface Cleared {
  source: string;
  was: "stale" | "unrecorded" | "current";
  commit: string | null;
}
export interface MainEnv {
  root?: string;
  languages?: string[];
  log?: (line: string) => void;
  error?: (line: string) => void;
  commitOf?: (root: string, source: string) => string | null;
  today?: string;
}
export const ENGLISH_SOURCES: readonly EnglishSource[];
export const SOURCES_FILE: string;
export function hashFile(path: string): string;
export function readSources(root?: string): SourcesFile;
export function findStale(root: string, languages: readonly string[], sources?: SourcesFile): StalePair[];
export function gitCommitOf(root: string, source: string): string | null;
export function recordSources(
  root: string,
  language: string,
  names: readonly string[],
  options?: { today?: string; sources?: SourcesFile; commitOf?: (root: string, source: string) => string | null },
): { sources: SourcesFile; cleared: Cleared[] };
export function main(argv: readonly string[], env?: MainEnv): number;
