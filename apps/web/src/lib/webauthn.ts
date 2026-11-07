import {
  startAuthentication,
  startRegistration,
  WebAuthnError,
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import api, { apiErrorCode } from './api';
import { useSessionStore } from '@/store/sessionStore';
import type { Session } from './types';

export type KeyPurpose = 'login' | 'unlock' | 'step-up';

/** Erro com código, para a UI decidir o que mostrar. */
export class KeyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function mapBrowserError(err: unknown): Error {
  const cause = (err as { cause?: { name?: string } } | null)?.cause;
  const name = err instanceof WebAuthnError ? cause?.name ?? err.name : (err as Error | null)?.name;
  const code = err instanceof WebAuthnError ? err.code : undefined;
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') {
    return new KeyError('KEY_ALREADY_REGISTERED', 'Esta chave já está cadastrada.');
  }
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
    return new KeyError('KEY_CANCELLED', 'Operação cancelada ou tempo esgotado.');
  }
  if (name === 'SecurityError' || code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID') {
    return new KeyError('KEY_DOMAIN', 'O domínio desta página não confere com a configuração da chave de segurança.');
  }
  if (name === 'NotSupportedError') {
    return new KeyError('KEY_UNSUPPORTED', 'Esta chave não suporta os algoritmos exigidos.');
  }
  return err instanceof Error ? err : new Error('Falha na chave de segurança.');
}

function ensureSupport() {
  if (!browserSupportsWebAuthn()) {
    throw new KeyError('KEY_UNSUPPORTED', 'Este navegador não suporta chaves de segurança (WebAuthn).');
  }
}

/** Cadastra uma chave física. Primeiro cadastro (com código) ou chave adicional (com step-up recente). */
export async function registerSecurityKey({ enrollmentCode, label }: { enrollmentCode?: string; label?: string }): Promise<Session> {
  ensureSupport();
  const { data: optionsJSON } = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    '/auth/webauthn/register/options',
    enrollmentCode ? { enrollmentCode } : {},
    { skipAuthRedirect: true },
  );
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    throw mapBrowserError(err);
  }
  const { data } = await api.post<{ session: Session }>('/auth/webauthn/register/verify', { response, label }, { skipAuthRedirect: true });
  useSessionStore.getState().setSession(data.session);
  return data.session;
}

/** Autentica com a chave: login (2º fator), desbloqueio ou confirmação (step-up). */
export async function authenticateWithKey(purpose: KeyPurpose): Promise<Session> {
  ensureSupport();
  const { data: optionsJSON } = await api.post<PublicKeyCredentialRequestOptionsJSON>('/auth/webauthn/authenticate/options', { purpose }, { skipAuthRedirect: true });
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    throw mapBrowserError(err);
  }
  const { data } = await api.post<{ session: Session }>('/auth/webauthn/authenticate/verify', { response }, { skipAuthRedirect: true });
  const store = useSessionStore.getState();
  store.setSession(data.session);
  store.force(null);
  return data.session;
}

/**
 * Executa uma ação sensível. Se o servidor pedir confirmação recente
 * (STEP_UP_REQUIRED), toca a chave e tenta de novo — uma única vez.
 */
export async function withStepUp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (apiErrorCode(err) !== 'STEP_UP_REQUIRED') throw err;
    await authenticateWithKey('step-up');
    return fn();
  }
}
