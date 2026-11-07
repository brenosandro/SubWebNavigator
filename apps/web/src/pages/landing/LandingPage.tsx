import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Chrome, Eye, EyeOff, Info, KeyRound, Layers, Lock, Moon, ScrollText, ServerCog, ShieldCheck, Sun, Timer, UserCheck } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useSessionStore } from '@/store/sessionStore';
import { DatatomsLogo } from '@/assets/logo/logo';

const ROTATING = ['WhatsApp Web, pessoal e empresa', 'Telegram e Instagram', 'Seus sites, cada um isolado', 'De qualquer navegador, sem instalar nada'];

const FEATURES = [
  { icon: Layers, title: 'Perfis isolados', text: 'Cada conta é uma identidade separada no servidor. Dois WhatsApp lado a lado, sem cookies cruzados.' },
  { icon: ServerCog, title: 'Sessões persistentes no servidor', text: 'Feche o navegador e volte depois: o login do site continua lá enquanto o próprio serviço permitir.' },
  { icon: KeyRound, title: 'Google + chave física', text: 'Entrada com Google restrita ao titular e confirmação obrigatória por chave de segurança WebAuthn.' },
  { icon: Timer, title: 'Bloqueio automático', text: 'Inatividade e tempo máximo de controle contados no servidor. Ao bloquear, a imagem some e o controle é cortado.' },
  { icon: EyeOff, title: 'Nada fica no computador visitante', text: 'O visitante recebe só a imagem da página. Cookies, logins e armazenamento dos sites ficam no servidor.' },
  { icon: ScrollText, title: 'Auditoria sem conteúdo', text: 'Acessos, bloqueios, chaves e perfis registrados — sem mensagens, sem páginas visitadas.' },
];

const LAYERS = [
  { n: '1', icon: Chrome, title: 'Conta Google', text: 'Identifica o titular. Só a conta autorizada no servidor passa; não existe cadastro público.' },
  { n: '2', icon: KeyRound, title: 'Chave de segurança', text: 'Toque na chave física (WebAuthn). SMS, e-mail ou aplicativo autenticador não substituem a chave.' },
  { n: '3', icon: Lock, title: 'Sessão com bloqueio', text: 'Sessão curta no servidor, com bloqueio por inatividade, tempo máximo e revogação de outros dispositivos.' },
];

function ThemeButton() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button onClick={toggleTheme} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-slate-600 shadow-sm backdrop-blur transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-[#b3b3b3] dark:hover:text-white" aria-label="Alternar tema claro/escuro">
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Janela ilustrativa do workspace, feita em HTML (sem imagem de site real). */
function WorkspaceMock() {
  const groups: Array<{ title: string; items: Array<[string, string, boolean?]> }> = [
    { title: 'Mensagens', items: [['WhatsApp · Pessoal', 'bg-emerald-500', true], ['WhatsApp · Empresa', 'bg-teal-500'], ['Telegram', 'bg-sky-500']] },
    { title: 'Social', items: [['Instagram', 'bg-rose-500']] },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/85 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0b0b]/90" aria-hidden>
      <div className="flex h-10 items-center gap-2 border-b border-slate-200/70 px-3 dark:border-white/10">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-2 text-[11px] font-semibold text-slate-700 dark:text-white">SubWebNavigator</span>
        <span className="ml-auto hidden rounded-md border border-slate-200 px-2 py-0.5 text-[10px] text-slate-400 dark:border-white/10 sm:inline">Buscar ⌘K</span>
        <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <ShieldCheck className="h-3 w-3" /> Protegido
        </span>
      </div>
      <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[170px_1fr]">
        <div className="border-r border-slate-200/70 p-2.5 dark:border-white/10">
          {groups.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="mb-1 px-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">{g.title}</div>
              {g.items.map(([name, dot, active]) => (
                <div key={name} className={`mb-0.5 flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[10.5px] ${active ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-600 dark:text-[#b3b3b3]'}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="px-1.5 text-[10.5px] font-medium text-slate-400">+ Novo site</div>
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex h-8 items-end gap-1 border-b border-slate-200/70 px-2 dark:border-white/10">
            {['WhatsApp · Pessoal', 'Telegram', 'Instagram'].map((t, i) => (
              <div key={t} className={`flex h-6 items-center gap-1.5 truncate rounded-t-md px-2 text-[10px] ${i === 0 ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-slate-500 dark:text-[#b3b3b3]'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/30'}`} />
                {t}
              </div>
            ))}
          </div>
          <div className="flex h-7 items-center gap-2 border-b border-slate-200/70 px-3 text-[10px] text-slate-400 dark:border-white/10">
            <span>◀</span>
            <span>▶</span>
            <span>⟳</span>
            <span className="mx-auto truncate">site oficial · perfil isolado</span>
          </div>
          <div className="relative h-[180px] bg-[linear-gradient(135deg,#f8fafc_0%,#eef2f7_100%)] dark:bg-[linear-gradient(135deg,#141414_0%,#1b1b1b_100%)] sm:h-[230px]">
            <div className="absolute inset-4 grid grid-cols-[1fr_2fr] gap-3 opacity-80">
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-7 rounded-md bg-white/80 dark:bg-white/[0.05]" />
                ))}
              </div>
              <div className="flex flex-col justify-end gap-2">
                <div className="ml-auto h-6 w-2/3 rounded-lg bg-emerald-100 dark:bg-emerald-500/15" />
                <div className="h-6 w-1/2 rounded-lg bg-white/90 dark:bg-white/[0.06]" />
                <div className="ml-auto h-6 w-1/2 rounded-lg bg-emerald-100 dark:bg-emerald-500/15" />
                <div className="h-7 rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]" />
              </div>
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-2.5 py-1 text-[9px] font-medium text-white dark:bg-white/80 dark:text-slate-900">pixels remotos · não é iframe</div>
          </div>
          <div className="flex h-7 items-center justify-between border-t border-slate-200/70 px-3 text-[10px] text-slate-500 dark:border-white/10 dark:text-[#b3b3b3]">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Transmissão segura
            </span>
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" /> Bloquear
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const reduce = useReducedMotion();
  const session = useSessionStore((s) => s.session);
  const [phrase, setPhrase] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setPhrase((p) => (p + 1) % ROTATING.length), 2600);
    return () => clearInterval(t);
  }, [reduce]);

  const entryHref = session?.stage === 'ACTIVE' ? '/app' : session?.stage === 'LOCKED' ? '/bloqueado' : session?.stage === 'MFA_PENDING' ? '/entrar/chave' : '/login';
  const entryLabel = session?.stage === 'ACTIVE' ? 'Abrir workspace' : 'Entrar';

  return (
    <div className="swn-landing relative min-h-[100dvh] overflow-x-hidden bg-[#f5f2ee] text-slate-900 dark:bg-[#121212] dark:text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-[-10%] top-[-8%] h-[420px] w-[420px] rounded-full bg-white/60 blur-3xl dark:bg-white/[0.03]" />
        <div className="absolute right-[-10%] top-[30%] h-[380px] w-[380px] rounded-full bg-stone-300/30 blur-3xl dark:bg-sky-500/[0.05]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f5f2ee]/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#121212]/80">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6" aria-label="Principal">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
              <DatatomsLogo size={24} />
            </span>
            <span className="text-[14px] font-semibold tracking-tight">SubWebNavigator</span>
          </Link>
          <div className="ml-auto hidden items-center gap-1 sm:flex">
            <a href="#recursos" className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-[#b3b3b3] dark:hover:text-white">
              Recursos
            </a>
            <a href="#seguranca" className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-900 dark:text-[#b3b3b3] dark:hover:text-white">
              Segurança
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:ml-2">
            <ThemeButton />
            <Link to={entryHref} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
              {entryLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
          <div>
            <span className="inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-[#b3b3b3]">Navegador pessoal remoto · self-hosted</span>
            <h1 className="mt-5 text-[2.2rem] font-semibold leading-[1.1] tracking-tight sm:text-[2.9rem]">
              Seu espaço digital.
              <br />
              Sempre com você.
            </h1>
            <div className="mt-4 h-8 text-[1.05rem] font-semibold text-slate-500 dark:text-[#b3b3b3]" aria-live="off">
              <AnimatePresence mode="wait">
                <motion.span key={phrase} className="inline-block" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -8 }} transition={{ duration: 0.35 }}>
                  {ROTATING[phrase]}.
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="mt-3 max-w-xl text-[14px] leading-7 text-slate-600 dark:text-[#b3b3b3]">
              Uma central privada de navegação remota: WhatsApp Web, Telegram, Instagram e sites próprios numa só janela, cada conta em um perfil isolado que roda no servidor. Você acessa de qualquer navegador — o computador visitante só recebe a imagem da página.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to={entryHref} className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-900 px-5 text-[13px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                <KeyRound className="h-4 w-4" />
                {session?.stage === 'ACTIVE' ? 'Abrir workspace' : 'Entrar com Google + chave'}
              </Link>
              <a href="#seguranca" className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]">
                Como protegemos
              </a>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-[#b3b3b3]">
              <UserCheck className="h-3.5 w-3.5" /> Uso pessoal do titular · sem cadastro público
            </p>
          </div>
          <WorkspaceMock />
        </section>

        <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-[#b3b3b3]">Recursos</div>
            <h2 className="mt-2 text-[1.7rem] font-semibold tracking-tight">Todas as suas contas, nenhuma mistura.</h2>
            <p className="mt-2 text-[14px] leading-6 text-slate-600 dark:text-[#b3b3b3]">Separação clara entre perfil (uma identidade) e aba (uma página dessa identidade). Duplicar uma aba nunca cria outra conta.</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-xl border border-black/5 bg-white/80 p-5 shadow-premium-soft backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-slate-600 dark:text-[#b3b3b3]">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="seguranca" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white/80 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-black/60 sm:p-8">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-[#b3b3b3]">Segurança</div>
              <h2 className="mt-2 text-[1.7rem] font-semibold tracking-tight">Três camadas antes de qualquer pixel.</h2>
              <p className="mt-2 text-[14px] leading-6 text-slate-600 dark:text-[#b3b3b3]">Nenhuma rota de controle, transmissão ou API escapa da autenticação. E bloquear corta no servidor — não é só uma tela por cima.</p>
            </div>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {LAYERS.map(({ n, icon: Icon, title, text }) => (
                <li key={n} className="relative rounded-xl border border-slate-200 bg-[#fbfaf8] p-5 dark:border-white/10 dark:bg-[#181818]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[12px] font-semibold text-white dark:bg-white dark:text-slate-900">{n}</span>
                    <Icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-slate-600 dark:text-[#b3b3b3]">{text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[12.5px] leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Sessões de terceiros podem expirar e pedir novo login. O serviço remoto (WhatsApp, Instagram…) decide quando; o SubWebNavigator nunca contorna QR, CAPTCHA ou verificação.</span>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-[12.5px] leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-[#b3b3b3]">
                <Eye className="mt-0.5 h-4 w-4 shrink-0" />
                <span>O computador que você usa ainda vê a tela: em máquinas compartilhadas ou corporativas, captura de tela e teclado são riscos fora do nosso alcance. Bloqueie ao sair.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] p-6 text-white dark:bg-[linear-gradient(135deg,#ffffff_0%,#e2e8f0_100%)] dark:text-slate-900 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 className="text-[1.35rem] font-semibold tracking-tight">Pronto para abrir seu espaço?</h2>
              <p className="mt-1 text-[13px] text-white/70 dark:text-slate-600">Tenha a conta Google autorizada e a chave de segurança em mãos.</p>
            </div>
            <Link to={entryHref} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-100 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800">
              {entryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-black/5 dark:border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[12px] text-slate-500 dark:text-[#b3b3b3] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} SubWebNavigator · Desenvolvido por Datatoms</span>
          <span className="flex items-center gap-3">
            <a href="/termos" className="font-medium hover:text-slate-900 hover:underline dark:hover:text-white">
              Termos de Uso
            </a>
            <a href="/privacidade" className="font-medium hover:text-slate-900 hover:underline dark:hover:text-white">
              Política de Privacidade
            </a>
          </span>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-6 text-[11px] text-slate-400 sm:px-6">Não afiliado a WhatsApp, Meta, Telegram ou Instagram. Os nomes citados pertencem aos respectivos titulares e indicam apenas sites que podem ser abertos.</p>
      </footer>
    </div>
  );
}
