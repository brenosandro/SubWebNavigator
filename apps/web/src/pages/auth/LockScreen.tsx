import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, LogOut, Lock } from 'lucide-react';
import { initialsOf } from '@/lib/format';
import api, { apiErrorMessage } from '@/lib/api';
import { authenticateWithKey } from '@/lib/webauthn';
import { useSessionStore } from '@/store/sessionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { DatatomsLogo } from '@/assets/logo/logo';
import { useQueryClient } from '@tanstack/react-query';
import { AuthError, authPrimaryButtonClass } from './AuthShell';
import { KeyPulse } from './SecurityKeyPage';

const REASONS: Record<string, { title: string; text: string }> = {
  manual: { title: 'Sessão bloqueada', text: 'Você bloqueou a sessão. A transmissão e o controle foram encerrados no servidor.' },
  idle: { title: 'Bloqueada por inatividade', text: 'Passou do tempo de inatividade configurado. Nada continuou visível nem controlável.' },
  absolute: { title: 'Tempo máximo de controle atingido', text: 'Por segurança, o controle precisa ser revalidado periodicamente, mesmo em uso contínuo.' },
};

/**
 * Tela de bloqueio (S01). Renderiza sozinha: nenhum conteúdo do workspace fica
 * montado por trás, e o cache de dados é descartado ao entrar aqui.
 */
export default function LockScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const clear = useSessionStore((s) => s.clear);
  const resetWorkspace = useWorkspaceStore((s) => s.reset);
  const [waiting, setWaiting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Sem resíduo da sessão anterior em memória da UI.
    resetWorkspace();
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth-config' });
  }, [qc, resetWorkspace]);

  if (!session) return <Navigate to="/login" replace />;
  if (session.stage === 'MFA_PENDING') return <Navigate to="/entrar/chave" replace />;
  if (session.stage === 'ACTIVE') return <Navigate to="/app" replace />;

  const reason = REASONS[session.lockReason ?? 'manual'] ?? REASONS.manual;

  const unlock = async () => {
    setErrorMsg('');
    setWaiting(true);
    try {
      const next = await authenticateWithKey('unlock');
      if (next.stage === 'ACTIVE') navigate('/app', { replace: true });
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Não foi possível desbloquear.'));
    } finally {
      setWaiting(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {}, { skipAuthRedirect: true });
    } catch {
      /* ignore */
    }
    clear();
    navigate('/login', { replace: true });
  };

  const initials = initialsOf(session.owner.name);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f5f2ee] px-4 dark:bg-[#121212]">
      <div className="absolute inset-0" aria-hidden>
        <div className="absolute left-[10%] top-[-10%] h-[360px] w-[360px] rounded-full bg-white/60 blur-3xl dark:bg-white/[0.03]" />
        <div className="absolute bottom-[-12%] right-[5%] h-[380px] w-[380px] rounded-full bg-stone-300/30 blur-3xl dark:bg-sky-500/[0.06]" />
      </div>

      <main className="relative z-10 w-full max-w-sm rounded-2xl border border-black/5 bg-white/80 p-6 text-center shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-black/80" aria-labelledby="lock-title">
        <div className="mb-5 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-[#b3b3b3]">
          <DatatomsLogo size={20} />
          SubWebNavigator
        </div>

        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-900 text-lg font-semibold text-white shadow-md dark:border-[#181818] dark:bg-white dark:text-slate-900">
          {session.owner.avatarUrl ? <img src={session.owner.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initials || <Lock className="h-6 w-6" />}
        </div>
        <div className="text-[14px] font-semibold text-slate-900 dark:text-white">{session.owner.name}</div>

        <h1 id="lock-title" className="mt-4 flex items-center justify-center gap-2 text-[1.2rem] font-semibold tracking-tight text-slate-900 dark:text-white">
          <Lock className="h-4 w-4" />
          {reason.title}
        </h1>
        <p className="mt-1.5 text-[12.5px] leading-5 text-slate-500 dark:text-[#b3b3b3]">{reason.text}</p>

        <div className="mt-5 space-y-3">
          <KeyPulse waiting={waiting} />
          <div aria-live="polite">
            <AuthError message={errorMsg} />
          </div>
          <button type="button" onClick={unlock} disabled={waiting} className={authPrimaryButtonClass} autoFocus>
            {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Desbloquear com chave de segurança
          </button>
          <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 hover:text-slate-900 hover:underline dark:text-[#b3b3b3] dark:hover:text-white">
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </main>
    </div>
  );
}
