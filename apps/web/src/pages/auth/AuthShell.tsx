import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun, CheckCircle2, Layers, KeyRound, Lock, ServerCog, ScrollText } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useThemeStore } from '@/store/themeStore';
import { DatatomsLogo } from '@/assets/logo/logo';

type FeatureSlide = { eyebrow: string; title: string; description: string; bullets: string[]; icon: React.ReactNode };

const FEATURE_SLIDES: FeatureSlide[] = [
  {
    eyebrow: 'Perfis isolados',
    title: 'Cada conta na sua própria identidade.',
    description: 'Dois WhatsApp, Telegram, Instagram e sites próprios lado a lado — cookies, armazenamento e sessão nunca se misturam entre perfis.',
    bullets: ['Um perfil por identidade', 'Grupos: Mensagens, Social, Pessoal', 'Abas da mesma conta sem duplicar login'],
    icon: <Layers className="h-4 w-4" />,
  },
  {
    eyebrow: 'Acesso forte',
    title: 'Google para entrar. Chave física para abrir.',
    description: 'O login Google identifica você; a chave de segurança WebAuthn confirma que é você mesmo. Código por SMS ou aplicativo não substitui a chave.',
    bullets: ['Google OIDC restrito ao titular', 'Chave física obrigatória', 'Passkey sincronizada não é aceita'],
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    eyebrow: 'Bloqueio automático',
    title: 'Saiu de perto, a sessão fecha.',
    description: 'Inatividade e tempo máximo de controle são contados no servidor. Ao bloquear, a tela é limpa e só a chave libera de novo.',
    bullets: ['Inatividade de 1 a 30 minutos', 'Tempo máximo de 15 a 60 minutos', 'Bloquear tudo com um clique'],
    icon: <Lock className="h-4 w-4" />,
  },
  {
    eyebrow: 'Nada no visitante',
    title: 'O site roda no servidor, não no seu computador.',
    description: 'O computador que você usa recebe só a imagem da página e envia cliques e teclas. Cookies e logins de terceiros ficam no servidor.',
    bullets: ['Sem cookies de terceiros no navegador', 'Perfis criptografados em repouso', 'Sem iframe de site externo'],
    icon: <ServerCog className="h-4 w-4" />,
  },
  {
    eyebrow: 'Auditoria',
    title: 'Quem entrou, quando e de onde — sem conteúdo.',
    description: 'Logins, bloqueios, chaves e perfis ficam registrados. Mensagens e páginas visitadas nunca entram na trilha.',
    bullets: ['Trilha de acessos', 'Revogar outros dispositivos', 'IP mascarado'],
    icon: <ScrollText className="h-4 w-4" />,
  },
];

const ROTATING_PHRASES = ['Seu espaço digital, sempre com você', 'Várias contas, nenhum cookie cruzado', 'Google + chave física', 'Bloqueio que corta de verdade', 'Nada salvo no computador visitante'];

/** Moldura das telas de autenticação: coluna do formulário + apresentação. */
export default function AuthShell({ children, title, description, footer }: { children: React.ReactNode; title: string; description: React.ReactNode; footer?: React.ReactNode }) {
  const { theme, toggleTheme } = useThemeStore();
  const reduceMotion = useReducedMotion();
  const [activeSlide, setActiveSlide] = useState(0);
  const [activePhrase, setActivePhrase] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setActiveSlide((p) => (p + 1) % FEATURE_SLIDES.length), 4200);
    return () => clearInterval(t);
  }, [reduceMotion]);
  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setActivePhrase((p) => (p + 1) % ROTATING_PHRASES.length), 2600);
    return () => clearInterval(t);
  }, [reduceMotion]);
  const currentSlide = useMemo(() => FEATURE_SLIDES[activeSlide], [activeSlide]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f2ee] dark:bg-[#121212]">
      <div className="absolute inset-0" aria-hidden>
        <div className="absolute left-[-8%] top-[-10%] h-[280px] w-[280px] rounded-full bg-white/45 blur-3xl dark:bg-white/[0.03]" />
        <div className="absolute bottom-[-8%] right-[-8%] h-[260px] w-[260px] rounded-full bg-stone-300/25 blur-3xl dark:bg-sky-500/[0.05]" />
      </div>

      <div className="absolute right-4 top-4 z-50 sm:right-6 sm:top-6">
        <button onClick={toggleTheme} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-black/10 bg-white/80 text-slate-600 shadow-sm backdrop-blur transition hover:scale-[1.02] hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-[#b3b3b3] dark:hover:text-white" title="Alternar tema" aria-label="Alternar tema claro/escuro">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        <div className="grid w-full max-w-[1500px] overflow-hidden rounded-2xl border border-black/5 bg-white/80 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[#000000]/90 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="relative flex max-h-[100dvh] items-start overflow-y-auto border-b border-black/5 p-4 sm:p-6 lg:items-center lg:border-b-0 lg:border-r lg:border-black/5 dark:border-white/10 scrollbar-hover">
            <div className="mx-auto w-full max-w-sm">
              <Link to="/" className="mb-5 flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
                  <DatatomsLogo size={30} />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">SubWebNavigator</div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-[#b3b3b3]">Navegação remota privada</div>
                </div>
              </Link>

              <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 lg:hidden dark:border-white/10 dark:bg-white/[0.03]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-[#b3b3b3]">Plataforma</div>
                <div className="mt-2 h-[44px]">
                  <AnimatePresence mode="wait">
                    <motion.div key={activePhrase} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }} transition={{ duration: 0.35 }} className="text-[15px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
                      {ROTATING_PHRASES[activePhrase]}.
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="mb-5">
                <h1 className="text-[1.55rem] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
                <div className="mt-1.5 text-[13px] leading-5 text-slate-500 dark:text-[#b3b3b3]">{description}</div>
              </div>

              {children}

              <div className="mt-6 border-t border-slate-200 pt-4 text-[11px] text-slate-500 dark:border-white/10 dark:text-[#b3b3b3]">
                {footer}
                <span className="mt-1 block">
                  {/* Âncora comum: as páginas legais são HTML estático, fora do roteador do SPA. */}
                  <a href="/termos" className="font-medium text-slate-500 hover:underline dark:text-slate-400">
                    Termos de Uso
                  </a>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                  <a href="/privacidade" className="font-medium text-slate-500 hover:underline dark:text-slate-400">
                    Política de Privacidade
                  </a>
                </span>
                <div className="mt-2">© {new Date().getFullYear()} SubWebNavigator · Desenvolvido por Datatoms</div>
              </div>
            </div>
          </div>

          <div className="relative hidden min-h-[620px] overflow-hidden bg-[#ece7e1] p-4 dark:bg-[#121212] lg:block xl:p-5">
            <div className="flex h-full flex-col rounded-xl border border-white/50 bg-white/55 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03] xl:p-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <span className="inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-[#b3b3b3]">Self-hosted · titular único</span>
                  <div className="mt-4 max-w-2xl">
                    <p className="text-[12px] font-medium text-slate-500 dark:text-[#b3b3b3]">Central privada de navegação remota</p>
                    <div className="mt-2 h-[72px] xl:h-[80px]">
                      <AnimatePresence mode="wait">
                        <motion.h2 key={activePhrase} initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -12 }} transition={{ duration: 0.4 }} className="swn-landing text-[1.85rem] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white xl:text-[2.1rem]">
                          {ROTATING_PHRASES[activePhrase]}.
                        </motion.h2>
                      </AnimatePresence>
                    </div>
                    <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-600 dark:text-[#b3b3b3] xl:text-[14px]">
                      O <span className="font-semibold">SubWebNavigator</span> reúne WhatsApp Web, Telegram, Instagram e sites próprios numa só janela, cada conta em um perfil isolado que roda no servidor — acessível de qualquer navegador, sem instalar nada.
                    </p>
                  </div>
                </div>
                <div className="mt-1 flex gap-1.5">
                  {FEATURE_SLIDES.map((_, index) => (
                    <button key={index} type="button" onClick={() => setActiveSlide(index)} className={`h-2 rounded-full transition-all ${activeSlide === index ? 'w-8 bg-slate-900 dark:bg-white' : 'w-2 bg-slate-300 dark:bg-white/20'}`} aria-label={`Destaque ${index + 1}`} />
                  ))}
                </div>
              </div>

              <div className="mt-5 grid flex-1 grid-cols-12 gap-4">
                <div className="col-span-7 rounded-xl border border-slate-200 bg-[#fbfaf8] p-5 dark:border-white/10 dark:bg-[#181818] xl:p-6">
                  <AnimatePresence mode="wait">
                    <motion.div key={activeSlide} initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -10 }} transition={{ duration: 0.3 }} className="flex h-full flex-col">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white">{currentSlide.icon}</div>
                      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-[#b3b3b3]">{currentSlide.eyebrow}</div>
                      <h3 className="mt-2 min-h-[72px] text-[1.45rem] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white xl:text-[1.6rem]">{currentSlide.title}</h3>
                      <p className="mt-3 min-h-[72px] max-w-xl text-[13px] leading-6 text-slate-600 dark:text-[#b3b3b3]">{currentSlide.description}</p>
                      <div className="mt-5 space-y-2.5">
                        {currentSlide.bullets.map((bullet) => (
                          <div key={bullet} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                              <CheckCircle2 className="h-3 w-3" />
                            </span>
                            <span className="text-[12px] font-medium text-slate-700 dark:text-white xl:text-[13px]">{bullet}</span>
                          </div>
                        ))}
                      </div>
                      {!reduceMotion ? (
                        <div className="mt-auto pt-5">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                            <motion.div key={activeSlide} initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 4.1, ease: 'linear' }} className="h-full rounded-full bg-slate-900 dark:bg-white" />
                          </div>
                        </div>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="col-span-5 flex items-end">
                  <div className="ml-auto w-full max-w-[310px] rounded-xl border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#181818]">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-slate-900 dark:bg-white" />
                        <div>
                          <div className="text-[11px] font-semibold text-slate-900 dark:text-white">Meus perfis</div>
                          <div className="text-[10px] text-slate-500 dark:text-[#b3b3b3]">Identidades isoladas</div>
                        </div>
                      </div>
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <div className="space-y-2">
                      {[
                        ['WhatsApp · Pessoal', 'bg-emerald-500'],
                        ['WhatsApp · Empresa', 'bg-teal-500'],
                        ['Telegram', 'bg-sky-500'],
                        ['Instagram', 'bg-rose-500'],
                      ].map(([name, dot]) => (
                        <div key={name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.03]">
                          <span className="flex items-center gap-2 text-[11px] font-medium text-slate-700 dark:text-white">
                            <span className={`h-2 w-2 rounded-full ${dot}`} />
                            {name}
                          </span>
                          <span className="text-[10px] text-slate-400">isolado</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] p-4 text-white dark:bg-[linear-gradient(135deg,#ffffff_0%,#e2e8f0_100%)] dark:text-slate-900">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-white/70 dark:text-[#535353]">Camadas de acesso</div>
                      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold">
                        <span>Google</span>
                        <span>Chave</span>
                        <span>Sessão</span>
                        <span>Perfil</span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <div className="h-2 flex-1 rounded-full bg-white dark:bg-slate-300" />
                        <div className="h-2 flex-1 rounded-full bg-white/60 dark:bg-slate-400" />
                        <div className="h-2 flex-1 rounded-full bg-white/40 dark:bg-[#535353]" />
                        <div className="h-2 flex-1 rounded-full bg-white/20 dark:bg-[#3E3E3E]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-[10px] text-slate-500 dark:border-white/10 dark:text-[#b3b3b3] xl:text-[11px]">
                <span>Perfis isolados · Google + chave física · Bloqueio automático · Auditoria</span>
                <span>Powered by Datatoms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GoogleButton({ onClick, disabled, label = 'Continuar com Google' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {label}
    </button>
  );
}

/** Indicador dos dois fatores: 1 Google · 2 Chave de segurança. */
export function AuthSteps({ current }: { current: 1 | 2 }) {
  const steps = [
    { n: 1, label: 'Google' },
    { n: 2, label: 'Chave de segurança' },
  ];
  return (
    <ol className="mb-4 flex items-center gap-2 text-[11px] font-semibold" aria-label="Etapas de acesso">
      {steps.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <li key={s.n} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-[#b3b3b3]'
              }`}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : s.n}
            </span>
            <span className={active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-[#b3b3b3]'}>{s.label}</span>
            {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-slate-300 dark:bg-white/15" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export const authInputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-[13px] text-slate-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-slate-500 dark:focus:border-brand-500 dark:focus:ring-brand-500/10';
export const authLabelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-[#b3b3b3]';
export const authPrimaryButtonClass =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-[13px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100';
export const authSecondaryButtonClass =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.05]';

export function AuthError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
      {message}
    </div>
  );
}
