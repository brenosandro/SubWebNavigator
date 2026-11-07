import { useEffect, useRef } from 'react';
import api, { fetchSession } from '@/lib/api';
import { lockNow } from '@/lib/lock';
import { useSessionStore } from '@/store/sessionStore';

const ACTIVITY_THROTTLE_MS = 20_000;
const CHECK_EVERY_MS = 5_000;
const SESSION_POLL_MS = 30_000;
const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Atividade humana e bloqueio proativo.
 *
 * O servidor é a autoridade (conta inatividade e tempo máximo e responde 423).
 * Aqui só: (1) avisamos atividade real — nunca heartbeat automático —, (2)
 * bloqueamos antes no cliente quando o prazo local vence e (3) consultamos a
 * sessão periodicamente para perceber bloqueio/revogação feitos em outro lugar.
 */
export function useIdleLock() {
  const session = useSessionStore((s) => s.session);
  const active = session?.stage === 'ACTIVE';
  const idleMinutes = session?.policy.idleMinutes ?? 5;
  const lockOnBlur = session?.policy.lockOnBlur ?? false;
  const controlExpiresAt = session?.controlExpiresAt ?? null;
  const lastInput = useRef(Date.now());
  const lastSent = useRef(0);

  useEffect(() => {
    if (!active) return;
    lastInput.current = Date.now();

    const onInput = () => {
      const now = Date.now();
      lastInput.current = now;
      if (now - lastSent.current >= ACTIVITY_THROTTLE_MS) {
        lastSent.current = now;
        void api.post('/auth/activity', {}).catch(() => {
          /* 423/401 tratados no interceptor */
        });
      }
    };
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, onInput, { passive: true, capture: true });

    const check = window.setInterval(() => {
      const now = Date.now();
      if (now - lastInput.current >= idleMinutes * 60_000) {
        void lockNow('idle');
        return;
      }
      if (controlExpiresAt && now >= new Date(controlExpiresAt).getTime()) {
        void lockNow('absolute');
      }
    }, CHECK_EVERY_MS);

    const poll = window.setInterval(() => {
      void fetchSession().catch(() => {});
    }, SESSION_POLL_MS);

    const onVisibility = () => {
      if (lockOnBlur && document.visibilityState === 'hidden') void lockNow('manual');
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, onInput, { capture: true });
      window.clearInterval(check);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, idleMinutes, lockOnBlur, controlExpiresAt]);
}
