import { useEffect, useState } from 'react';
import { Camera, Globe, Info, MessageCircle, Send, type LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/shared/Modal';
import { Button, Field, Input, Select, TONE_DOT, TONE_KEYS, type Tone } from '@/components/shared/ui';
import { useCreateProfile } from '@/hooks/useProfiles';
import { apiErrorMessage } from '@/lib/api';
import { GROUP_LABELS, PROVIDER_LABELS, type ProfileGroup, type Provider } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspaceStore';

const PROVIDERS: Array<{ id: Provider; icon: LucideIcon; url: string; group: ProfileGroup; tone: Tone; hint: string }> = [
  { id: 'whatsapp', icon: MessageCircle, url: 'https://web.whatsapp.com', group: 'MENSAGENS', tone: 'emerald', hint: 'Login por QR na página oficial' },
  { id: 'telegram', icon: Send, url: 'https://web.telegram.org', group: 'MENSAGENS', tone: 'sky', hint: 'Login normal do Telegram Web' },
  { id: 'instagram', icon: Camera, url: 'https://www.instagram.com', group: 'SOCIAL', tone: 'rose', hint: 'Desafios e 2FA feitos por você' },
  { id: 'custom', icon: Globe, url: 'https://', group: 'PESSOAL', tone: 'slate', hint: 'Qualquer endereço HTTPS público' },
];

const GROUPS = Object.keys(GROUP_LABELS) as ProfileGroup[];
const TONE_NAMES: Record<Tone, string> = { slate: 'Grafite', blue: 'Azul', emerald: 'Verde', amber: 'Âmbar', rose: 'Rosa', violet: 'Violeta', sky: 'Céu', teal: 'Petróleo', orange: 'Laranja' };

/** Modal Novo Perfil (S04): tipo → dados → criar. Menos de 4 passos. */
export default function NewProfileModal() {
  const { newProfileOpen, setNewProfileOpen, openTab } = useWorkspaceStore();
  const create = useCreateProfile();
  const [provider, setProvider] = useState<Provider>('whatsapp');
  const [title, setTitle] = useState('');
  const [startUrl, setStartUrl] = useState(PROVIDERS[0].url);
  const [group, setGroup] = useState<ProfileGroup>('MENSAGENS');
  const [colorToken, setColorToken] = useState<Tone>('emerald');
  const [error, setError] = useState('');

  useEffect(() => {
    if (newProfileOpen) {
      setProvider('whatsapp');
      setTitle('');
      setStartUrl(PROVIDERS[0].url);
      setGroup('MENSAGENS');
      setColorToken('emerald');
      setError('');
    }
  }, [newProfileOpen]);

  const pick = (id: Provider) => {
    const p = PROVIDERS.find((x) => x.id === id)!;
    setProvider(id);
    setStartUrl(p.url);
    setGroup(p.group);
    setColorToken(p.tone);
    setError('');
  };

  const urlLooksHttps = /^https:\/\/[^\s/]+\.[^\s]+/i.test(startUrl.trim());
  const canSubmit = title.trim().length > 0 && title.trim().length <= 80 && urlLooksHttps;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    try {
      const profile = await create.mutateAsync({ title: title.trim(), provider, startUrl: startUrl.trim(), group, colorToken });
      toast.success('Perfil criado.');
      setNewProfileOpen(false);
      openTab(profile.id);
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível criar o perfil.'));
    }
  };

  return (
    <Modal
      open={newProfileOpen}
      onClose={() => setNewProfileOpen(false)}
      title="Novo perfil"
      subtitle="Uma identidade isolada para uma conta de site."
      maxWidth="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => setNewProfileOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-profile-form" loading={create.isPending} disabled={!canSubmit}>
            Criar perfil
          </Button>
        </>
      }
    >
      <form id="new-profile-form" onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">1 · Tipo de site</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PROVIDERS.map(({ id, icon: Icon, hint }) => (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                aria-pressed={provider === id}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                  provider === id ? 'border-slate-900 bg-slate-50 dark:border-white dark:bg-white/5' : 'border-slate-200 hover:border-slate-300 dark:border-[#282828] dark:hover:border-[#3a3a3a]',
                )}
              >
                <Icon className="h-4 w-4 text-slate-700 dark:text-white" strokeWidth={1.75} />
                <span className="text-[12px] font-semibold text-slate-900 dark:text-white">{PROVIDER_LABELS[id]}</span>
                <span className="text-[10.5px] leading-4 text-slate-500 dark:text-[#b3b3b3]">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">2 · Identificação</legend>
          <Field label="Nome do perfil" required hint="Ex.: WhatsApp Pessoal">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="WhatsApp Pessoal" autoFocus />
          </Field>
          <Field label="Grupo">
            <Select value={group} onChange={(e) => setGroup(e.target.value as ProfileGroup)}>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Endereço inicial (HTTPS)" required hint="Somente HTTPS público. Endereços internos e IPs privados são recusados no servidor." className="sm:col-span-2">
            <Input value={startUrl} onChange={(e) => setStartUrl(e.target.value)} inputMode="url" spellCheck={false} autoComplete="off" placeholder="https://exemplo.com" />
          </Field>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">3 · Cor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do perfil">
            {TONE_KEYS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={colorToken === t}
                aria-label={TONE_NAMES[t]}
                title={TONE_NAMES[t]}
                onClick={() => setColorToken(t)}
                className={cn('h-7 w-7 rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:ring-offset-[#121212]', TONE_DOT[t], colorToken === t && 'ring-2 ring-slate-900 dark:ring-white')}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] leading-5 text-slate-600 dark:border-[#282828] dark:bg-white/[0.03] dark:text-[#b3b3b3]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Cada perfil é uma identidade isolada: cookies e sessão não são compartilhados. O login acontece na página oficial do serviço, dentro do navegador remoto — o SubWebNavigator nunca pede sua senha ou telefone.</span>
        </div>

        <div aria-live="polite">{error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}</div>
      </form>
    </Modal>
  );
}
