import axios, { AxiosError } from 'axios';
import { useSessionStore } from '@/store/sessionStore';
import type { Session } from './types';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Não dispara redirecionamentos globais (401/403/423) — o chamador trata. */
    skipAuthRedirect?: boolean;
  }
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
  traceId?: string;
  issues?: unknown;
}

/**
 * Cliente HTTP da API. Mesmo origin (proxy do Vite / nginx), cookie HttpOnly
 * enviado pelo navegador; nenhum token passa pelo JavaScript.
 */
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20_000,
  headers: { 'x-swn-csrf': '1', Accept: 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    if (!error.config?.skipAuthRedirect) {
      const store = useSessionStore.getState();
      if (status === 423 || code === 'LOCKED') {
        store.markLocked();
      } else if (status === 401) {
        store.clear();
        store.force('login');
      } else if (status === 403 && code === 'MFA_REQUIRED') {
        store.force('key');
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) return (err.response?.data as ApiErrorBody | undefined)?.code;
  return (err as { code?: string } | null)?.code;
}

const NETWORK_FALLBACK = 'Não foi possível falar com o servidor. Verifique a conexão.';

export function apiErrorMessage(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorBody | undefined;
    if (data?.message) return data.message;
    if (!err.response) return NETWORK_FALLBACK;
    if (err.response.status === 429) return 'Muitas tentativas. Aguarde um instante.';
    return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Consulta a sessão atual e atualiza o store. Retorna `null` sem sessão. */
export async function fetchSession(): Promise<Session | null> {
  try {
    const { data } = await api.get<Session>('/auth/session', { skipAuthRedirect: true });
    useSessionStore.getState().setSession(data);
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      useSessionStore.getState().clear();
      return null;
    }
    // Erro de rede: marca carregado sem sessão para não travar a UI.
    useSessionStore.getState().clear();
    throw err;
  }
}

export default api;
