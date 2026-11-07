import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayOrigin, InputMessage, isPrintable } from './index.js';

test('protocolo aceita só entradas conhecidas e limitadas', () => {
  assert.equal(InputMessage.parse({ t: 'mouse', a: 'down', x: 10, y: 20, b: 'left' }).t, 'mouse');
  assert.equal(InputMessage.parse({ t: 'key', a: 'down', key: 'á', code: 'KeyA', kc: 65 }).t, 'key');
  for (const bad of [
    { t: 'eval', code: 'alert(1)' },
    { t: 'cdp', method: 'Runtime.evaluate' },
    { t: 'mouse', a: 'down', x: 1, y: 1, extra: 1 },
    { t: 'viewport', w: 99999, h: 10 },
    { t: 'text', s: 'x'.repeat(201) },
    { t: 'nav', a: 'file:///etc/passwd' },
    { t: 'wheel', x: 0, y: 0, dx: Infinity, dy: 0 },
  ]) {
    assert.throws(() => InputMessage.parse(bad), JSON.stringify(bad));
  }
});

test('origem exibida nunca inclui caminho ou query', () => {
  assert.equal(displayOrigin('https://web.whatsapp.com/path?token=secreto#x'), 'https://web.whatsapp.com');
  assert.equal(displayOrigin('about:blank'), 'about');
  assert.equal(displayOrigin('lixo'), '');
});

test('teclas imprimíveis', () => {
  assert.equal(isPrintable('a'), true);
  assert.equal(isPrintable('ç'), true);
  assert.equal(isPrintable('😀'), true);
  assert.equal(isPrintable('Enter'), false);
  assert.equal(isPrintable('ArrowLeft'), false);
});
