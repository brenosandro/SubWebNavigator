import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import Sidebar, { SidebarContent } from './Sidebar';
import Header from './Header';
import CommandPalette from './CommandPalette';
import NewProfileModal from '@/components/profiles/NewProfileModal';
import { useThemeStore } from '@/store/themeStore';
import { useIdleLock } from '@/hooks/useIdleLock';
import { cn } from '@/lib/utils';
import { DatatomsLogo } from '@/assets/logo/logo';
import LoadingScreen from '../shared/LoadingScreen';

export default function AppLayout() {
  const { mobileMenuOpen, setMobileMenuOpen } = useThemeStore();
  const location = useLocation();
  useIdleLock();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  return (
    <div className="swn-app-shell flex h-[100dvh] min-h-full w-full overflow-hidden bg-white dark:bg-[#121212]">
      <div className={cn('fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 xl:hidden', mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0')} onClick={() => setMobileMenuOpen(false)} aria-hidden />

      <aside
        className={cn(
          'swn-app-shell fixed inset-y-0 left-0 z-[101] flex w-[260px] max-w-[calc(100vw-3rem)] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-white/5 dark:bg-[#121212] xl:hidden',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Menu"
        aria-hidden={!mobileMenuOpen}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-[#282828]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-[#282828] dark:bg-[#121212]">
              <DatatomsLogo size={26} />
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">SubWebNavigator</span>
              <span className="truncate text-[11px] text-slate-400">Navegação remota</span>
            </div>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#282828] dark:hover:text-white" aria-label="Fechar menu">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
        </div>
      </aside>

      <Sidebar />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={<LoadingScreen />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <NewProfileModal />
      <CommandPalette />
    </div>
  );
}

/** Área de página rolável com respiro padrão (perfis, configurações). */
export function PageScroll({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4 lg:p-6">{children}</div>;
}
