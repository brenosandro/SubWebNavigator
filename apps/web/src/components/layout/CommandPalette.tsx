import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { Globe, Lock, Plus, Search, Settings, type LucideIcon } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useProfiles } from '@/hooks/useProfiles';
import { lockNow } from '@/lib/lock';
import { cn } from '@/lib/utils';

type Command = { id: string; label: string; hint?: string; icon: LucideIcon; run: () => void };

/** Paleta de comandos (⌘/Ctrl+K). Nenhum comando sensível roda sem autenticação. */
export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openTab, setNewProfileOpen } = useWorkspaceStore();
  const { data: profiles = [] } = useProfiles();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!useWorkspaceStore.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setIndex(0);
    }
  }, [paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const close = () => setPaletteOpen(false);
    const base: Command[] = [
      ...profiles.map((p) => ({
        id: `p-${p.id}`,
        label: `Abrir ${p.title}`,
        hint: p.host,
        icon: Globe,
        run: () => {
          close();
          openTab(p.id);
          navigate('/app');
        },
      })),
      { id: 'new', label: 'Novo perfil', icon: Plus, run: () => (close(), setNewProfileOpen(true)) },
      { id: 'lock', label: 'Bloquear agora', icon: Lock, run: () => (close(), void lockNow('manual')) },
      { id: 'settings', label: 'Configurações', icon: Settings, run: () => (close(), navigate('/app/configuracoes')) },
    ];
    const q = query.trim().toLowerCase();
    return q ? base.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q)) : base;
  }, [profiles, query, navigate, openTab, setNewProfileOpen, setPaletteOpen]);

  useEffect(() => setIndex(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(commands.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commands[index]?.run();
    }
  };

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[170] bg-slate-900/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-[171] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl outline-none dark:border-[#282828] dark:bg-[#161616]/95" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Buscar perfis e comandos</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 dark:border-[#242424]">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar perfil ou comando…"
              className="h-12 w-full bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={commands[index] ? `cmd-${commands[index].id}` : undefined}
            />
            <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-[#333]">Esc</kbd>
          </div>
          <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
            {commands.length === 0 ? <li className="px-3 py-6 text-center text-[12px] text-slate-400">Nada encontrado.</li> : null}
            {commands.map((c, i) => (
              <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={c.run}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px]', i === index ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-600 dark:text-[#b3b3b3]')}
                >
                  <c.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{c.label}</span>
                  {c.hint ? <span className="ml-auto truncate text-[11px] text-slate-400">{c.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
