import type { ImageMetadata } from "astro";
import { DEFAULT_THEME, THEMES, type ThemeId } from "./themes";

/**
 * The app's real screenshots (SITE-04) as the home page finds them: files in `src/assets/app/` named
 * `<shot id>-<theme>.<png|jpg|webp>` (the shot ids are the keys of APP_SHOTS in src/data/home.ts, for
 * example `library-neoDark.png`). Adding the file is the whole change: a slot is a placeholder if and
 * only if no file matches its id. A theme with no file of its own shows the default theme's.
 */
export type ShotFiles = Readonly<Record<string, { default: ImageMetadata }>>;

const files: ShotFiles = import.meta.glob<{ default: ImageMetadata }>("../assets/app/*.{png,jpg,webp}", { eager: true });

export interface ShotImage {
  theme: ThemeId;
  image: ImageMetadata;
}

/** The pictures of one shot, one per theme; empty when there is no file for it. */
export function shotImages(id: string, all: ShotFiles = files): ShotImage[] {
  const find = (theme: ThemeId): ImageMetadata | undefined => {
    for (const [path, mod] of Object.entries(all)) {
      const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.[a-z]+$/i, "");
      if (name === `${id}-${theme}`) return mod.default;
    }
    return undefined;
  };
  const fallback = find(DEFAULT_THEME);
  const out: ShotImage[] = [];
  for (const { id: theme } of THEMES) {
    const image = find(theme) ?? fallback;
    if (image) out.push({ theme, image });
  }
  return out;
}
