import { Component, ErrorInfo, ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
  error?: unknown;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erro não capturado:', error, errorInfo);
  }

  public render() {
    const erro = this.props.error ?? (this.state.hasError ? this.state.error : null);
    if (this.state.hasError || this.props.error) {
      const message = (erro as any)?.message || String(erro || 'Erro desconhecido');
      // Chunk antigo após deploy: recarregar resolve.
      if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)) {
        window.location.reload();
      }
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#121212] flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white dark:bg-[#181818] rounded-3xl shadow-premium-md border border-slate-200 dark:border-[#282828] p-8 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="h-20 w-20 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white dark:border-[#121212] shadow-md">
              <AlertTriangle className="h-10 w-10 text-rose-600 dark:text-rose-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Ops! Algo deu errado.</h1>
            <p className="text-slate-500 dark:text-[#b3b3b3] text-sm mb-8 leading-relaxed">Ocorreu um erro inesperado na aplicação.</p>
            <div className="bg-slate-50 dark:bg-[#080809] rounded-2xl p-4 mb-8 border border-slate-200 dark:border-[#282828] text-left overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Detalhes do erro</p>
              <p className="text-xs font-mono text-rose-600 dark:text-rose-400 break-all line-clamp-3">{message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => window.location.reload()} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:opacity-90 transition-all active:scale-95">
                <RefreshCw className="h-4 w-4" /> Recarregar
              </button>
              <a href="/" className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 dark:border-[#282828] bg-white dark:bg-transparent text-slate-700 dark:text-[#b3b3b3] font-bold text-sm hover:bg-slate-50 dark:hover:bg-[#282828] transition-all active:scale-95">
                <Home className="h-4 w-4" /> Início
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RouteErrorBoundary() {
  const erro = useRouteError();
  return <ErrorBoundary error={erro} />;
}

export default ErrorBoundary;
