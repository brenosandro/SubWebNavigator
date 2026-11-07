import { create } from 'zustand';
import type { Session } from '@/lib/types';

/**
 * Estado da sessão vindo de GET /api/auth/session.
 *
 * Propositalmente SEM persistência: o segredo da sessão é um cookie HttpOnly
 * que o JavaScript não lê. Aqui fica só a fotografia do que o servidor disse.
 */
export type ForcedRoute = 'login' | 'key' | 'locked' | null;

interface SessionState {
  session: Session | null;
  /** `true` depois da primeira consulta ao servidor (com ou sem sessão). */
  loaded: boolean;
  /** Sinal do interceptor HTTP para o watcher de rotas. */
  forced: ForcedRoute;
  setSession: (session: Session | null) => void;
  clear: () => void;
  force: (route: ForcedRoute) => void;
  markLocked: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  session: null,
  loaded: false,
  forced: null,
  setSession: (session) => set({ session, loaded: true }),
  clear: () => set({ session: null, loaded: true }),
  force: (forced) => set({ forced }),
  markLocked: () =>
    set((s) => ({
      forced: 'locked',
      session: s.session ? { ...s.session, stage: 'LOCKED', lockReason: s.session.lockReason ?? 'idle' } : s.session,
    })),
}));
