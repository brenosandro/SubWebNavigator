import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ExternalLink, Layers, Pencil, Plus, Search, Square, Star, Trash2 } from 'lucide-react';
import { PageScroll } from '@/components/layout/AppLayout';
import { Modal } from '@/components/shared/Modal';
import ConfirmDangerDialog from '@/components/shared/ConfirmDangerDialog';
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, TONE_DOT, TONE_KEYS, type Tone } from '@/components/shared/ui';
import { useDeleteProfile, useProfileAction, useProfiles, useUpdateProfile } from '@/hooks/useProfiles';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { apiErrorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { GROUP_LABELS, STATUS_META, type Profile, type ProfileGroup } from '@/lib/types';
import { cn } from '@/lib/utils';

function EditProfileModal({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const update = useUpdateProfile();
  const [title, setTitle] = useState('');
  const [startUrl, setStartUrl] = useState('');
  const [group, setGroup] = useState<ProfileGroup>('PESSOAL');
  const [colorToken, setColorToken] = useState<Tone>('slate');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) return;
    setTitle(profile.title);
    setStartUrl(profile.startUrl);
    setGroup(profile.group);
    setColorToken(profile.colorToken);
    setError('');
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError('');
    try {
      const patch: Parameters<typeof update.mutateAsync>[0] = { id: profile.id, title: title.trim(), group, colorToken };
      if (startUrl.trim() !== profile.startUrl) patch.startUrl = startUrl.trim();
      await update.mutateAsync(patch);
      toast.success('Perfil atualizado.');
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar.'));
    }
  };

  return (
    <Modal
      open={!!profile}
      onClose={onClose}
      title="Editar perfil"
      subtitle="Renomear não altera a identidade nem a sessão do site."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-profile-form" loading={update.isPending} disabled={!title.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="edit-profile-form" onSubmit={save} className="space-y-4">
        <Field label="Nome" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Endereço inicial (HTTPS)" hint="Mudar o endereço não apaga os dados do perfil.">
          <Input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} inputMode="url" spellCheck={false} />
        </Field>
        <Field label="Grupo">
          <Select value={group} onChange={(e) => setGroup(e.target.value as ProfileGroup)}>
            {(Object.keys(GROUP_LABELS) as ProfileGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Cor</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do perfil">
            {TONE_KEYS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={colorToken === t} aria-label={t} onClick={() => setColorToken(t)} className={cn('h-7 w-7 rounded-full ring-offset-2 dark:ring-offset-[#121212]', TONE_DOT[t], colorToken === t && 'ring-2 ring-slate-900 dark:ring-white')} />
            ))}
          </div>
        </div>
        <div aria-live="polite">{error ? <p className="text-[12px] font-medium text-rose-600">{error}</p> : null}</div>
      </form>
    </Modal>
  );
}

export default function ProfilesPage() {
  const navigate = useNavigate();
  const { data: profiles = [], isLoading } = useProfiles();
  const { openTab, setNewProfileOpen } = useWorkspaceStore();
  const update = useUpdateProfile();
  const action = useProfileAction();
  const del = useDeleteProfile();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...profiles].sort((a, b) => a.orderIndex - b.orderIndex);
    return q ? list.filter((p) => p.title.toLowerCase().includes(q) || p.host.toLowerCase().includes(q) || GROUP_LABELS[p.group].toLowerCase().includes(q)) : list;
  }, [profiles, query]);

  const stop = async (p: Profile) => {
    try {
      await action.mutateAsync({ id: p.id, action: 'stop' });
      toast.success(`${p.title} parado.`);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Não foi possível parar.'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError('');
    try {
      await del.mutateAsync(deleting.id);
      toast.success('Perfil excluído.');
      setDeleting(null);
    } catch (err) {
      setDeleteError(apiErrorMessage(err, 'Não foi possível excluir.'));
    }
  };

  return (
    <PageScroll>
      <PageHeader
        icon={Layers}
        title="Perfis"
        subtitle="Cada perfil é uma identidade isolada de site. Ações perigosas pedem a chave de segurança."
        actions={
          <Button icon={Plus} onClick={() => setNewProfileOpen(true)}>
            Novo perfil
          </Button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome, site ou grupo" className="pl-9" aria-label="Filtrar perfis" />
        </div>
        <span className="text-[12px] text-slate-400">{rows.length} perfil(is)</span>
      </div>

      {!isLoading && profiles.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhum perfil ainda" description="Crie um perfil para cada conta: WhatsApp Pessoal, WhatsApp Empresa, Telegram…" action={<Button icon={Plus} onClick={() => setNewProfileOpen(true)}>Novo perfil</Button>} />
      ) : (
        <div className="card-premium overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:border-[#242424]">
                <th className="px-4 py-2.5">Perfil</th>
                <th className="px-3 py-2.5">Site</th>
                <th className="px-3 py-2.5">Grupo</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Último uso</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = STATUS_META[p.status];
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 dark:border-[#242424] dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white', TONE_DOT[p.colorToken] ?? TONE_DOT.slate)}>{p.title.slice(0, 1).toUpperCase()}</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{p.title}</span>
                        {p.pinned ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Favorito" /> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px] text-slate-500 dark:text-[#b3b3b3]">{p.host}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-[#b3b3b3]">{GROUP_LABELS[p.group]}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-[#b3b3b3]">{formatRelative(p.lastUsedAt)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={ExternalLink}
                          onClick={() => {
                            openTab(p.id);
                            navigate('/app');
                          }}
                        >
                          Abrir
                        </Button>
                        <Button size="sm" variant="ghost" icon={Star} aria-label={p.pinned ? `Desafixar ${p.title}` : `Fixar ${p.title}`} title={p.pinned ? 'Desafixar' : 'Fixar em Favoritos'} onClick={() => update.mutate({ id: p.id, pinned: !p.pinned })} />
                        <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Editar ${p.title}`} title="Editar" onClick={() => setEditing(p)} />
                        <Button size="sm" variant="ghost" icon={Square} aria-label={`Parar ${p.title}`} title="Parar" onClick={() => stop(p)} disabled={p.status === 'STOPPED'} />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          aria-label={`Excluir ${p.title}`}
                          title="Excluir"
                          className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          onClick={() => {
                            setDeleteError('');
                            setDeleting(p);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditProfileModal profile={editing} onClose={() => setEditing(null)} />
      <ConfirmDangerDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={del.isPending}
        error={deleteError}
        title="Excluir perfil"
        confirmLabel="Excluir perfil"
        description={
          <>
            O perfil <strong className="text-slate-900 dark:text-white">{deleting?.title}</strong> e os dados de sessão guardados no servidor serão destruídos. Você precisará fazer login de novo no site se recriar o perfil. Backups seguem a política de retenção.
          </>
        }
      />
    </PageScroll>
  );
}
