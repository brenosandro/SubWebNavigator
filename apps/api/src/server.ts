import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createControllerBackend } from './runtime/backend.js';
import { StreamHub } from './runtime/stream-hub.js';

const config = loadConfig();
const prisma = new PrismaClient();
const runtime = config.CONTROLLER_URL ? createControllerBackend({ controllerUrl: config.CONTROLLER_URL, secret: config.CONTROLLER_SECRET!, relayUrl: config.RELAY_URL }) : undefined;
const app = await buildApp({ config, prisma, now: () => new Date(), dataKey: Buffer.from(config.DATA_ENCRYPTION_KEY, 'base64'), runtime, streamHub: new StreamHub() });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'encerrando');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
