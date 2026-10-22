// SS 12 — Ed25519 signatures for the new exchange formats (.ssp / .ssbak). SHA-256 alone is only a checksum (report S4).
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
export function signingKeys(dir) {
  mkdirSync(dir, { recursive: true }); const f = path.join(dir, 'signing-ed25519.pem');
  if (!existsSync(f)) { const { privateKey } = generateKeyPairSync('ed25519'); writeFileSync(f, privateKey.export({ type: 'pkcs8', format: 'pem' })); try { chmodSync(f, 0o600); } catch { /* windows */ } }
  const priv = createPrivateKey(readFileSync(f)); const pub = createPublicKey(priv);
  return { priv, pub, publicPem: pub.export({ type: 'spki', format: 'pem' }), keyId: createHash('sha256').update(pub.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16) };
}
export const signBytes = (priv, buf) => sign(null, Buffer.from(buf), priv).toString('base64');
export const verifyBytes = (pubPem, buf, sig) => { try { return verify(null, Buffer.from(buf), typeof pubPem === 'string' ? createPublicKey(pubPem) : pubPem, Buffer.from(sig, 'base64')); } catch { return false; } };
