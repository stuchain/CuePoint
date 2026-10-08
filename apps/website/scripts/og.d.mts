export const OG_WIDTH: number;
export const OG_HEIGHT: number;
export { ogImagePath } from "./og-path.mjs";
export function cardTitle(title: string): string;
export function titleSize(title: string, hasPicture?: boolean): number;
export function renderOgCard(options: { title: string; picture?: Buffer; site?: string }): Promise<Buffer>;
