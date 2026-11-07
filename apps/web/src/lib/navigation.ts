/** Aceita só caminho interno do app (evita open redirect: `//host`, `https:`, `/\host`). */
export function safeReturnTo(value: string | null | undefined, fallback = '/app'): string {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (!value.startsWith('/app')) return fallback;
  return value;
}
