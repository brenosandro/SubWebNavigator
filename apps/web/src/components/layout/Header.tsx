import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Lock, LogOut, Menu, Moon, Search, Settings, ShieldAlert, ShieldCheck, Sun } from 'lucide-react';
import { initialsOf } from '@/lib/format';
import { useThemeStore } from '@/store/themeStore';
import { useSessionStore } from '@/store/sessionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { lockNow, logoutNow } from '@/lib/lock';
import { cn } from '@/lib/utils';

export default function Header() {
  const { theme, toggleTheme, setMobileMenuOpen } = useThemeStore();
  const session = useSessionStore((s) => s.session);
  const setPaletteOpen = useWorkspaceStore((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Indicador honesto: só diz "Protegido" com sessão ativa validada por chave.
  const protectedNow = session?.stage === 'ACTIVE' && session.hasSecurityKey;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const owner = session?.owner;
  const initials = initialsOf(owner?.name) || '?';

  return (
    <header className="glass-panel sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <button onClick={() => setMobileMenuOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-[#b3b3b3] dark:hover:bg-white/5 xl:hidden" aria-label="Abrir menu">
        <Menu className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-[12.5px] text-slate-400 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-[#282828] dark:bg-[#181818] dark:hover:border-[#3a3a3a] sm:max-w-sm"
        aria-label="Buscar perfis e comandos"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Buscar perfis e comandos</span>
        <kbd className="ml-auto hidden rounded border border-slate-200 px-1.5 py-0.5 font-sans text-[10px] text-slate-400 dark:border-[#333] sm:inline">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold md:inline-flex',
            protectedNow ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
          )}
          title={protectedNow ? 'Sessão ativa validada com chave de segurança' : 'Chave de segurança não validada nesta sessão'}
        >
          {protectedNow ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {protectedNow ? 'Protegido' : 'Verificação pendente'}
        </span>

        <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#b3b3b3] dark:hover:bg-white/5 dark:hover:text-white" aria-label="Alternar tema claro/escuro">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          onClick={() => void lockNow('manual')}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-[#282828] dark:bg-[#181818] dark:text-white dark:hover:bg-[#242424]"
          aria-label="Bloquear sessão agora"
        >
          <Lock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Bloquear</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)} className="flex h-9 items-center gap-1.5 rounded-md pl-1 pr-1.5 hover:bg-slate-100 dark:hover:bg-white/5" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Menu da conta">
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900">
              {owner?.avatarUrl && !imgError ? <img src={owner.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgError(true)} className="h-full w-full object-cover" /> : initials}
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
          </button>
          {menuOpen ? (
            <div role="menu" className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-premium-md dark:border-[#282828] dark:bg-[#181818]">
              <div className="border-b border-slate-100 px-3.5 py-3 dark:border-[#242424]">
                <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{owner?.name}</div>
                <div className="truncate text-[11px] text-slate-500 dark:text-[#b3b3b3]">{owner?.email}</div>
              </div>
              <div className="p-1">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/app/configuracoes');
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-slate-700 hover:bg-slate-50 dark:text-[#e0e0e0] dark:hover:bg-white/5"
                >
                  <Settings className="h-4 w-4" /> Configurações
                </button>
                <button
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false);
                    await logoutNow();
                    navigate('/login', { replace: true });
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
