export interface StillVariant {
  frame?: string | undefined;
  tall?: boolean;
}
export const ROOT: string;
export const STILLS_DIR: string;
export const MANIFEST: string;
export const STILL_VARIANTS: Readonly<Record<string, { frames: string[]; tall: boolean }>>;
export function sceneNames(): string[];
export function themeIds(): string[];
export function sourceFiles(scene: string): string[];
export function threeVersion(): string;
export function sourceHash(scene: string): string;
export function variantsOf(scene: string): StillVariant[];
export function stillStem(scene: string, variant?: StillVariant): string;
export function stillPath(scene: string, theme: string, variant?: StillVariant): string;
export function readManifest(): Record<string, { sourceHash: string; themes: string[] }>;
export function stillProblems(): string[];
