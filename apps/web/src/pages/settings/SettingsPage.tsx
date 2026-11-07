import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Info, KeyRound, Monitor, Moon, Palette, ScrollText, Settings, Shield, Sun } from 'lucide-react';
import { PageScroll } from '@/components/layout/AppLayout';
import { Badge, Button, Card, EmptyState, PageHeader, Select, SettingsRow, type Tone } from '@/components/shared/ui';
import { useThemeStore } from '@/store/themeStore';
import { LAYOUT_THEME_PRESETS } from '@/lib/themeStorage';
import api from '@/lib/api';
import { AUDIT_LABELS, auditLabel, type AuditItem } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SecurityKeysSection, SecurityPolicySection, SessionsSection } from './SecuritySections';

type SectionId = 'aparencia' | 'seguranca' | 'chaves' | 'sessoes' | 'auditoria' | 'sobre';

const SECTIONS: Array<{ id: SectionId; label: string; icon: typeof Settings }> = [
  { id: 'aparencia', label: 'Aparência', icon: Palette },
  { id: 'seguranca', label: 'Segurança', icon: Shield },
  { id: 'chaves', label: 'Chaves de segurança', icon: KeyRound },
  { id: 'sessoes', label: 'Sessões', icon: Monitor },
  { id: 'auditoria', label: 'Auditoria', icon: ScrollText },
  { id: 'sobre', label: 'Sobre', icon: Info },
];

function AppearanceSection() {
  const { theme, setTheme, layoutTheme, setLayoutTheme } = useThemeStore();
  return (
    <Card title="Aparência" subtitle="Preferência guardada só neste navegador.">
      <SettingsRow title="Tema" description="Claro ou escuro.">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#282828] dark:bg-[#181818]" role="radiogroup" aria-label="Tema">
          {[
            { v: 'light' as const, label: 'Claro', icon: Sun },
            { v: 'dark' as const, label: 'Escuro', icon: Moon },
          ].map(({ v, label, icon: Icon }) => (
            <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => setTheme(v)} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold', theme === v ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2a2a2a] dark:text-white' : 'text-slate-500 dark:text-[#b3b3b3]')}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </SettingsRow>
      <div className="pt-4">
        <div className="mb-2 text-[13px] font-semibold text-slate-800 dark:text-white">Paleta</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LAYOUT_THEME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={layoutTheme === p.id}
              onClick={() => setLayoutTheme(p.id)}
              className={cn('rounded-xl border p-3 text-left transition', layoutTheme === p.id ? 'border-slate-900 dark:border-white' : 'border-slate-200 hover:border-slate-300 dark:border-[#282828]')}
            >
              <div className="flex gap-1">
                {p.swatches.map((c) => (
                  <span key={c} className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="mt-2 text-[12.5px] font-semibold text-slate-900 dark:text-white">{p.name}</div>
              <div className="text-[11px] text-slate-500 dark:text-[#b3b3b3]">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

const RESULT_TONE: Record<AuditItem['result'], { tone: Tone; label: string }> = {
  SUCCESS: { tone: 'emerald', label: 'Sucesso' },
  DENIED: { tone: 'amber', label: 'Negado' },
  FAILURE: { tone: 'rose', label: 'Falha' },
};

function AuditSection() {
  const [eventCode, setEventCode] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['audit', eventCode],
    initialPageParam: '' as string,
    queryFn: async ({ pageParam }) =>
      (await api.get<{ items: AuditItem[]; nextCursor: string | null }>('/v1/audit', { params: { limit: 50, cursor: pageParam || undefined, eventCode: eventCode || undefined } })).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card
      title="Auditoria"
      subtitle="Eventos de acesso e configuração. Nunca contém conteúdo de sites ou mensagens."
      actions={
        <Select value={eventCode} onChange={(e) => setEventCode(e.target.value)} className="h-8 min-h-8 w-56 text-[12px]" aria-label="Filtrar por evento">
          <option value="">Todos os eventos</option>
          {Object.entries(AUDIT_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
      }
    >
      {query.isLoading ? (
        <p className="text-[12px] text-slate-400">Carregando…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum evento" />
      ) : (
        <ol className="relative space-y-0 border-l border-slate-200 pl-4 dark:border-[#282828]">
          {items.map((it) => {
            const r = RESULT_TONE[it.result] ?? RESULT_TONE.SUCCESS;
            return (
              <li key={it.id} className="relative py-2.5">
                <span className={cn('absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-[#181818]', it.result === 'SUCCESS' ? 'bg-emerald-500' : it.result === 'DENIED' ? 'bg-amber-500' : 'bg-rose-500')} aria-hidden />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-white">{auditLabel(it.eventCode)}</span>
                  <Badge tone={r.tone}>{r.label}</Badge>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-[#b3b3b3]">
                  {formatDateTime(it.createdAt)}
                  {it.ipMasked ? ` · IP ${it.ipMasked}` : ''}
                  {it.targetProfileId ? ' · perfil' : ''}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {query.hasNextPage ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            Carregar mais
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function AboutSection() {
  return (
    <Card title="Sobre" subtitle="SubWebNavigator · versão 0.1.0">
      <div className="space-y-3 text-[13px] leading-6 text-slate-600 dark:text-[#b3b3b3]">
        <p>
          Fase atual: <strong className="text-slate-900 dark:text-white">protótipo funcional (P1–P3)</strong> — login Google, chave de segurança obrigatória, sessão com bloqueio no servidor, perfis isolados, navegador remoto, política, dispositivos e auditoria.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>O navegador remoto (worker Chromium isolado e transmissão de tela) ainda não está implantado: perfis podem ser cadastrados, mas não abrem sites nesta versão.</li>
          <li>Sessões de WhatsApp, Telegram, Instagram e outros podem expirar a critério desses serviços.</li>
          <li>O computador visitante continua sujeito a malware e captura de tela; bloqueie ao se afastar.</li>
          <li>Esta versão não passou pelos gates de segurança de produção (P5/P6). Não use contas reais ainda.</li>
        </ul>
        <p className="text-[12px]">
          <a href="/termos" className="font-medium hover:underline">
            Termos de Uso
          </a>{' '}
          ·{' '}
          <a href="/privacidade" className="font-medium hover:underline">
            Política de Privacidade
          </a>
        </p>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>('seguranca');

  return (
    <PageScroll>
      <PageHeader icon={Settings} title="Configurações" subtitle="Preferências do workspace, segurança e auditoria." />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Seções de configurações" className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide lg:flex-col lg:overflow-visible">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={section === id ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                section === id ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-[#b3b3b3] dark:hover:bg-white/5',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === 'aparencia' && <AppearanceSection />}
          {section === 'seguranca' && <SecurityPolicySection />}
          {section === 'chaves' && <SecurityKeysSection />}
          {section === 'sessoes' && <SessionsSection />}
          {section === 'auditoria' && <AuditSection />}
          {section === 'sobre' && <AboutSection />}
        </div>
      </div>
    </PageScroll>
  );
}
