import api from './api';
import { useSessionStore } from '@/store/sessionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { LockReason } from './types';

/**
 * Bloqueia agora: avisa o servidor (que corta controle e transmissão), limpa o
 * estado do workspace e sinaliza a rota de bloqueio. A UI bloqueia mesmo se a
 * chamada falhar — falhar fechado.
 */
export async function lockNow(reason: LockReason = 'manual'): Promise<void> {
  useWorkspaceStore.getState().reset();
  const store = useSessionStore.getState();
  if (store.session) store.setSession({ ...store.session, stage: 'LOCKED', lockReason: reason });
  store.force('locked');
  try {
    await api.post('/auth/lock', {}, { skipAuthRedirect: true });
  } catch {
    /* o servidor também bloqueia sozinho pelo prazo dele */
  }
}

export async function logoutNow(): Promise<void> {
  useWorkspaceStore.getState().reset();
  try {
    await api.post('/auth/logout', {}, { skipAuthRedirect: true });
  } catch {
    /* ignore */
  }
  useSessionStore.getState().clear();
}
