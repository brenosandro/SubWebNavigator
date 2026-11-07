import { z } from 'zod';

/**
 * @subweb/protocol — fonte única do protocolo entre navegador, gateway (API) e worker.
 * O gateway valida antes de repassar e o worker valida de novo (defesa em profundidade).
 *
 * Protocolo LIMITADO entre o gateway (API) e o worker. Só eventos de entrada
 * humana e navegação básica — nada de JavaScript, CDP arbitrário, arquivos ou
 * comandos de sistema (docs/security.md: TH-06, S-023).
 *
 * Coordenadas em pixels do viewport remoto; o worker ainda limita ao tamanho atual.
 */

export const MAX_W = 1920;
export const MAX_H = 1200;
export const MIN_W = 320;
export const MIN_H = 240;

const coord = z.number().finite();
const mods = z.number().int().min(0).max(15).default(0);

export const InputMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('viewport'), w: z.number().int().min(MIN_W).max(MAX_W), h: z.number().int().min(MIN_H).max(MAX_H) }).strict(),
  z
    .object({
      t: z.literal('mouse'),
      a: z.enum(['move', 'down', 'up']),
      x: coord,
      y: coord,
      b: z.enum(['none', 'left', 'middle', 'right']).default('none'),
      c: z.number().int().min(0).max(3).default(1),
      m: mods,
    })
    .strict(),
  z.object({ t: z.literal('wheel'), x: coord, y: coord, dx: z.number().finite().min(-5000).max(5000), dy: z.number().finite().min(-5000).max(5000), m: mods }).strict(),
  z
    .object({
      t: z.literal('key'),
      a: z.enum(['down', 'up']),
      key: z.string().min(1).max(32),
      code: z.string().max(32).default(''),
      kc: z.number().int().min(0).max(255).default(0),
      m: mods,
    })
    .strict(),
  z.object({ t: z.literal('text'), s: z.string().min(1).max(200) }).strict(),
  z.object({ t: z.literal('nav'), a: z.enum(['back', 'forward', 'reload', 'home']) }).strict(),
  // Controle de fluxo: o cliente confirma cada quadro desenhado (não é entrada humana).
  z.object({ t: z.literal('ack') }).strict(),
]);
export type InputMessage = z.infer<typeof InputMessage>;

/** Mensagens do worker para o gateway (texto). Quadros vão como binário (JPEG). */
export type WorkerEvent =
  | { t: 'ready'; w: number; h: number }
  | { t: 'page'; origin: string; title: string; canBack: boolean; canForward: boolean; loading: boolean }
  | { t: 'notice'; code: 'popup_blocked' | 'upload_blocked' | 'download_blocked' | 'dialog_dismissed'; origin?: string }
  | { t: 'error'; code: string }
  /** Telemetria da transmissão (sem conteúdo): quadros/s, kbit/s, ida e volta do quadro, qualidade JPEG. */
  | { t: 'stats'; fps: number; kbps: number; rtt: number; q: number };

/** Origem para exibição: nunca caminho/query (podem conter tokens). */
export function displayOrigin(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : u.protocol.replace(':', '');
  } catch {
    return '';
  }
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/** Tecla não imprimível: vai como rawKeyDown sem `text`. */
export function isPrintable(key: string): boolean {
  return [...key].length === 1;
}
