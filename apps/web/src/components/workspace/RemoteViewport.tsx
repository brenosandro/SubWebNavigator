import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { AlertTriangle, Loader2, Moon, Play, RotateCw, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/shared/ui';
import { apiErrorMessage } from '@/lib/api';
import { useProfileAction } from '@/hooks/useProfiles';
import type { useRemoteStream } from '@/hooks/useRemoteStream';
import type { Profile } from '@/lib/types';

type Stream = ReturnType<typeof useRemoteStream>;

const BUTTONS = ['left', 'middle', 'right'] as const;
const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

/**
 * Viewport remoto: <canvas> com os pixels do Chromium do servidor (não é iframe).
 * Entrada humana vira mensagens tipadas e limitadas; o gateway e o worker validam de novo.
 */
export default function RemoteViewport({ profile, stream }: { profile: Profile; stream: Stream }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const action = useProfileAction();
  const [actionMsg, setActionMsg] = useState('');
  const moveFrame = useRef<number | null>(null);
  const composing = useRef(false);
  const { canvasRef, state, setViewport, send, viewportRef } = stream;

  useEffect(() => setActionMsg(''), [profile.id]);

  // Viewport remoto acompanha o tamanho da área (1:1 até 1920×1200).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(([entry]) => {
      clearTimeout(t);
      t = setTimeout(() => entry && setViewport(entry.contentRect.width, entry.contentRect.height), 200);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [setViewport, state]);

  useEffect(() => {
    if (state === 'live') canvasRef.current?.focus({ preventScroll: true });
  }, [state, canvasRef]);

  const toRemote = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const w = c.width > 1 ? c.width : viewportRef.current.w;
    const h = c.height > 1 ? c.height : viewportRef.current.h;
    // object-contain: desconta as faixas quando a área é maior que o viewport remoto.
    const scale = Math.min(r.width / w, r.height / h);
    const offX = (r.width - w * scale) / 2;
    const offY = (r.height - h * scale) / 2;
    // Em link lento o quadro pode vir reduzido: converte para pixels do viewport remoto.
    const vw = viewportRef.current.w;
    const vh = viewportRef.current.h;
    const x = Math.min(Math.max((e.clientX - r.left - offX) / scale, 0), w) * (vw / w);
    const y = Math.min(Math.max((e.clientY - r.top - offY) / scale, 0), h) * (vh / h);
    return { x, y };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    send({ t: 'mouse', a: 'down', ...toRemote(e), b: BUTTONS[e.button] ?? 'left', c: Math.min(Math.max(e.detail, 1), 3), m: mods(e) });
  };
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    send({ t: 'mouse', a: 'up', ...toRemote(e), b: BUTTONS[e.button] ?? 'left', c: Math.min(Math.max(e.detail, 1), 3), m: mods(e) });
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (moveFrame.current) return;
    const p = toRemote(e);
    const b = e.buttons & 1 ? 'left' : e.buttons & 2 ? 'right' : e.buttons & 4 ? 'middle' : 'none';
    const m = mods(e);
    moveFrame.current = requestAnimationFrame(() => {
      moveFrame.current = null;
      send({ t: 'mouse', a: 'move', ...p, b, c: 0, m });
    });
  };
  const onWheel = (e: WheelEvent<HTMLCanvasElement>) => {
    const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
    send({ t: 'wheel', ...toRemote(e), dx: Math.max(-5000, Math.min(5000, e.deltaX * scale)), dy: Math.max(-5000, Math.min(5000, e.deltaY * scale)), m: mods(e) });
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>, a: 'down' | 'up') => {
    if (composing.current || e.nativeEvent.isComposing) return;
    // Ctrl/⌘+K continua abrindo a paleta do app; o resto vai para o site.
    if (a === 'down' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return;
    e.preventDefault();
    send({ t: 'key', a, key: e.key.slice(0, 32), code: e.code.slice(0, 32), kc: Math.min(e.keyCode, 255), m: mods(e) });
  };

  const start = async () => {
    setActionMsg('');
    try {
      await action.mutateAsync({ id: profile.id, action: 'start' });
    } catch (err) {
      setActionMsg(apiErrorMessage(err, 'Não foi possível iniciar o perfil.'));
    }
  };

  const overlay = (() => {
    if (profile.status === 'STARTING' || action.isPending) {
      return <Card icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Acordando perfil…" text={`Subindo o navegador isolado de ${profile.host} no servidor. Isso leva alguns segundos.`} />;
    }
    if (profile.status === 'STOPPED' || profile.status === 'SUSPENDED') {
      const suspended = profile.status === 'SUSPENDED';
      return (
        <Card
          icon={suspended ? <Moon className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          title={suspended ? 'Perfil suspenso' : 'Perfil parado'}
          text={suspended ? 'O navegador remoto está congelado; o site pode ter deixado de receber notificações em tempo real.' : `O navegador de ${profile.host} roda no servidor, com os dados deste perfil isolados dos demais.`}
          action={<Button icon={Play} onClick={start}>{suspended ? 'Acordar perfil' : 'Iniciar perfil'}</Button>}
          message={actionMsg}
        />
      );
    }
    if (profile.status === 'ERROR') {
      return <Card tone="danger" icon={<AlertTriangle className="h-5 w-5" />} title="O navegador remoto falhou" text={stream.error || 'O worker deste perfil encerrou com erro.'} action={<Button icon={RotateCw} onClick={start}>Reiniciar perfil</Button>} message={actionMsg} />;
    }
    if (state === 'busy') {
      return <Card icon={<Users className="h-5 w-5" />} title="Em uso em outro dispositivo" text="Só um dispositivo controla o perfil por vez. Assumir encerra a transmissão no outro e pede sua chave de segurança." action={<Button icon={ShieldCheck} onClick={stream.takeOver}>Assumir controle</Button>} />;
    }
    if (state === 'error') {
      return <Card tone="danger" icon={<AlertTriangle className="h-5 w-5" />} title="Transmissão interrompida" text={stream.error} action={<Button icon={RotateCw} onClick={stream.retry}>Reconectar</Button>} />;
    }
    if (state === 'connecting') return <Card icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Conectando com segurança…" text="Autorizando esta sessão e abrindo o canal criptografado." />;
    return null;
  })();

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#e9edf2] dark:bg-[#0b0b0b]" aria-label={`Área remota de ${profile.title}`}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        width={1}
        height={1}
        aria-label={`Página remota de ${profile.host}. Clique para interagir; teclado e mouse vão para o site.`}
        className={`absolute inset-0 h-full w-full touch-none select-none object-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/60 ${state === 'live' && profile.status === 'ONLINE' ? '' : 'invisible'}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onWheel={onWheel}
        onKeyDown={(e) => onKey(e, 'down')}
        onKeyUp={(e) => onKey(e, 'up')}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          if (e.data) send({ t: 'text', s: e.data.slice(0, 200) });
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {overlay ? <div className="absolute inset-0 flex items-center justify-center overflow-auto p-4">{overlay}</div> : null}
      {stream.notice ? (
        <div key={stream.notice.id} className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-slate-900/90 px-3 py-2 text-[12px] text-white shadow-lg animate-in fade-in" role="status">
          {stream.notice.text}
        </div>
      ) : null}
    </div>
  );
}

function Card({ icon, title, text, action, message, tone }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode; message?: string; tone?: 'danger' }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-premium-md backdrop-blur dark:border-[#282828] dark:bg-[#181818]/95">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone === 'danger' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300'}`}>{icon}</div>
      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-2 text-[12.5px] leading-6 text-slate-500 dark:text-[#b3b3b3]">{text}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      <p className="mt-3 min-h-[1rem] text-[12px] font-medium text-rose-600 dark:text-rose-300" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
