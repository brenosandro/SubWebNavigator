import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Hash, KeyRound, Loader2, Tag, Usb } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import api, { apiErrorMessage } from '@/lib/api';
import { authenticateWithKey, registerSecurityKey } from '@/lib/webauthn';
import { safeReturnTo } from '@/lib/navigation';
import { useSessionStore } from '@/store/sessionStore';
import AuthShell, { AuthError, AuthSteps, authInputClass, authLabelClass, authPrimaryButtonClass, authSecondaryButtonClass } from './AuthShell';

/** Anel pulsante em volta do ícone da chave enquanto o navegador espera o toque. */
export function KeyPulse({ waiting }: { waiting: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto mb-1 flex h-20 w-20 items-center justify-center" aria-hidden>
      {waiting && !reduce ? (
        <>
          <motion.span className="absolute inset-0 rounded-full border-2 border-slate-900/30 dark:border-white/30" initial={{ scale: 0.8, opacity: 0.8 }} animate={{ scale: 1.35, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }} />
          <motion.span className="absolute inset-0 rounded-full border-2 border-slate-900/20 dark:border-white/20" initial={{ scale: 0.8, opacity: 0.8 }} animate={{ scale: 1.35, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.7 }} />
        </>
      ) : null}
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        <KeyRound className="h-7 w-7 text-slate-800 dark:text-white" strokeWidth={1.5} />
      </div>
    </div>
  );
}

export default function SecurityKeyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const session = useSessionStore((s) => s.session);
  const clear = useSessionStore((s) => s.clear);
  const [waiting, setWaiting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [label, setLabel] = useState('Chave principal');

  if (!session) return <Navigate to="/login" replace />;
  if (session.stage === 'ACTIVE') return <Navigate to={returnTo} replace />;
  if (session.stage === 'LOCKED') return <Navigate to="/bloqueado" replace />;

  const enrolling = session.enrollment.required;

  const useKey = async () => {
    setErrorMsg('');
    setWaiting(true);
    try {
      const next = await authenticateWithKey('login');
      if (next.stage === 'ACTIVE') navigate(returnTo, { replace: true });
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Não foi possível validar a chave.'));
    } finally {
      setWaiting(false);
    }
  };

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setWaiting(true);
    try {
      const next = await registerSecurityKey({ enrollmentCode: session.enrollment.codeRequired ? enrollmentCode.trim() : undefined, label: label.trim() || 'Chave principal' });
      if (next.stage === 'ACTIVE') navigate(returnTo, { replace: true });
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Não foi possível cadastrar a chave.'));
    } finally {
      setWaiting(false);
    }
  };

  const switchAccount = async () => {
    try {
      await api.post('/auth/logout', {}, { skipAuthRedirect: true });
    } catch {
      /* sessão já pode ter expirado */
    }
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <AuthShell
      title={enrolling ? 'Cadastre sua chave de segurança' : 'Confirme com sua chave'}
      description={
        enrolling ? (
          <>
            Olá, <span className="font-semibold text-slate-700 dark:text-white">{session.owner.name}</span>. Para concluir o primeiro acesso, cadastre uma chave física (YubiKey, Google Titan ou similar). Passkeys sincronizadas na nuvem não são aceitas.
          </>
        ) : (
          <>
            Conta Google confirmada: <span className="font-semibold text-slate-700 dark:text-white">{session.owner.email}</span>. Agora conecte ou aproxime sua chave de segurança e toque nela.
          </>
        )
      }
    >
      <div className="space-y-4">
        <AuthSteps current={2} />
        <KeyPulse waiting={waiting} />
        <p className="text-center text-[12px] text-slate-500 dark:text-[#b3b3b3]" aria-live="polite">
          {waiting ? 'Aguardando o toque na chave…' : enrolling ? 'O navegador vai pedir para você tocar na chave.' : 'Pronto para validar.'}
        </p>
        <AuthError message={errorMsg} />

        {enrolling ? (
          <form onSubmit={enroll} className="space-y-4">
            {session.enrollment.codeRequired ? (
              <div>
                <label htmlFor="enroll-code" className={authLabelClass}>
                  Código de cadastro
                </label>
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="enroll-code" required autoComplete="one-time-code" value={enrollmentCode} onChange={(e) => setEnrollmentCode(e.target.value)} placeholder="Código gerado no servidor" className={`${authInputClass} font-mono tracking-wider`} />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-[#b3b3b3]">
                  Gerado no servidor, dentro do container da API, com <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-white/10">node dist/cli/enrollment-code.js</code> (em desenvolvimento: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-white/10">npm run owner:enrollment-code</code>). Vale por 15 minutos e uma única vez.
                </p>
              </div>
            ) : null}
            <div>
              <label htmlFor="key-label" className={authLabelClass}>
                Nome da chave
              </label>
              <div className="relative">
                <Tag className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="key-label" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} className={authInputClass} />
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <Usb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Recomendado: cadastre também uma chave reserva depois, em Configurações, e guarde-a em local seguro.</span>
            </div>
            <button type="submit" disabled={waiting || (session.enrollment.codeRequired && !enrollmentCode.trim())} className={authPrimaryButtonClass}>
              {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Cadastrar chave de segurança
            </button>
          </form>
        ) : (
          <button type="button" onClick={useKey} disabled={waiting} className={authPrimaryButtonClass} autoFocus>
            {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Usar chave de segurança
          </button>
        )}

        <button type="button" onClick={switchAccount} className={authSecondaryButtonClass}>
          <ArrowLeft className="h-4 w-4" />
          Usar outra conta Google
        </button>
      </div>
    </AuthShell>
  );
}
