import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, { apiErrorCode, apiErrorMessage, fetchSession } from '@/lib/api';
import { withStepUp } from '@/lib/webauthn';
import { lockNow } from '@/lib/lock';
import { PROFILES_KEY } from './useProfiles';
import type { WorkerEvent } from '@subweb/protocol';
import type { Profile } from '@/lib/types';

/**
 * Canal de transmissão de UM perfil: ticket de uso único → WSS → quadros JPEG
 * num <canvas>. Nada do site remoto entra no DOM do app (não é iframe), e nada
 * do site fica no navegador visitante além do quadro atual em memória.
 */

export type StreamState = 'idle' | 'connecting' | 'live' | 'busy' | 'error';
export type PageInfo = Omit<Extract<WorkerEvent, { t: 'page' }>, 't'>;
export type Notice = { id: number; text: string };
/** Ida e volta do quadro (ms), banda usada (kbit/s) e qualidade JPEG atual. */
export type LinkStats = { rtt: number; kbps: number; q: number };

const NOTICES: Record<string, string> = {
  popup_blocked: 'Uma nova janela/aba foi bloqueada (uma aba por perfil nesta versão).',
  upload_blocked: 'Envio de arquivos está desligado pela política de segurança.',
  download_blocked: 'Download bloqueado pela política de segurança.',
  dialog_dismissed: 'Uma caixa de diálogo do site foi fechada automaticamente.',
};

const CLOSE_MESSAGES: Record<number, string> = {
  4400: 'A autorização da transmissão expirou.',
  4409: 'Outro dispositivo assumiu o controle deste perfil.',
  4410: 'O perfil foi suspenso ou parado.',
  4502: 'O navegador remoto não respondeu.',
};

export const MAX_W = 1920;
export const MAX_H = 1200;

export function useRemoteStream(profile: Profile | null) {
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const viewportRef = useRef({ w: 1280, h: 800 });
  const decodingRef = useRef(false);
  const pendingRef = useRef<Blob | null>(null);
  const framesRef = useRef(0);
  const [link, setLink] = useState<LinkStats | null>(null);
  const [state, setState] = useState<StreamState>('idle');
  const [error, setError] = useState('');
  const [page, setPage] = useState<PageInfo | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fps, setFps] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const takeoverRef = useRef(false);

  /** Apaga o último quadro: nada do perfil anterior fica visível. */
  const clearCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    c.width = 1;
    c.height = 1;
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const setViewport = useCallback(
    (w: number, h: number) => {
      const next = { w: Math.round(Math.min(Math.max(w, 320), MAX_W)), h: Math.round(Math.min(Math.max(h, 240), MAX_H)) };
      if (next.w === viewportRef.current.w && next.h === viewportRef.current.h) return;
      viewportRef.current = next;
      send({ t: 'viewport', ...next });
    },
    [send],
  );

  // FPS medido no cliente (telemetria local, não enviada).
  useEffect(() => {
    const t = setInterval(() => {
      setFps(framesRef.current);
      framesRef.current = 0;
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const online = profile?.status === 'ONLINE';
  const profileId = profile?.id ?? null;

  useEffect(() => {
    if (!profileId || !online) {
      setState('idle');
      return;
    }
    let cancelled = false;
    let ws: WebSocket | null = null;
    setState('connecting');
    setError('');
    setPage(null);
    setLink(null);
    pendingRef.current = null;
    decodingRef.current = false;

    void (async () => {
      let ticket: string;
      try {
        const takeover = takeoverRef.current;
        takeoverRef.current = false;
        const request = () => api.post<{ ticket: string }>(`/v1/profiles/${profileId}/stream-ticket`, { takeover });
        ticket = (await (takeover ? withStepUp(request) : request())).data.ticket;
      } catch (err) {
        if (cancelled) return;
        if (apiErrorCode(err) === 'CONTROL_BUSY') return setState('busy');
        setError(apiErrorMessage(err, 'Não foi possível autorizar a transmissão.'));
        setState('error');
        void qc.invalidateQueries({ queryKey: PROFILES_KEY });
        return;
      }
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/api/v1/stream`);
      ws.binaryType = 'blob';
      wsRef.current = ws;
      // O ticket vai na primeira mensagem, nunca na URL.
      ws.onopen = () => ws?.send(JSON.stringify({ t: 'auth', ticket }));
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          let msg: WorkerEvent;
          try {
            msg = JSON.parse(ev.data) as WorkerEvent;
          } catch {
            return;
          }
          if (msg.t === 'ready') {
            setState('live');
            send({ t: 'viewport', ...viewportRef.current });
          } else if (msg.t === 'page') {
            setPage({ origin: String(msg.origin ?? ''), title: String(msg.title ?? ''), canBack: !!msg.canBack, canForward: !!msg.canForward, loading: !!msg.loading });
          } else if (msg.t === 'stats') {
            setLink({ rtt: Number(msg.rtt) || 0, kbps: Number(msg.kbps) || 0, q: Number(msg.q) || 0 });
          } else if (msg.t === 'notice' && msg.code in NOTICES) {
            setNotice({ id: Date.now(), text: NOTICES[msg.code]! });
          } else if (msg.t === 'error') {
            setError(msg.code === 'sandbox_unavailable' ? 'O sandbox do navegador remoto não pôde ser ativado.' : 'O navegador remoto encerrou.');
          }
          return;
        }
        // Quadro: cada um é confirmado ao worker depois de desenhado (ou substituído),
        // o que limita os quadros em trânsito e impede o atraso acumulado.
        if (decodingRef.current) {
          if (pendingRef.current) ack(); // o que esperava ficou velho: descarta
          pendingRef.current = ev.data as Blob;
          return;
        }
        drawFrame(ev.data as Blob);
      };
      const ack = () => ws?.readyState === WebSocket.OPEN && ws.send('{"t":"ack"}');
      const drawFrame = (blob: Blob) => {
        decodingRef.current = true;
        void createImageBitmap(blob)
          .then((bmp) => {
            const c = canvasRef.current;
            if (!c || cancelled) return bmp.close();
            if (c.width !== bmp.width || c.height !== bmp.height) {
              c.width = bmp.width;
              c.height = bmp.height;
            }
            c.getContext('2d')?.drawImage(bmp, 0, 0);
            bmp.close();
            framesRef.current++;
          })
          .catch(() => {})
          .finally(() => {
            decodingRef.current = false;
            ack();
            const next = pendingRef.current;
            pendingRef.current = null;
            if (next && !cancelled) drawFrame(next);
          });
      };
      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null;
        clearCanvas();
        if (cancelled) return;
        if (ev.code === 4423) return void lockNow('idle');
        if (ev.code === 4403 || ev.code === 4401) return void fetchSession();
        if (ev.code === 4409) return setState('busy');
        if (ev.code === 4410) {
          void qc.invalidateQueries({ queryKey: PROFILES_KEY });
          return setState('idle');
        }
        setError(CLOSE_MESSAGES[ev.code] ?? 'A transmissão foi interrompida.');
        setState('error');
        void qc.invalidateQueries({ queryKey: PROFILES_KEY });
      };
    })();

    return () => {
      cancelled = true;
      ws?.close(1000, 'troca de perfil');
      if (wsRef.current === ws) wsRef.current = null;
      clearCanvas();
    };
  }, [profileId, online, attempt, qc, send, clearCanvas]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const takeOver = useCallback(() => {
    takeoverRef.current = true;
    setAttempt((a) => a + 1);
  }, []);

  return { canvasRef, state, error, page, notice, fps, link, send, setViewport, retry, takeOver, viewportRef };
}
