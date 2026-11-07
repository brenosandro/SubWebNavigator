import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyRootTheme, BaseTheme, DEFAULT_LAYOUT_THEME, LayoutTheme, THEME_STORAGE_KEY } from '@/lib/themeStorage';

/** Preferências visuais do shell. Só aparência — nunca dado de sessão. */
interface ThemeState {
  theme: BaseTheme;
  layoutTheme: LayoutTheme;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  setTheme: (theme: BaseTheme) => void;
  setLayoutTheme: (layoutTheme: LayoutTheme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setMobileMenuOpen: (val: boolean) => void;
}

const initialTheme = (): BaseTheme => {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initialTheme(),
      layoutTheme: DEFAULT_LAYOUT_THEME,
      sidebarCollapsed: false,
      mobileMenuOpen: false,
      setTheme: (theme) => {
        applyRootTheme(theme, get().layoutTheme);
        set({ theme });
      },
      setLayoutTheme: (layoutTheme) => {
        applyRootTheme(get().theme, layoutTheme);
        set({ layoutTheme });
      },
      toggleTheme: () =>
        set((state) => {
          const theme = state.theme === 'light' ? 'dark' : 'light';
          applyRootTheme(theme, state.layoutTheme);
          return { theme };
        }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileMenuOpen: (val) => set({ mobileMenuOpen: val }),
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (s) => ({ theme: s.theme, layoutTheme: s.layoutTheme, sidebarCollapsed: s.sidebarCollapsed }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'dark' || state?.theme === 'light') applyRootTheme(state.theme, state.layoutTheme ?? DEFAULT_LAYOUT_THEME);
      },
    },
  ),
);
