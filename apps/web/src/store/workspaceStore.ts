import { create } from 'zustand';

/**
 * Abas abertas no workspace. Só metadado local (ids de perfil), sem nada do
 * site remoto. Limpo a cada bloqueio para não sobrar contexto atrás da tela.
 */
interface WorkspaceState {
  openTabs: string[];
  activeId: string | null;
  newProfileOpen: boolean;
  paletteOpen: boolean;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  reset: () => void;
  setNewProfileOpen: (v: boolean) => void;
  setPaletteOpen: (v: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  openTabs: [],
  activeId: null,
  newProfileOpen: false,
  paletteOpen: false,
  openTab: (id) => set((s) => ({ openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id], activeId: id })),
  closeTab: (id) =>
    set((s) => {
      const idx = s.openTabs.indexOf(id);
      const openTabs = s.openTabs.filter((t) => t !== id);
      const activeId = s.activeId === id ? (openTabs[Math.max(0, idx - 1)] ?? null) : s.activeId;
      return { openTabs, activeId };
    }),
  setActive: (id) => set({ activeId: id }),
  reset: () => set({ openTabs: [], activeId: null, newProfileOpen: false, paletteOpen: false }),
  setNewProfileOpen: (newProfileOpen) => set({ newProfileOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
