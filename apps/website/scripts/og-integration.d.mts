import type { AstroIntegration } from "astro";

export function writeOgCards(dist: string, options: { base: string; site: string }): Promise<string[]>;
export default function ogCards(): AstroIntegration;
