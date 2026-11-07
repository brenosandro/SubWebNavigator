/**
 * Agente do worker SubWebNavigator — roda DENTRO do container isolado de um perfil.
 *
 * - Xvfb + Chromium com interface (não headless): navegador comum, sem disfarçar
 *   user-agent. Sandbox do Chromium LIGADO (sem --no-sandbox; ver infra/worker).
 * - CDP só por pipe (fds 3/4), nunca por porta de rede.
 * - Saída de rede somente pelo proxy de egress (rede do container é `internal`).
 * - Um único cliente: o gateway da API, com token do runtime + fencing token.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, readlinkSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { CdpPipe } from './cdp.js';
import { clamp, displayOrigin, InputMessage, isPrintable, MAX_H, MAX_W, type WorkerEvent } from '@subweb/protocol';

const env = {
  token: process.env.WORKER_TOKEN ?? '',
  startUrl: process.env.START_URL ?? '',
  proxy: process.env.EGRESS_PROXY ?? 'http://swn-egress:3128',
  port: Number(process.env.WORKER_PORT ?? 7070),
  chromium: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  profileDir: process.env.PROFILE_DIR ?? '/profile/chromium',
  display: ':99',
};
if (env.token.length < 32) fail('WORKER_TOKEN ausente ou curto');
if (!env.startUrl.startsWith('https://')) fail('START_URL deve ser https');
// O token não fica no ambiente de processos filhos (Chromium/renderers).
delete process.env.WORKER_TOKEN;

function log(msg: string, extra: Record<string, unknown> = {}) {
  // Sem URL, título, quadro ou entrada de teclado em log (S-029).
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }) + '\n');
}
function fail(msg: string): never {
  log(`fatal: ${msg}`);
  process.exit(1);
}

// Encerramento em andamento: saídas de Xvfb/Chromium deixam de ser erro.
let shuttingDown = false;
let xvfbProc: ChildProcess | null = null;

// ── Xvfb ────────────────────────────────────────────────────────────────────
async function startXvfb(): Promise<ChildProcess> {
  const xvfb = spawn('Xvfb', [env.display, '-screen', '0', `${MAX_W}x${MAX_H}x24`, '-nolisten', 'tcp', '-ac'], { stdio: 'ignore' });
  xvfbProc = xvfb;
  xvfb.on('exit', (code) => {
    if (!shuttingDown) fail(`Xvfb saiu (${code})`);
  });
  const socket = `/tmp/.X11-unix/X${env.display.slice(1)}`;
  for (let i = 0; i < 100 && !existsSync(socket); i++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(socket)) fail('Xvfb não iniciou');
  return xvfb;
}

// ── Chromium ────────────────────────────────────────────────────────────────
function chromiumArgs(): string[] {
  return [
    `--user-data-dir=${env.profileDir}`,
    '--remote-debugging-pipe',
    `--proxy-server=${env.proxy}`,
    // Nem loopback escapa do proxy: tudo passa pela política de egress.
    '--proxy-bypass-list=<-loopback>',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--deny-permission-prompts',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-features=Translate,MediaRouter,DialMediaRouteProvider,OptimizationHints,AutofillServerCommunication,CalculateNativeWinOcclusion',
    // Sem gerenciador de janelas no Xvfb o Chromium acha a janela "oculta" e
    // estrangula a renderização: o screencast parava de mandar quadros.
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    // Rolagem feita só no thread do compositor não gera quadro de screencast no
    // modo com janela: forçar rolagem no thread principal faz cada scroll pintar.
    '--disable-threaded-scrolling',
    '--disable-background-networking',
    '--disable-breakpad',
    '--metrics-recording-only',
    '--mute-audio',
    '--disable-gpu',
    '--lang=pt-BR',
    '--window-position=0,0',
    `--window-size=${MAX_W},${MAX_H}`,
    'about:blank',
  ];
}

const chromiumEnv = () => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: process.env.HOME ?? '/tmp/home',
  DISPLAY: env.display,
  LANG: 'pt_BR.UTF-8',
  TZ: process.env.TZ ?? 'America/Sao_Paulo',
});

// ── Evidência de sandbox (S-026) ────────────────────────────────────────────
export function sandboxReport() {
  let renderers = 0;
  let seccomp = 0;
  let userns = 0;
  let selfNs = '';
  try {
    selfNs = readlinkSync('/proc/self/ns/user');
  } catch {
    /* fora do Linux */
  }
  for (const pid of safeReaddir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('--type=renderer')) continue;
      renderers++;
      if (/^Seccomp:\s+2$/m.test(readFileSync(`/proc/${pid}/status`, 'utf8'))) seccomp++;
      if (selfNs && readlinkSync(`/proc/${pid}/ns/user`) !== selfNs) userns++;
    } catch {
      /* processo terminou */
    }
  }
  return { renderers, seccompFilteredRenderers: seccomp, userNamespacedRenderers: userns };
}
function safeReaddir(dir: string) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// ── Estado ──────────────────────────────────────────────────────────────────
let cdp: CdpPipe;
let chrome: ChildProcess;
let pageSession = '';
let pageTargetId = '';
let viewport = { w: 1280, h: 800 };
let client: WebSocket | null = null;
let highestFencing = -1;
let streaming = false;
let ready = false;

function emit(ev: WorkerEvent) {
  if (client && client.readyState === client.OPEN) client.send(JSON.stringify(ev));
}

async function attachPage(targetId: string) {
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  pageSession = sessionId;
  pageTargetId = targetId;
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId).catch(() => {});
  await cdp.send('Page.bringToFront', {}, sessionId).catch(() => {});
  await applyViewport();
}

async function applyViewport() {
  if (!pageSession) return;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.w, height: viewport.h, deviceScaleFactor: 1, mobile: false }, pageSession);
  if (streaming) await restartScreencast();
}

// ── Controle de fluxo fim a fim ─────────────────────────────────────────────
// Sem isto, os quadros se acumulavam nos buffers do caminho (gateway, nginx,
// cloudflared, internet do servidor) e a tela mostrava o passado com segundos
// de atraso. Agora: no máximo WINDOW quadros sem confirmação do cliente; os que
// chegam nesse meio-tempo são substituídos pelo mais recente (nunca enfileirados).
const WINDOW = 2;
const STALL_MS = 1500;
/** Degraus de qualidade: caem quando a ida e volta do quadro cresce (link lento). */
const TIERS = [
  { q: 70, s: 1 },
  { q: 55, s: 1 },
  { q: 42, s: 1 },
  { q: 40, s: 0.75 },
] as const;
let tier = 1;
let inFlight: number[] = []; // instante de envio de cada quadro sem confirmação
let pendingFrame: Buffer | null = null;
let rttAvg = 0;
let lastTierChange = 0;
let winFrames = 0;
let winBytes = 0;

function resetFlow() {
  inFlight = [];
  pendingFrame = null;
  rttAvg = 0;
  winFrames = 0;
  winBytes = 0;
}

function sendFrame(buf: Buffer) {
  if (!client || client.readyState !== client.OPEN) return;
  // Proteção de memória: com o controle de fluxo isto praticamente nunca dispara.
  if (client.bufferedAmount > 2_000_000) return;
  client.send(buf, { binary: true });
  inFlight.push(Date.now());
  winFrames++;
  winBytes += buf.length;
}

function onFrame(buf: Buffer) {
  if (inFlight.length < WINDOW) sendFrame(buf);
  else pendingFrame = buf;
}

function onClientAck() {
  const sentAt = inFlight.shift();
  if (sentAt !== undefined) {
    const rtt = Date.now() - sentAt;
    rttAvg = rttAvg ? rttAvg * 0.8 + rtt * 0.2 : rtt;
  }
  if (pendingFrame && inFlight.length < WINDOW) {
    const f = pendingFrame;
    pendingFrame = null;
    sendFrame(f);
  }
}

/** A cada 2 s: destrava confirmação perdida, ajusta a qualidade e informa o cliente. */
function flowTick() {
  if (!client) return;
  const now = Date.now();
  if (inFlight.length && now - inFlight[0]! > STALL_MS) {
    // Quadro descartado no caminho (ou cliente antigo sem ack): não trava a tela.
    rttAvg = Math.max(rttAvg, STALL_MS);
    inFlight = [];
    if (pendingFrame) {
      const f = pendingFrame;
      pendingFrame = null;
      sendFrame(f);
    }
  }
  if (streaming && now - lastTierChange > 4000) {
    let next = tier;
    if (rttAvg > 220 && tier < TIERS.length - 1) next = tier + 1;
    else if (rttAvg && rttAvg < 110 && tier > 0 && now - lastTierChange > 10_000) next = tier - 1;
    if (next !== tier) {
      tier = next;
      lastTierChange = now;
      void restartScreencast().catch(() => {});
    }
  }
  emit({ t: 'stats', fps: Math.round(winFrames / 2), kbps: Math.round((winBytes * 8) / 1000 / 2), rtt: Math.round(rttAvg), q: TIERS[tier]!.q });
  winFrames = 0;
  winBytes = 0;
}
setInterval(flowTick, 2000).unref();

async function startScreencast() {
  if (!pageSession) return;
  streaming = true;
  const { q, s } = TIERS[tier]!;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: q, maxWidth: Math.round(viewport.w * s), maxHeight: Math.round(viewport.h * s), everyNthFrame: 1 }, pageSession);
}
async function stopScreencast() {
  if (!pageSession || !streaming) return;
  streaming = false;
  await cdp.send('Page.stopScreencast', {}, pageSession).catch(() => {});
}
async function restartScreencast() {
  await stopScreencast();
  await startScreencast();
}
let restartTimer: NodeJS.Timeout | null = null;
function scheduleScreencastRestart() {
  if (!client) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (client && streaming) void restartScreencast().catch(() => {});
  }, 120);
}

async function sendPageInfo(loading = false) {
  if (!pageSession) return;
  try {
    const hist = await cdp.send<{ currentIndex: number; entries: Array<{ url: string; title: string }> }>('Page.getNavigationHistory', {}, pageSession);
    const cur = hist.entries[hist.currentIndex];
    emit({ t: 'page', origin: displayOrigin(cur?.url ?? ''), title: (cur?.title ?? '').slice(0, 120), canBack: hist.currentIndex > 0, canForward: hist.currentIndex < hist.entries.length - 1, loading });
  } catch {
    /* página trocando */
  }
}

/**
 * Encerramento não limpo (crash, kill, reboot) deixa SingletonLock/Socket/Cookie
 * apontando para o hostname do container anterior, e o Chromium se recusa a abrir
 * o perfil. É seguro remover: o controller garante UM container por volume.
 */
function clearStaleSingleton() {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      rmSync(path.join(env.profileDir, name), { force: true });
    } catch {
      /* ausente */
    }
  }
}

async function launchChromium() {
  mkdirSync(env.profileDir, { recursive: true });
  clearStaleSingleton();
  chrome = spawn(env.chromium, chromiumArgs(), { env: chromiumEnv(), stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderrTail = '';
  chrome.stderr?.setEncoding('utf8');
  chrome.stderr?.on('data', (d: string) => {
    stderrTail = (stderrTail + d).slice(-4000);
  });
  chrome.on('exit', (code, signal) => {
    // "No usable sandbox" cai aqui: falhamos fechado em vez de desligar o sandbox.
    const sandboxFail = /No usable sandbox|sandbox/i.test(stderrTail) && /FATAL/.test(stderrTail);
    log('chromium saiu', { code, signal, sandboxFail });
    emit({ t: 'error', code: sandboxFail ? 'sandbox_unavailable' : 'browser_exited' });
    if (shuttingDown) {
      // Chromium fechou limpo (perfil gravado): só então derruba o Xvfb.
      xvfbProc?.kill('SIGTERM');
      process.exit(0);
    }
    process.exit(1);
  });
  cdp = new CdpPipe(chrome.stdio[3] as any, chrome.stdio[4] as any);

  cdp.on('Page.screencastFrame', (p: { data: string; sessionId: number }, sid) => {
    if (sid !== pageSession) return;
    // Confirma ao Chromium na hora (ele segue produzindo); quem dosa o envio é o controle de fluxo.
    if (client && client.readyState === client.OPEN) onFrame(Buffer.from(p.data, 'base64'));
    void cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }, pageSession).catch(() => {});
  });
  cdp.on('Page.frameNavigated', (p: { frame: { parentId?: string } }, sid) => {
    if (sid !== pageSession || p.frame.parentId) return;
    void sendPageInfo(true);
    // Navegação entre sites troca o processo de renderização e o screencast
    // para de emitir quadros: reinicia a captura no frame novo.
    scheduleScreencastRestart();
  });
  cdp.on('Page.loadEventFired', (_p, sid) => {
    if (sid !== pageSession) return;
    void sendPageInfo(false);
    scheduleScreencastRestart();
  });
  cdp.on('Page.navigatedWithinDocument', (_p, sid) => sid === pageSession && void sendPageInfo(false));
  cdp.on('Page.javascriptDialogOpening', (p: { type: string }, sid) => {
    if (sid !== pageSession) return;
    void cdp.send('Page.handleJavaScriptDialog', { accept: p.type === 'beforeunload' }, pageSession).catch(() => {});
    emit({ t: 'notice', code: 'dialog_dismissed' });
  });
  cdp.on('Page.fileChooserOpened', (_p, sid) => sid === pageSession && emit({ t: 'notice', code: 'upload_blocked' }));
  cdp.on('Browser.downloadWillBegin', () => emit({ t: 'notice', code: 'download_blocked' }));
  // Pop-ups/novas abas: fechadas (uma aba por perfil no MVP); o usuário é avisado.
  cdp.on('Target.targetCreated', (p: { targetInfo: { targetId: string; type: string; openerId?: string; url: string } }) => {
    const info = p.targetInfo;
    if (info.type === 'page' && info.openerId) {
      void cdp.send('Target.closeTarget', { targetId: info.targetId }).catch(() => {});
      emit({ t: 'notice', code: 'popup_blocked', origin: displayOrigin(info.url) });
    }
  });
  cdp.on('Target.targetDestroyed', (p: { targetId: string }) => {
    // Durante o encerramento o Browser.close fecha a aba: não recriar.
    if (p.targetId === pageTargetId && !shuttingDown) void recreatePage().catch((e) => log('falha ao recriar aba', { err: String(e?.message ?? e).slice(0, 80) }));
  });

  await cdp.send('Target.setDiscoverTargets', { discover: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  const { targetInfos } = await cdp.send<{ targetInfos: Array<{ targetId: string; type: string }> }>('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page');
  const targetId = page ? page.targetId : (await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })).targetId;
  await attachPage(targetId);
  await cdp.send('Page.navigate', { url: env.startUrl }, pageSession).catch((e) => log('navegação inicial falhou', { err: String(e.message).slice(0, 80) }));
  ready = true;
  log('chromium pronto', sandboxReport());
}

async function recreatePage() {
  pageSession = '';
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: env.startUrl });
  await attachPage(targetId);
  if (client) await startScreencast();
}

// ── Entrada ─────────────────────────────────────────────────────────────────
const BUTTON_MASK = { none: 0, left: 1, right: 2, middle: 4 } as const;
let buttonsDown = 0;

async function handleInput(msg: InputMessage) {
  if (!pageSession) return;
  switch (msg.t) {
    case 'viewport':
      viewport = { w: msg.w, h: msg.h };
      await applyViewport();
      emit({ t: 'ready', w: viewport.w, h: viewport.h });
      return;
    case 'mouse': {
      const x = clamp(msg.x, 0, viewport.w);
      const y = clamp(msg.y, 0, viewport.h);
      if (msg.a === 'down') buttonsDown |= BUTTON_MASK[msg.b];
      if (msg.a === 'up') buttonsDown &= ~BUTTON_MASK[msg.b];
      const type = msg.a === 'down' ? 'mousePressed' : msg.a === 'up' ? 'mouseReleased' : 'mouseMoved';
      await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: msg.b, buttons: buttonsDown, clickCount: msg.a === 'move' ? 0 : msg.c, modifiers: msg.m }, pageSession);
      return;
    }
    case 'wheel':
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: clamp(msg.x, 0, viewport.w), y: clamp(msg.y, 0, viewport.h), deltaX: msg.dx, deltaY: msg.dy, modifiers: msg.m }, pageSession);
      return;
    case 'key': {
      const printable = isPrintable(msg.key) && (msg.m & 0b0110) === 0; // sem Ctrl/Meta
      const text = msg.key === 'Enter' ? '\r' : printable ? msg.key : undefined;
      const type = msg.a === 'up' ? 'keyUp' : text ? 'keyDown' : 'rawKeyDown';
      await cdp.send('Input.dispatchKeyEvent', { type, key: msg.key, code: msg.code, windowsVirtualKeyCode: msg.kc, nativeVirtualKeyCode: msg.kc, modifiers: msg.m, ...(text && msg.a === 'down' ? { text, unmodifiedText: text } : {}) }, pageSession);
      return;
    }
    case 'text':
      await cdp.send('Input.insertText', { text: msg.s }, pageSession);
      return;
    case 'nav': {
      if (msg.a === 'reload') await cdp.send('Page.reload', {}, pageSession);
      else if (msg.a === 'home') await cdp.send('Page.navigate', { url: env.startUrl }, pageSession);
      else {
        const h = await cdp.send<{ currentIndex: number; entries: Array<{ id: number }> }>('Page.getNavigationHistory', {}, pageSession);
        const target = h.entries[h.currentIndex + (msg.a === 'back' ? -1 : 1)];
        if (target) await cdp.send('Page.navigateToHistoryEntry', { entryId: target.id }, pageSession);
      }
      return;
    }
  }
}

// ── Servidor (somente rede interna) ─────────────────────────────────────────
function tokenOk(header: string | undefined) {
  const got = Buffer.from((header ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(env.token);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: ready, sandbox: sandboxReport() }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 16 * 1024,
  verifyClient: ({ req }, done) => {
    const fencing = Number(req.headers['x-swn-fencing']);
    if (!tokenOk(req.headers.authorization)) return done(false, 401);
    // Fencing (S-012/S-035): conexão com lease antigo é recusada.
    if (!Number.isSafeInteger(fencing) || fencing < highestFencing) return done(false, 409);
    done(true);
  },
});

wss.on('connection', (ws, req) => {
  highestFencing = Math.max(highestFencing, Number(req.headers['x-swn-fencing']));
  if (client) client.close(4409, 'substituído');
  client = ws;
  resetFlow();
  let windowStart = Date.now();
  let count = 0;
  log('gateway conectado');
  emit({ t: 'ready', w: viewport.w, h: viewport.h });
  void startScreencast().then(() => sendPageInfo());

  ws.on('message', (data, isBinary) => {
    if (isBinary) return ws.close(4400, 'binário não aceito');
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > 240) return; // rate limit (S-032): excesso é descartado
    let parsed: InputMessage;
    try {
      parsed = InputMessage.parse(JSON.parse(String(data)));
    } catch {
      return;
    }
    if (parsed.t === 'ack') return onClientAck();
    void handleInput(parsed).catch(() => {});
  });
  ws.on('close', () => {
    if (client !== ws) return;
    client = null;
    resetFlow();
    void stopScreencast();
    log('gateway desconectado');
  });
});

// ── Ciclo de vida ───────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('encerrando', { signal });
  client?.close(4410, 'runtime encerrado');
  // Fechamento limpo grava cookies/IndexedDB no perfil antes de sair.
  // A saída do processo acontece no handler de 'exit' do Chromium.
  try {
    await cdp?.send('Browser.close', {}, undefined, 8_000);
  } catch {
    chrome?.kill('SIGTERM');
  }
  setTimeout(() => {
    log('encerramento forçado');
    chrome?.kill('SIGKILL');
    xvfbProc?.kill('SIGKILL');
    process.exit(0);
  }, 12_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Rejeição solta nunca derruba o agente no meio de um encerramento limpo.
process.on('unhandledRejection', (e) => log('rejeição não tratada', { err: String((e as Error)?.message ?? e).slice(0, 80) }));

await startXvfb();
await launchChromium();
server.listen(env.port, '0.0.0.0', () => log('agente ouvindo', { port: env.port }));
