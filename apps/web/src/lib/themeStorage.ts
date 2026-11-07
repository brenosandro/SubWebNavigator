/** Chave do persist do themeStore (Zustand) — manter igual a `name` em themeStore.ts */
export const THEME_STORAGE_KEY = '@swn:theme';

export type BaseTheme = 'light' | 'dark';
export type LayoutTheme = 'system' | 'graphite' | 'emerald' | 'ocean' | 'high-contrast';
export type SidebarColorMode = 'default' | 'icons' | 'text' | 'icons-and-text';

export const DEFAULT_LAYOUT_THEME: LayoutTheme = 'system';
export const DEFAULT_SIDEBAR_COLOR_MODE: SidebarColorMode = 'default';
export const DEFAULT_SIDEBAR_COLOR = '#f97316';

export const SIDEBAR_COLOR_MODES: Array<{
  id: SidebarColorMode;
  name: string;
  description: string;
}> = [
  {
    id: 'default',
    name: 'Padrão',
    description: 'Mantém ícones e textos com as cores neutras do tema.',
  },
  {
    id: 'icons',
    name: 'Somente ícones',
    description: 'Aplica a cor escolhida a todos os ícones da barra lateral.',
  },
  {
    id: 'text',
    name: 'Somente textos',
    description: 'Aplica a cor escolhida a todos os textos da barra lateral.',
  },
  {
    id: 'icons-and-text',
    name: 'Ícones e textos',
    description: 'Aplica a mesma cor escolhida a todos os ícones e textos.',
  },
];

export const LAYOUT_THEME_PRESETS: Array<{
  id: LayoutTheme;
  name: string;
  description: string;
  swatches: string[];
}> = [
  {
    id: 'system',
    name: 'Sistema atual',
    description: 'Design padrão do SubWebNavigator.',
    swatches: ['#ffffff', '#09090b', '#52525b'],
  },
  {
    id: 'graphite',
    name: 'Grafite',
    description: 'Neutro, denso e com contraste discreto.',
    swatches: ['#f8fafc', '#1f2937', '#334155'],
  },
  {
    id: 'emerald',
    name: 'Esmeralda',
    description: 'Fundo suave com acento verde técnico.',
    swatches: ['#f7fbf8', '#10241a', '#047857'],
  },
  {
    id: 'ocean',
    name: 'Oceano',
    description: 'Azul operacional para leitura prolongada.',
    swatches: ['#f6faff', '#0f2537', '#0369a1'],
  },
  {
    id: 'high-contrast',
    name: 'Alto contraste',
    description: 'Mais contraste para ambientes de baixa visibilidade.',
    swatches: ['#ffffff', '#020617', '#f59e0b'],
  },
];

const DARK_META = '#121212';
const LIGHT_META = '#fbfbfc';

/** Lê `light` | `dark` do JSON persistido; ignora formato inválido. */
export function parsePersistedTheme(raw: string | null): BaseTheme | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { state?: { theme?: unknown } };
    const t = p?.state?.theme;
    if (t === 'dark' || t === 'light') return t;
    return null;
  } catch {
    return null;
  }
}

export function isLayoutTheme(value: unknown): value is LayoutTheme {
  return LAYOUT_THEME_PRESETS.some((preset) => preset.id === value);
}

export function isSidebarColorMode(value: unknown): value is SidebarColorMode {
  return SIDEBAR_COLOR_MODES.some((mode) => mode.id === value);
}

export function normalizeSidebarColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_SIDEBAR_COLOR;
  const normalized = value.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (short) {
    return `#${short[1].split('').map((digit) => `${digit}${digit}`).join('')}`;
  }
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : DEFAULT_SIDEBAR_COLOR;
}

export function parsePersistedLayoutTheme(raw: string | null): LayoutTheme {
  if (!raw) return DEFAULT_LAYOUT_THEME;
  try {
    const p = JSON.parse(raw) as { state?: { layoutTheme?: unknown; visualTheme?: unknown } };
    const value = p?.state?.layoutTheme ?? p?.state?.visualTheme;
    return isLayoutTheme(value) ? value : DEFAULT_LAYOUT_THEME;
  } catch {
    return DEFAULT_LAYOUT_THEME;
  }
}

export function applyRootTheme(theme: BaseTheme, layoutTheme: LayoutTheme = DEFAULT_LAYOUT_THEME): void {
  const root = document.documentElement;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  root.dataset.layoutTheme = layoutTheme;
  if (theme === 'dark') {
    root.classList.add('dark');
    if (meta) meta.setAttribute('content', DARK_META);
  } else {
    root.classList.remove('dark');
    if (meta) meta.setAttribute('content', LIGHT_META);
  }
}
