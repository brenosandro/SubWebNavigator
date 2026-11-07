import crypto from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

/**
 * Autenticador WebAuthn de SOFTWARE, só para testes: gera respostas reais
 * (ES256, atestação "none") e permite simular passkey sincronizada (flags BE/BS).
 */
export class SoftAuthenticator {
  private readonly keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  readonly credentialId = crypto.randomBytes(16);
  private counter = 0;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
    private readonly synced = false,
  ) {}

  get id() {
    return this.credentialId.toString('base64url');
  }

  private flags(attested: boolean) {
    let f = 0x01 | 0x04; // UP | UV
    if (this.synced) f |= 0x08 | 0x10; // BE | BS
    if (attested) f |= 0x40; // AT
    return f;
  }

  private authData(attested: boolean): Buffer {
    const rpIdHash = crypto.createHash('sha256').update(this.rpId).digest();
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(++this.counter);
    const head = Buffer.concat([rpIdHash, Buffer.from([this.flags(attested)]), counter]);
    if (!attested) return head;
    const jwk = this.keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const cosePublicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ]),
    );
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    return Buffer.concat([head, Buffer.alloc(16), idLen, this.credentialId, Buffer.from(cosePublicKey)]);
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  register(challenge: string) {
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', this.authData(true)]]) as never);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: { clientDataJSON: this.clientData('webauthn.create', challenge).toString('base64url'), attestationObject: Buffer.from(attestationObject).toString('base64url'), transports: ['usb'] },
      clientExtensionResults: {},
      authenticatorAttachment: 'cross-platform',
    };
  }

  authenticate(challenge: string) {
    const authData = this.authData(false);
    const clientDataJSON = this.clientData('webauthn.get', challenge);
    const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientDataJSON).digest()]), this.keys.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: { clientDataJSON: clientDataJSON.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url') },
      clientExtensionResults: {},
      authenticatorAttachment: 'cross-platform',
    };
  }
}
