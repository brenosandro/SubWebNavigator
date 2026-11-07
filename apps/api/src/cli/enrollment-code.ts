/**
 * Gera o código de uso único para cadastrar a PRIMEIRA chave de segurança.
 * Roda no servidor (shell/SSH), nunca por HTTP: quem tem só a conta Google não
 * consegue cadastrar uma chave própria sem acesso ao host.
 *
 *   npm run owner:enrollment-code            (válido por 15 minutos)
 *   npm run owner:enrollment-code -- 30      (minutos, máx. 60)
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sha256 } from '../lib/crypto.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const minutes = Math.min(Math.max(Number(process.argv[2]) || 15, 1), 60);

function generate(): string {
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

const prisma = new PrismaClient();
try {
  // Invalida códigos pendentes: só um válido por vez.
  await prisma.enrollmentCode.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date() } });
  const code = generate();
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await prisma.enrollmentCode.create({ data: { codeHash: sha256(code.replace(/-/g, '')), expiresAt } });
  console.log(`\nCódigo de cadastro da chave de segurança: ${code}`);
  console.log(`Válido até ${expiresAt.toLocaleString('pt-BR')} (uso único).\n`);
} finally {
  await prisma.$disconnect();
}
