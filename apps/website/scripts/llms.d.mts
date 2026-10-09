import type { AstroIntegration } from "astro";

export interface LlmsPage {
  path: string;
  url: string;
  title: string;
  description: string;
  links: string[];
}
export const LLMS_SECTIONS: readonly { title: string; match(path: string): boolean }[];
export function isIndexableFile(file: string): boolean;
export function readPages(dist: string): LlmsPage[];
export function shortTitle(title: string): string;
export function buildLlmsTxt(pages: readonly LlmsPage[], options: { siteName: string; siteUrl: string; base?: string }): string;
export function writeLlmsTxt(dist: string, options: { siteName: string; siteUrl: string; base?: string }): number;
export default function llmsTxt(options: { siteName: string }): AstroIntegration;
