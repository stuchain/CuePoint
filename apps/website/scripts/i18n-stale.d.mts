export interface EnglishSource {
  source: string;
  translation(language: string): string;
}
export interface SourcesFile {
  locales: Record<string, { recordedAt: string; hashes: Record<string, string> }>;
  [key: string]: unknown;
}
export interface StalePair {
  language: string;
  source: string;
  translation: string;
  status: "stale" | "unrecorded" | "no-translation";
}
export const ENGLISH_SOURCES: readonly EnglishSource[];
export const SOURCES_FILE: string;
export function hashFile(path: string): string;
export function readSources(root?: string): SourcesFile;
export function findStale(root: string, languages: readonly string[], sources?: SourcesFile): StalePair[];
export function recordLanguage(root: string, language: string, today?: string, sources?: SourcesFile): SourcesFile;
