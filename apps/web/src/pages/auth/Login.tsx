import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api, { apiErrorMessage, fetchSession } from '@/lib/api';
import { safeReturnTo } from '@/lib/navigation';
import { useSessionStore } from '@/store/sessionStore';
import AuthShell, { AuthError, AuthSteps, GoogleButton, authSecondaryButtonClass } from './AuthShell';

const OAUTH_ERRORS: Record<string, string> = {
  acesso_negado: 'Acesso não autorizado para esta conta.',
  estado_invalido: 'A tentativa de login expirou. Tente novamente.',
  config: 'Login com Google não configurado no servidor.',
  google: 'O Google não concluiu o login.',
  email_nao_verificado: 'E-mail Google não verificado.',
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const session = useSessionStore((s) => s.session);
  const from = (location.state as { from?: string } | null)?.from ?? params.get('returnTo');
  const returnTo = safeReturnTo(from);
  const [errorMsg, setErrorMsg] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const [devLoading, setDevLoading] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => (await api.get<{ googleEnabled: boolean; devLogin: boolean }>('/auth/config', { skipAuthRedirect: true })).data,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    const code = params.get('erro');
    if (code) {
      setErrorMsg(OAUTH_ERRORS[code] ?? 'Não foi possível entrar. Tente novamente.');
      params.delete('erro');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (session?.stage === 'ACTIVE') return <Navigate to={returnTo} replace />;
  if (session?.stage === 'LOCKED') return <Navigate to="/bloqueado" replace />;

  const startGoogle = () => {
    setErrorMsg('');
    setRedirecting(true);
    window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const devLogin = async () => {
    setDevLoading(true);
    setErrorMsg('');
    try {
      await api.post('/auth/dev-login', {}, { skipAuthRedirect: true });
      // Sem recarregar a página: o store precisa da sessão nova antes da etapa da chave.
      await fetchSession();
      navigate(`/entrar/chave?returnTo=${encodeURIComponent(returnTo)}`);
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'Login de desenvolvimento indisponível.'));
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <AuthShell
      title="Entrar no SubWebNavigator"
      description="Acesso exclusivo do titular. Primeiro você entra com o Google; em seguida confirma com a sua chave de segurança física."
      footer={<span className="block">Sem cadastro público: só a conta Google autorizada no servidor consegue entrar.</span>}
    >
      <div className="space-y-4">
        <AuthSteps current={1} />
        <div aria-live="polite">
          <AuthError message={errorMsg} />
        </div>

        <GoogleButton onClick={startGoogle} disabled={redirecting || config?.googleEnabled === false} label={redirecting ? 'Abrindo o Google…' : 'Continuar com Google'} />
        {config?.googleEnabled === false ? <p className="text-[11px] text-amber-700 dark:text-amber-300">O login com Google ainda não foi configurado neste servidor.</p> : null}

        <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-[12px] leading-5 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-[#b3b3b3]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>Tenha sua chave de segurança (USB ou NFC) por perto. Código por SMS, e-mail ou aplicativo autenticador não liberam o acesso.</span>
        </div>

        {config?.devLogin ? (
          <button type="button" onClick={devLogin} disabled={devLoading} className={authSecondaryButtonClass}>
            {devLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Entrar em modo desenvolvimento
          </button>
        ) : null}
      </div>
    </AuthShell>
  );
}
