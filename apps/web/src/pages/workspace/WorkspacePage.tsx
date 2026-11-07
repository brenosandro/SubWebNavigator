import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Globe, Home, Loader2, Lock, MonitorOff, MonitorPlay, Moon, Plus, RotateCw, ShieldCheck, Square, X } from 'lucide-react';
import api from '@/lib/api';
import RemoteViewport from '@/components/workspace/RemoteViewport';
import { useRemoteStream } from '@/hooks/useRemoteStream';
import { lockNow } from '@/lib/lock';
import { useProfileAction, useProfiles } from '@/hooks/useProfiles';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useSessionStore } from '@/store/sessionStore';
import { Button, EmptyState, TONE_DOT } from '@/components/shared/ui';
import { PROVIDER_LABELS, STATUS_META, type Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function WorkspacePage() {
  const { data: profiles = [], isLoading } = useProfiles();
  const { openTabs, activeId, closeTab, setActive, openTab, setNewProfileOpen } = useWorkspaceStore();
  const session = useSessionStore((s) => s.session);

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const tabs = openTabs.map((id) => byId.get(id)).filter(Boolean) as Profile[];
  const active = activeId ? byId.get(activeId) ?? null : null;
  const stream = useRemoteStream(active);
  const action = useProfileAction();
  const live = stream.state === 'live' && active?.status === 'ONLINE';

  // Abas de perfis excluídos somem sozinhas.
  useEffect(() => {
    if (isLoading) return;
    for (const id of openTabs) if (!byId.has(id)) closeTab(id);
  }, [byId, openTabs, closeTab, isLoading]);

  // Registra último uso (metadado) ao ativar um perfil.
  useEffect(() => {
    if (!activeId) return;
    void api.post(`/v1/profiles/${activeId}/touch`).catch(() => {});
  }, [activeId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tabstrip (44px) */}
      <div className="flex h-11 shrink-0 items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/70 px-2 scrollbar-hide dark:border-[#242424] dark:bg-[#0f0f0f]" role="tablist" aria-label="Abas abertas">
        {tabs.map((p) => {
          const st = STATUS_META[p.status];
          const isActive = p.id === activeId;
          return (
            <div
              key={p.id}
              className={cn(
                'group flex h-9 min-w-[140px] max-w-[220px] shrink-0 items-center gap-2 rounded-t-lg border border-b-0 pl-3 pr-1.5 text-[12px] transition-colors',
                isActive ? 'border-slate-200 bg-white font-semibold text-slate-900 dark:border-[#282828] dark:bg-[#181818] dark:text-white' : 'border-transparent text-slate-500 hover:bg-white/70 dark:text-[#b3b3b3] dark:hover:bg-white/5',
              )}
            >
              <button type="button" role="tab" aria-selected={isActive} onClick={() => setActive(p.id)} className="flex min-w-0 flex-1 items-center gap-2 focus-visible:outline-none" title={`${p.title} · ${st.label}`}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[p.colorToken] ?? TONE_DOT.slate)} aria-hidden />
                <span className="truncate">{p.title}</span>
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', st.dot)} aria-label={st.label} />
              </button>
              <button type="button" onClick={() => closeTab(p.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-70 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-white" aria-label={`Fechar aba ${p.title}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <button type="button" onClick={() => setNewProfileOpen(true)} className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Novo perfil">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {active ? (
        <>
          {/* Toolbar (42px) */}
          <div className="flex h-[42px] shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2 dark:border-[#242424] dark:bg-[#121212]">
            {(
              [
                { icon: ArrowLeft, label: 'Voltar', nav: 'back', enabled: !!stream.page?.canBack },
                { icon: ArrowRight, label: 'Avançar', nav: 'forward', enabled: !!stream.page?.canForward },
                { icon: RotateCw, label: 'Recarregar', nav: 'reload', enabled: true },
                { icon: Home, label: 'Página inicial do perfil', nav: 'home', enabled: true },
              ] as const
            ).map(({ icon: Icon, label, nav, enabled }) => (
              <button
                key={label}
                type="button"
                disabled={!live || !enabled}
                onClick={() => stream.send({ t: 'nav', a: nav })}
                title={label}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent dark:text-[#b3b3b3] dark:hover:bg-white/10 dark:disabled:text-[#444]"
                aria-label={label}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <div className="mx-2 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-500 dark:border-[#282828] dark:bg-[#181818] dark:text-[#b3b3b3]">
              {stream.page?.loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Globe className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate font-medium text-slate-700 dark:text-white">{live && stream.page?.origin ? stream.page.origin.replace('https://', '') : active.host}</span>
              <span className="hidden truncate sm:inline">{live && stream.page?.title ? `· ${stream.page.title}` : '· site oficial · perfil isolado'}</span>
              <span className="ml-auto hidden text-[11px] sm:inline">{PROVIDER_LABELS[active.provider]}</span>
            </div>
            {active.status === 'ONLINE' ? (
              <>
                <button type="button" onClick={() => action.mutate({ id: active.id, action: 'suspend' })} disabled={action.isPending} title="Suspender perfil" aria-label="Suspender perfil" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-[#b3b3b3] dark:hover:bg-white/10">
                  <Moon className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => action.mutate({ id: active.id, action: 'stop' })} disabled={action.isPending} title="Parar perfil" aria-label="Parar perfil" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-[#b3b3b3] dark:hover:bg-white/10">
                  <Square className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>

          <RemoteViewport profile={active} stream={stream} />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
          <EmptyState
            icon={MonitorOff}
            title={profiles.length ? 'Nenhuma aba aberta' : `Bem-vindo, ${session?.owner.name.split(' ')[0] ?? ''}`}
            description={
              profiles.length
                ? 'Escolha um perfil na barra lateral ou busque com ⌘K / Ctrl K.'
                : 'Crie seu primeiro perfil: cada conta (WhatsApp, Telegram, Instagram ou um site seu) vira uma identidade isolada no servidor.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={Plus} onClick={() => setNewProfileOpen(true)}>
                  Novo site
                </Button>
                {profiles.slice(0, 3).map((p) => (
                  <Button key={p.id} variant="secondary" onClick={() => openTab(p.id)}>
                    {p.title}
                  </Button>
                ))}
              </div>
            }
            className="w-full max-w-xl bg-white/60 dark:bg-transparent"
          />
        </div>
      )}

      {/* Statusbar (34px) */}
      <div className="flex h-[34px] shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50/80 px-3 text-[11px] text-slate-500 dark:border-[#242424] dark:bg-[#0f0f0f] dark:text-[#b3b3b3]" role="status" aria-live="polite">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className={cn('h-1.5 w-1.5 rounded-full', active ? STATUS_META[active.status].dot : 'bg-slate-300')} />
          {active ? `${active.title} · ${STATUS_META[active.status].label}` : 'Nenhum perfil ativo'}
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          {live ? (
            <>
              <MonitorPlay className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Transmissão segura · {stream.fps} qps
              {stream.link ? (
                <span title={`Ida e volta do quadro ${stream.link.rtt} ms · ${Math.round(stream.link.kbps / 100) / 10} Mbit/s · qualidade ${stream.link.q}`}>
                  · {stream.link.rtt} ms
                </span>
              ) : null}
            </>
          ) : (
            <>
              <MonitorOff className="h-3.5 w-3.5" /> {stream.state === 'connecting' ? 'Conectando…' : 'Sem transmissão'}
            </>
          )}
        </span>
        <span className="hidden items-center gap-1.5 md:flex">
          <ShieldCheck className="h-3.5 w-3.5" /> Inatividade: {session?.policy.idleMinutes ?? '—'} min
        </span>
        <button type="button" onClick={() => void lockNow('manual')} className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold hover:bg-slate-200/60 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white">
          <Lock className="h-3 w-3" /> Bloquear
        </button>
      </div>
    </div>
  );
}
