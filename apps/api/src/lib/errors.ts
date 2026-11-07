export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'MFA_REQUIRED'
  | 'LOCKED'
  | 'STEP_UP_REQUIRED'
  | 'FORBIDDEN'
  | 'CSRF'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'URL_REJECTED'
  | 'LAST_KEY'
  | 'ENROLLMENT_CODE_INVALID'
  | 'WEBAUTHN_FAILED'
  | 'HARDWARE_KEY_REQUIRED'
  | 'RUNTIME_NOT_AVAILABLE'
  | 'RUNTIME_FAILED'
  | 'RUNTIME_QUOTA'
  | 'CONTROL_BUSY'
  | 'RATE_LIMITED'
  | 'ACCESS_DENIED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 403,
  LOCKED: 423,
  STEP_UP_REQUIRED: 403,
  FORBIDDEN: 403,
  CSRF: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  URL_REJECTED: 400,
  LAST_KEY: 409,
  ENROLLMENT_CODE_INVALID: 403,
  WEBAUTHN_FAILED: 400,
  HARDWARE_KEY_REQUIRED: 400,
  RUNTIME_NOT_AVAILABLE: 503,
  RUNTIME_FAILED: 502,
  RUNTIME_QUOTA: 429,
  CONTROL_BUSY: 409,
  RATE_LIMITED: 429,
  ACCESS_DENIED: 403,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const unauthenticated = () => new AppError('UNAUTHENTICATED', 'Sessão ausente ou expirada.');
export const notFound = () => new AppError('NOT_FOUND', 'Não encontrado.');
