import type { Tone } from '@/components/shared/ui';

export type SessionStage = 'MFA_PENDING' | 'ACTIVE' | 'LOCKED';
export type LockReason = 'manual' | 'idle' | 'absolute';

export interface SecurityPolicy {
  idleMinutes: 1 | 5 | 15 | 30;
  absoluteMinutes: 15 | 30 | 60;
  lockOnBlur: boolean;
  suspendInactiveMinutes: 5 | 15 | 30 | 60;
  allowClipboard: boolean;
  allowUpload: boolean;
  allowDownload: boolean;
  requireStepUp: true;
  updatedAt: string;
}

export interface Session {
  sessionId: string;
  stage: SessionStage;
  lockReason: LockReason | null;
  owner: { id: string; name: string; email: string; avatarUrl: string | null };
  hasSecurityKey: boolean;
  enrollment: { required: boolean; codeRequired: boolean };
  policy: SecurityPolicy;
  idleExpiresAt: string | null;
  controlExpiresAt: string | null;
  sessionExpiresAt: string;
  stepUpValidUntil: string | null;
}

export type Provider = 'whatsapp' | 'telegram' | 'instagram' | 'custom';
export type ProfileGroup = 'MENSAGENS' | 'SOCIAL' | 'PRODUTIVIDADE' | 'PESSOAL' | 'FAVORITOS';
export type ProfileStatus = 'STOPPED' | 'STARTING' | 'ONLINE' | 'SUSPENDED' | 'REAUTH_REQUIRED' | 'ERROR';

export interface Profile {
  id: string;
  title: string;
  provider: Provider;
  startUrl: string;
  host: string;
  group: ProfileGroup;
  colorToken: Tone;
  status: ProfileStatus;
  pinned: boolean;
  autoStart: boolean;
  orderIndex: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ViewerSessionRow {
  id: string;
  current: boolean;
  deviceLabel: string;
  ipMasked: string | null;
  stage: SessionStage;
  createdAt: string;
  lastSeenAt: string;
}

export interface SecurityKeyRow {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  transports: string[];
}

export interface AuditItem {
  id: string;
  eventCode: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  targetProfileId: string | null;
  ipMasked: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export const GROUP_LABELS: Record<ProfileGroup, string> = {
  MENSAGENS: 'Mensagens',
  SOCIAL: 'Social',
  PRODUTIVIDADE: 'Produtividade',
  PESSOAL: 'Pessoal',
  FAVORITOS: 'Favoritos',
};
export const GROUP_ORDER: ProfileGroup[] = ['FAVORITOS', 'MENSAGENS', 'SOCIAL', 'PRODUTIVIDADE', 'PESSOAL'];

export const STATUS_META: Record<ProfileStatus, { label: string; tone: Tone; dot: string }> = {
  STOPPED: { label: 'Parado', tone: 'slate', dot: 'bg-slate-400' },
  STARTING: { label: 'Acordando', tone: 'sky', dot: 'bg-sky-500' },
  ONLINE: { label: 'Online', tone: 'emerald', dot: 'bg-emerald-500' },
  SUSPENDED: { label: 'Suspenso', tone: 'amber', dot: 'bg-amber-500' },
  REAUTH_REQUIRED: { label: 'Reconectar', tone: 'orange', dot: 'bg-orange-500' },
  ERROR: { label: 'Erro', tone: 'rose', dot: 'bg-rose-500' },
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  whatsapp: 'WhatsApp Web',
  telegram: 'Telegram Web',
  instagram: 'Instagram',
  custom: 'Site personalizado',
};

export const AUDIT_LABELS: Record<string, string> = {
  AUTH_GOOGLE_LOGIN: 'Login com Google',
  AUTH_GOOGLE_DENIED: 'Login com Google negado',
  AUTH_MFA_SUCCESS: 'Chave de segurança validada',
  AUTH_MFA_FAILED: 'Falha na chave de segurança',
  AUTH_LOCK: 'Sessão bloqueada',
  AUTH_UNLOCK: 'Sessão desbloqueada',
  AUTH_LOGOUT: 'Saída da conta',
  AUTH_STEP_UP: 'Confirmação de identidade',
  KEY_REGISTERED: 'Chave de segurança cadastrada',
  KEY_REMOVED: 'Chave de segurança removida',
  KEY_RENAMED: 'Chave de segurança renomeada',
  PROFILE_CREATED: 'Perfil criado',
  PROFILE_UPDATED: 'Perfil alterado',
  PROFILE_DELETED: 'Perfil excluído',
  PROFILE_STOPPED: 'Perfil parado',
  POLICY_UPDATED: 'Política de segurança alterada',
  SESSION_REVOKED: 'Sessão revogada',
  SESSIONS_REVOKED_OTHERS: 'Outros dispositivos revogados',
};

export const auditLabel = (code: string) => AUDIT_LABELS[code] ?? code;
