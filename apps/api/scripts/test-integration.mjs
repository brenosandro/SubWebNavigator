// Aplica as migrations no banco de TESTE e roda a suíte de integração.
// Nunca aponta para o banco de desenvolvimento/produção: exige TEST_DATABASE_URL.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL não definido (veja env.template).');
  process.exit(1);
}
if (url === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL não pode ser igual a DATABASE_URL: a suíte apaga os dados.');
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: url };
const prisma = path.join(root, 'node_modules', 'prisma', 'build', 'index.js');
execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], { stdio: 'inherit', env, cwd: path.resolve(import.meta.dirname, '..') });
execFileSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'src/integration.test.ts', 'src/stream.integration.test.ts'], { stdio: 'inherit', env, cwd: path.resolve(import.meta.dirname, '..') });
