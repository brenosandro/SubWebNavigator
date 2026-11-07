import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

/**
 * Política de URL inicial de perfil (TH-05, S-018..S-022).
 *
 * Esta validação é a PRIMEIRA barreira, na API. Ela não substitui o bloqueio de
 * egress no worker/firewall: DNS rebinding e redirects só são contidos de fato
 * na rede do worker (fase P3/P5). Ver docs/threat-model.
 */

export class UrlRejected extends Error {}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.home.arpa', '.corp', '.private', '.test', '.invalid', '.example', '.onion'];
const BLOCKED_HOSTS = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data', 'kubernetes', 'kubernetes.default']);
const MAX_URL_LENGTH = 2048;

export type NormalizedUrl = { url: string; host: string };

/** Só unicast público é aceito; qualquer faixa especial é recusada. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
  }
  return parsed.range() === 'unicast';
}

function rejectHost(host: string): never {
  throw new UrlRejected(`O endereço "${host}" não é permitido: use um site público na internet.`);
}

/** Validação sintática (sem rede). Lança UrlRejected com mensagem em pt-BR. */
export function normalizeStartUrl(raw: string): NormalizedUrl {
  const input = raw.trim();
  if (!input) throw new UrlRejected('Informe a URL do site.');
  if (input.length > MAX_URL_LENGTH) throw new UrlRejected('URL longa demais.');

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UrlRejected('URL inválida.');
  }
  if (url.protocol !== 'https:') throw new UrlRejected('Somente endereços HTTPS são permitidos.');
  if (url.username || url.password) throw new UrlRejected('A URL não pode conter usuário ou senha.');
  if (url.port && url.port !== '443') throw new UrlRejected('Somente a porta padrão HTTPS (443) é permitida.');

  // O parser WHATWG já normaliza codificações exóticas (0x7f.1, 2130706433, etc.).
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) throw new UrlRejected('URL sem host.');
  if (ipaddr.isValid(host)) rejectHost(host); // IP literal: nunca (público ou não).
  if (BLOCKED_HOSTS.has(host)) rejectHost(host);
  if (!host.includes('.')) rejectHost(host);
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) rejectHost(host);
  if (!/^[a-z0-9.-]+$/.test(host)) throw new UrlRejected('Host com caracteres inválidos.');

  url.hash = '';
  url.hostname = host;
  return { url: url.toString(), host };
}

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolver: Resolver = async (host) => {
  const records = await dns.lookup(host, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/** Validação completa: sintaxe + todos os IPs resolvidos devem ser públicos. */
export async function validateStartUrl(raw: string, opts: { resolveDns: boolean; resolver?: Resolver } = { resolveDns: true }): Promise<NormalizedUrl> {
  const normalized = normalizeStartUrl(raw);
  if (!opts.resolveDns) return normalized;
  let addresses: string[];
  try {
    addresses = await (opts.resolver ?? defaultResolver)(normalized.host);
  } catch {
    throw new UrlRejected(`Não foi possível resolver "${normalized.host}".`);
  }
  if (addresses.length === 0) throw new UrlRejected(`Não foi possível resolver "${normalized.host}".`);
  if (!addresses.every(isPublicAddress)) rejectHost(normalized.host);
  return normalized;
}
