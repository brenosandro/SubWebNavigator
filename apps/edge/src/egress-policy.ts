import ipaddr from 'ipaddr.js';

/**
 * Política de saída do worker (TH-05, TH-20, S-018..S-021).
 * Mesma regra da API (apps/api/src/security/url-policy.ts) — duplicada de
 * propósito: o proxy roda em outro container e não depende da API.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
  }
  return parsed.range() === 'unicast';
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.corp', '.private', '.onion'];
export const ALLOWED_PORTS = new Set([443]);

export type Decision = { allow: true; host: string; port: number } | { allow: false; reason: string };

/** Valida o alvo de um CONNECT ("host:porta") antes de qualquer DNS. */
export function parseConnectTarget(target: string): Decision {
  const m = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(target.trim());
  if (!m) return { allow: false, reason: 'alvo inválido' };
  const host = m[1]!.toLowerCase().replace(/\.$/, '');
  const port = Number(m[2]);
  if (!ALLOWED_PORTS.has(port)) return { allow: false, reason: 'porta' };
  if (ipaddr.isValid(host)) return isPublicAddress(host) ? { allow: true, host, port } : { allow: false, reason: 'ip privado' };
  if (host === 'localhost' || !host.includes('.')) return { allow: false, reason: 'host interno' };
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { allow: false, reason: 'host interno' };
  if (!/^[a-z0-9.-]+$/.test(host)) return { allow: false, reason: 'host inválido' };
  return { allow: true, host, port };
}
