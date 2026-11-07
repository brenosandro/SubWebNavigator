import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, KeyRound, LogOut, Monitor, Pencil, Plus, Trash2, X } from 'lucide-react';
import api, { apiErrorCode, apiErrorMessage, fetchSession } from '@/lib/api';
import { registerSecurityKey, withStepUp } from '@/lib/webauthn';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SecurityKeyRow, SecurityPolicy, ViewerSessionRow } from '@/lib/types';
import { Badge, Button, Card, EmptyState, Input, SegmentedControl, SettingsRow, Toggle } from '@/components/shared/ui';
import ConfirmDangerDialog from '@/components/shared/ConfirmDangerDialog';

/* ── Segurança: política ──────────────────────────────────────────────────── */

type PolicyDraft = Omit<SecurityPolicy, 'updatedAt' | 'requireStepUp'>;

export function SecurityPolicySection() {
  const qc = useQueryClient();
  const { data: policy, isLoading } = useQuery({ queryKey: ['security-policy'], queryFn: async () => (await api.get<SecurityPolicy>('/v1/security-policy')).data });
  const [draft, setDraft] = useState<PolicyDraft | null>(null);

  useEffect(() => {
    if (policy) {
      const { updatedAt: _u, requireStepUp: _r, ...rest } = policy;
      setDraft(rest);
    }
  }, [policy]);

  const save = useMutation({
    mutationFn: async (patch: Partial<PolicyDraft>) => withStepUp(async () => (await api.patch<SecurityPolicy>('/v1/security-policy', patch)).data),
    onSuccess: async (data) => {
      qc.setQueryData(['security-policy'], data);
      await fetchSession().catch(() => {});
      toast.success('Política de segurança salva.');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível salvar a política.')),
  });

  if (isLoading || !draft || !policy) return <Card title="Política de segurança">Carregando…</Card>;

  const set = <K extends keyof PolicyDraft>(k: K, v: PolicyDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const changed = (Object.keys(draft) as Array<keyof PolicyDraft>).filter((k) => draft[k] !== policy[k]);
  const patch = Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<PolicyDraft>;
  const risky = draft.allowClipboard || draft.allowUpload || draft.allowDownload;

  return (
    <Card
      title="Política de segurança"
      subtitle={`Aplicada pelo servidor · atualizada ${formatRelative(policy.updatedAt)}`}
      actions={
        <Button size="sm" disabled={changed.length === 0} loading={save.isPending} onClick={() => save.mutate(patch)} icon={KeyRound}>
          Salvar
        </Button>
      }
    >
      <SettingsRow title="Bloquear por inatividade" description="Sem interação humana por este tempo, o controle e a transmissão são cortados no servidor.">
        <SegmentedControl label="Minutos de inatividade" value={draft.idleMinutes} onChange={(v) => set('idleMinutes', v)} options={[1, 5, 15, 30].map((m) => ({ value: m as PolicyDraft['idleMinutes'], label: `${m} min` }))} />
      </SettingsRow>
      <SettingsRow title="Tempo máximo de controle" description="Mesmo em uso contínuo, a chave é pedida de novo ao atingir este tempo.">
        <SegmentedControl label="Minutos de controle" value={draft.absoluteMinutes} onChange={(v) => set('absoluteMinutes', v)} options={[15, 30, 60].map((m) => ({ value: m as PolicyDraft['absoluteMinutes'], label: `${m} min` }))} />
      </SettingsRow>
      <SettingsRow title="Bloquear ao trocar de aba ou minimizar" description="Recomendado em computadores compartilhados.">
        <Toggle label="Bloquear ao perder o foco" checked={draft.lockOnBlur} onChange={(v) => set('lockOnBlur', v)} />
      </SettingsRow>
      <SettingsRow title="Suspender perfis inativos após" description="Perfil suspenso pode deixar de receber notificações do site em tempo real.">
        <SegmentedControl label="Minutos até suspender" value={draft.suspendInactiveMinutes} onChange={(v) => set('suspendInactiveMinutes', v)} options={[5, 15, 30, 60].map((m) => ({ value: m as PolicyDraft['suspendInactiveMinutes'], label: `${m}` }))} />
      </SettingsRow>
      <SettingsRow title="Área de transferência" description="Copiar e colar entre este computador e o navegador remoto.">
        <Toggle label="Permitir área de transferência" checked={draft.allowClipboard} onChange={(v) => set('allowClipboard', v)} />
      </SettingsRow>
      <SettingsRow title="Enviar arquivos (upload)" description="Arquivos do visitante para o site remoto.">
        <Toggle label="Permitir upload" checked={draft.allowUpload} onChange={(v) => set('allowUpload', v)} />
      </SettingsRow>
      <SettingsRow title="Baixar arquivos (download)" description="Arquivos do site remoto para este computador.">
        <Toggle label="Permitir download" checked={draft.allowDownload} onChange={(v) => set('allowDownload', v)} />
      </SettingsRow>
      {risky ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Transferências tiram dados do servidor para o computador visitante. Mesmo liberadas, cada operação exigirá confirmação quando o runtime remoto estiver disponível.
        </p>
      ) : null}
      <p className="mt-3 text-[11.5px] text-slate-400">Salvar alterações pede a chave de segurança se a última confirmação tiver mais de 5 minutos.</p>
    </Card>
  );
}

/* ── Chaves de segurança ──────────────────────────────────────────────────── */

export function SecurityKeysSection() {
  const qc = useQueryClient();
  const { data: keys = [], isLoading } = useQuery({ queryKey: ['security-keys'], queryFn: async () => (await api.get<SecurityKeyRow[]>('/v1/security-keys')).data });
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('Chave reserva');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [removing, setRemoving] = useState<SecurityKeyRow | null>(null);
  const [removeError, setRemoveError] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['security-keys'] });

  const add = useMutation({
    mutationFn: async () => withStepUp(() => registerSecurityKey({ label: newLabel.trim() || 'Chave reserva' })),
    onSuccess: () => {
      toast.success('Chave cadastrada.');
      setAdding(false);
      setNewLabel('Chave reserva');
      void refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível cadastrar a chave.')),
  });

  const rename = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => (await api.patch(`/v1/security-keys/${id}`, { label })).data,
    onSuccess: () => {
      setRenaming(null);
      void refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível renomear.')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => withStepUp(() => api.delete(`/v1/security-keys/${id}`)),
    onSuccess: () => {
      toast.success('Chave removida.');
      setRemoving(null);
      void refresh();
    },
    onError: (err) => setRemoveError(apiErrorCode(err) === 'LAST_KEY' ? 'Esta é a única chave cadastrada. Cadastre outra antes de remover esta.' : apiErrorMessage(err, 'Não foi possível remover.')),
  });

  return (
    <Card
      title="Chaves de segurança"
      subtitle="Chaves físicas WebAuthn. O servidor guarda só a chave pública."
      actions={
        <Button size="sm" icon={Plus} onClick={() => setAdding((v) => !v)}>
          Adicionar chave
        </Button>
      }
    >
      {adding ? (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-[#282828] sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Nome da nova chave</span>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={60} />
          </label>
          <Button icon={KeyRound} loading={add.isPending} onClick={() => add.mutate()}>
            Tocar na nova chave
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-[12px] text-slate-400">Carregando…</p>
      ) : keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="Nenhuma chave" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-[#242424]">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-white">
                  <KeyRound className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0">
                  {renaming?.id === k.id ? (
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (renaming.label.trim()) rename.mutate({ id: k.id, label: renaming.label.trim() });
                      }}
                    >
                      <Input autoFocus value={renaming.label} onChange={(e) => setRenaming({ id: k.id, label: e.target.value })} maxLength={60} className="h-8 min-h-8" aria-label="Novo nome da chave" />
                      <Button type="submit" size="sm" icon={Check} aria-label="Salvar nome" loading={rename.isPending} />
                      <Button size="sm" variant="ghost" icon={X} aria-label="Cancelar" onClick={() => setRenaming(null)} />
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{k.label}</span>
                      {k.deviceType === 'singleDevice' && !k.backedUp ? <Badge tone="emerald">Física</Badge> : <Badge tone="amber">Sincronizada</Badge>}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-[#b3b3b3]">
                    Cadastrada em {formatDateTime(k.createdAt)} · último uso {formatRelative(k.lastUsedAt)}
                    {k.transports.length ? ` · ${k.transports.join(', ').toUpperCase()}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRenaming({ id: k.id, label: k.label })}>
                  Renomear
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  onClick={() => {
                    setRemoveError('');
                    setRemoving(k);
                  }}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {keys.length === 1 ? <p className="mt-3 text-[11.5px] text-amber-700 dark:text-amber-300">Só uma chave cadastrada: se ela for perdida, o acesso depende de procedimento manual no servidor. Cadastre uma reserva.</p> : null}

      <ConfirmDangerDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        error={removeError}
        title="Remover chave de segurança"
        confirmLabel="Remover chave"
        description={
          <>
            A chave <strong className="text-slate-900 dark:text-white">{removing?.label}</strong> deixará de abrir o SubWebNavigator. Use isto se a chave foi perdida.
          </>
        }
      />
    </Card>
  );
}

/* ── Sessões / dispositivos ───────────────────────────────────────────────── */

export function SessionsSection() {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading } = useQuery({ queryKey: ['viewer-sessions'], queryFn: async () => (await api.get<ViewerSessionRow[]>('/v1/viewer-sessions')).data });
  const refresh = () => qc.invalidateQueries({ queryKey: ['viewer-sessions'] });

  const revokeOne = useMutation({
    mutationFn: async (id: string) => withStepUp(() => api.post(`/v1/viewer-sessions/${id}/revoke`, {})),
    onSuccess: () => {
      toast.success('Sessão encerrada.');
      void refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível encerrar.')),
  });

  const revokeOthers = useMutation({
    mutationFn: async () => withStepUp(async () => (await api.post<{ revoked: number }>('/v1/viewer-sessions/revoke-others', {})).data),
    onSuccess: (data) => {
      toast.success(data.revoked ? `${data.revoked} dispositivo(s) desconectado(s).` : 'Nenhum outro dispositivo conectado.');
      void refresh();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível revogar.')),
  });

  const others = sessions.filter((s) => !s.current).length;

  return (
    <Card
      title="Sessões e dispositivos"
      subtitle="Onde sua conta está aberta. Tokens nunca são exibidos."
      actions={
        <Button size="sm" variant="danger" icon={LogOut} disabled={others === 0} loading={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
          Revogar outros dispositivos
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-[12px] text-slate-400">Carregando…</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-[#242424]">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-white">
                  <Monitor className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">{s.deviceLabel || 'Navegador desconhecido'}</span>
                    {s.current ? <Badge tone="emerald">Este dispositivo</Badge> : null}
                    {s.stage === 'LOCKED' ? <Badge tone="amber">Bloqueada</Badge> : s.stage === 'MFA_PENDING' ? <Badge tone="slate">Aguardando chave</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-[#b3b3b3]">
                    IP {s.ipMasked ?? '—'} · aberta em {formatDateTime(s.createdAt)} · última atividade {formatRelative(s.lastSeenAt)}
                  </div>
                </div>
              </div>
              {!s.current ? (
                <Button size="sm" variant="secondary" loading={revokeOne.isPending && revokeOne.variables === s.id} onClick={() => revokeOne.mutate(s.id)}>
                  Encerrar sessão
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
