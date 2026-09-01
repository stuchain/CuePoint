import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  deleteCustomTheme as deleteStoredCustomTheme,
  listCustomThemes,
  saveCustomTheme as persistCustomTheme,
  type CustomTheme,
  type CustomThemeColors,
} from "./customThemes";
import {
  applyCustomThemeColors,
  getAllThemeOptions,
  getStoredThemeId,
  initTheme,
  reapplyStoredTheme,
  setTheme as applyAndPersistTheme,
  type ThemeId,
  type ThemeOption,
} from "./theme";

interface ThemeContextValue {
  activeThemeId: ThemeId;
  themeOptions: ThemeOption[];
  customThemes: CustomTheme[];
  setTheme: (themeId: ThemeId) => void;
  refreshCustomThemes: () => void;
  saveCustomTheme: (theme: CustomTheme) => CustomTheme;
  deleteCustomTheme: (id: string) => void;
  previewCustomColors: (colors: CustomThemeColors) => void;
  endPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(() => initTheme());
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() => listCustomThemes());

  const refreshCustomThemes = useCallback(() => {
    setCustomThemes(listCustomThemes());
  }, []);

  // `getAllThemeOptions` reads the stored custom themes rather than taking them
  // as an argument, so `customThemes` is the signal that they changed. Without
  // it the option list goes stale as soon as one is added or deleted.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const themeOptions = useMemo(() => getAllThemeOptions(), [customThemes]);

  const setTheme = useCallback((themeId: ThemeId) => {
    applyAndPersistTheme(themeId);
    setActiveThemeId(themeId);
  }, []);

  const saveCustomTheme = useCallback(
    (theme: CustomTheme) => {
      const saved = persistCustomTheme(theme);
      refreshCustomThemes();
      setTheme(`custom:${saved.id}` as ThemeId);
      return saved;
    },
    [refreshCustomThemes, setTheme],
  );

  const deleteCustomTheme = useCallback(
    (id: string) => {
      deleteStoredCustomTheme(id);
      refreshCustomThemes();
      const current = getStoredThemeId();
      const bare = id.replace(/^custom:/, "");
      if (current === `custom:${bare}` || current === id) {
        setTheme("neoDark");
      }
    },
    [refreshCustomThemes, setTheme],
  );

  const previewCustomColors = useCallback((colors: CustomThemeColors) => {
    applyCustomThemeColors(colors, "editor-preview");
  }, []);

  const endPreview = useCallback(() => {
    const restored = reapplyStoredTheme();
    setActiveThemeId(restored);
  }, []);

  const value = useMemo(
    () => ({
      activeThemeId,
      themeOptions,
      customThemes,
      setTheme,
      refreshCustomThemes,
      saveCustomTheme,
      deleteCustomTheme,
      previewCustomColors,
      endPreview,
    }),
    [
      activeThemeId,
      themeOptions,
      customThemes,
      setTheme,
      refreshCustomThemes,
      saveCustomTheme,
      deleteCustomTheme,
      previewCustomColors,
      endPreview,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
