import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import type { Resolver } from './security/url-policy.js';
import type { RuntimeBackend } from './runtime/backend.js';
import type { StreamHub } from './runtime/stream-hub.js';

/** Dependências injetadas: facilita testes sem rede e com relógio controlado. */
export type AppContext = {
  config: AppConfig;
  prisma: PrismaClient;
  now: () => Date;
  dataKey: Buffer;
  dnsResolver?: Resolver;
  /** Runtime remoto (controller + relay). Ausente = fase P3 não configurada (503 honesto). */
  runtime?: RuntimeBackend;
  streamHub: StreamHub;
  /** Para testes: substitui a troca de código do Google. */
  googleExchange?: (code: string, verifier: string) => Promise<{ sub: string; email: string; emailVerified: boolean; name: string; picture?: string; nonce?: string }>;
};
