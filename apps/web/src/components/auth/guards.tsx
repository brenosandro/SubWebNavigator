import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/store/sessionStore';
import LoadingScreen from '@/components/shared/LoadingScreen';

/**
 * Raiz de todas as rotas: escuta os sinais do interceptor HTTP (401/403/423)
 * e leva para a tela certa.
 */
export function RootShell() {
  const forced = useSessionStore((s) => s.forced);
  const force = useSessionStore((s) => s.force);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!forced) return;
    const path = location.pathname;
    const inPrivate = path.startsWith('/app') || path.startsWith('/bloqueado') || path.startsWith('/entrar');
    if (forced === 'locked' && path !== '/bloqueado') navigate('/bloqueado', { replace: true });
    else if (forced === 'key' && path !== '/entrar/chave') navigate('/entrar/chave', { replace: true });
    else if (forced === 'login' && inPrivate) navigate('/login', { replace: true });
    force(null);
  }, [forced, force, navigate, location.pathname]);

  return <Outlet />;
}

/** Espera a primeira consulta de sessão antes de decidir a rota. */
export function RequireLoaded({ children }: { children: ReactNode }) {
  const loaded = useSessionStore((s) => s.loaded);
  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] bg-[#f5f2ee] dark:bg-[#121212]">
        <LoadingScreen label="Verificando sessão" hint="Conexão segura" />
      </div>
    );
  }
  return <>{children}</>;
}

/** Só renderiza o app com sessão ACTIVE (Google + chave). */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const loaded = useSessionStore((s) => s.loaded);
  const session = useSessionStore((s) => s.session);
  const location = useLocation();
  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] bg-white dark:bg-[#121212]">
        <LoadingScreen label="Verificando sessão" hint="Conexão segura" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.stage === 'MFA_PENDING') return <Navigate to={`/entrar/chave?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  if (session.stage === 'LOCKED') return <Navigate to="/bloqueado" replace />;
  return <>{children}</>;
}
