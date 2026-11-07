#!/usr/bin/env node
// Gera um .env de DESENVOLVIMENTO a partir do env.template, com segredos aleatórios.
// Nunca use este .env em produção: ele liga o login de desenvolvimento.
//
//   npm run setup               cria o .env (recusa se já existir)
//   npm run setup -- --force    sobrescreve
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, '.env');
const force = process.argv.includes('--force');

if (existsSync(target) && !force) {
  console.error('.env já existe. Use `npm run setup -- --force` para sobrescrever.');
  process.exit(1);
}

const secret = () => randomBytes(32).toString('base64');
const dbPassword = randomBytes(18).toString('hex'); // só [0-9a-f]: seguro dentro da URL

const values = {
  POSTGRES_PASSWORD: dbPassword,
  DATABASE_URL: `postgresql://subweb_app:${dbPassword}@127.0.0.1:5446/subweb`,
  TEST_DATABASE_URL: `postgresql://subweb_app:${dbPassword}@127.0.0.1:5446/subweb_test`,
  OAUTH_STATE_SECRET: secret(),
  DATA_ENCRYPTION_KEY: secret(),
  CONTROLLER_SECRET: secret(),
  // Login sem Google, só em desenvolvimento (config.ts recusa em produção).
  DEV_LOGIN_EMAIL: 'titular@exemplo.local',
  // Dispensa o código de cadastro da primeira chave, só em desenvolvimento.
  WEBAUTHN_DEV_OPEN_ENROLLMENT: 'true',
};

let env = readFileSync(path.join(root, 'env.template'), 'utf8');
for (const [key, value] of Object.entries(values)) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  env = line.test(env) ? env.replace(line, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync(target, env, { mode: 0o600 });

console.log('.env de desenvolvimento criado com segredos aleatórios.');
console.log('Próximos passos: npm run docker:up · npm run migrate:dev · npm run worker:image · npm run dev');
