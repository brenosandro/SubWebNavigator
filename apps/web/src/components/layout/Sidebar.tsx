import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Layers, PanelLeft, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/themeStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useProfiles } from '@/hooks/useProfiles';
import { DatatomsLogo } from '@/assets/logo/logo';
import { GROUP_LABELS, GROUP_ORDER, STATUS_META, type Profile } from '@/lib/types';
import { TONE_DOT } from '@/components/shared/ui';

const NAV = [
  { icon: Home, label: 'Início', path: '/app', end: true },
  { icon: Layers, label: 'Perfis', path: '/app/perfis', end: false },
  { icon: Settings, label: 'Configurações', path: '/app/configuracoes', end: false },
];

export function SidebarContent({ collapsed = false, onItemClick }: { collapsed?: boolean; onItemClick?: () => void }) {
  const navigate = useNavigate();
  const { data: profiles = [] } = useProfiles();
  const { activeId, openTab, setNewProfileOpen } = useWorkspaceStore();

  const groups = useMemo(() => {
    const by = new Map<string, Profile[]>();
    for (const p of [...profiles].sort((a, b) => a.orderIndex - b.orderIndex)) {
      const key = p.pinned ? 'FAVORITOS' : p.group;
      by.set(key, [...(by.get(key) ?? []), p]);
    }
    return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({ key: g, title: GROUP_LABELS[g], items: by.get(g)! }));
  }, [profiles]);

  const open = (p: Profile) => {
    openTab(p.id);
    navigate('/app');
    onItemClick?.();
  };

  const itemBase = 'group relative flex w-full items-center gap-2.5 rounded-md text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 scrollbar-hover" aria-label="Navegação do workspace">
        <div className="space-y-0.5 px-2">
          {NAV.map(({ icon: Icon, label, path, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={onItemClick}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  itemBase,
                  collapsed ? 'h-9 justify-center' : 'h-8 px-2.5',
                  isActive ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-[#b3b3b3] dark:hover:bg-white/5 dark:hover:text-white',
                )
              }
            >
              <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </div>

        {groups.map((g) => (
          <div key={g.key} className="space-y-0.5 px-2">
            {!collapsed ? <div className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-[#8a8a8a]">{g.title}</div> : <div className="mx-auto my-1 h-px w-6 bg-slate-200 dark:bg-white/10" />}
            {g.items.map((p) => {
              const st = STATUS_META[p.status];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => open(p)}
                  title={collapsed ? `${p.title} · ${st.label}` : undefined}
                  aria-label={`Abrir ${p.title} (${st.label})`}
                  className={cn(
                    itemBase,
                    collapsed ? 'h-9 justify-center' : 'h-8 px-2.5 text-left',
                    activeId === p.id ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-[#b3b3b3] dark:hover:bg-white/5 dark:hover:text-white',
                  )}
                >
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white', TONE_DOT[p.colorToken] ?? TONE_DOT.slate)}>{p.title.slice(0, 1).toUpperCase()}</span>
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{p.title}</span>}
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', st.dot, collapsed && 'absolute right-1.5 top-1.5')} aria-hidden />
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-2 dark:border-[#282828]">
        <button
          type="button"
          onClick={() => {
            setNewProfileOpen(true);
            onItemClick?.();
          }}
          title={collapsed ? 'Novo site' : undefined}
          className={cn(itemBase, collapsed ? 'h-9 justify-center' : 'h-9 px-2.5', 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-[#b3b3b3] dark:hover:bg-white/5 dark:hover:text-white')}
        >
          <Plus className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
          {!collapsed && <span>Novo site</span>}
        </button>
      </div>
    </div>
  );
}

/** Sidebar desktop: 248px expandida, 68px recolhida (rail). */
export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useThemeStore();
  return (
    <aside className={cn('swn-app-shell hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-white/5 dark:bg-[#121212] xl:flex', sidebarCollapsed ? 'w-[68px]' : 'w-[248px]')} aria-label="Barra lateral">
      <div className={cn('flex h-14 shrink-0 items-center border-b border-slate-200 dark:border-[#282828]', sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3')}>
        {!sidebarCollapsed ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-[#282828] dark:bg-[#121212]">
              <DatatomsLogo size={26} />
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">SubWebNavigator</span>
              <span className="truncate text-[11px] text-slate-400">Navegação remota</span>
            </div>
          </div>
        ) : null}
        <button onClick={toggleSidebar} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#282828] dark:hover:text-white" aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}>
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <SidebarContent collapsed={sidebarCollapsed} />
    </aside>
  );
}
