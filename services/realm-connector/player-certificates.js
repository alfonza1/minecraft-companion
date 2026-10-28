import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';

const MAX_CERTIFICATE_BYTES = 16384;
const MAX_SIGNATURE_BYTES = 4096;

export class PlayerCertificateError extends Error {
  constructor() {
    super('Minecraft player certificates could not be prepared. Your saved Microsoft session is preserved; reconnect the account and try again.');
    this.code = 'JAVA_CERTIFICATES_UNAVAILABLE';
  }
}

export function serializePlayerCertificates(keys) {
  try {
    for (const field of ['publicDER', 'privateDER', 'signatureV2']) {
      if (!Buffer.isBuffer(keys?.[field]) || !keys[field].length || keys[field].length > MAX_CERTIFICATE_BYTES) throw new PlayerCertificateError();
    }
    const expiry = new Date(keys.expiresOn);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now() || keys.signatureV2.length > MAX_SIGNATURE_BYTES) throw new PlayerCertificateError();
    const publicKey = createPublicKey({ key: keys.publicDER, format: 'der', type: 'spki' });
    const privateKey = createPrivateKey({ key: keys.privateDER, format: 'der', type: 'pkcs8' });
    if (publicKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyType !== 'rsa') throw new PlayerCertificateError();
    // Export the parsed keys: prismarine-auth's PEM decoder can leave footer
    // bytes that OpenSSL tolerates but Java 25's DER reader rejects.
    const publicDER = publicKey.export({ type: 'spki', format: 'der' });
    const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    if (derived.length !== publicDER.length || !timingSafeEqual(derived, publicDER)) throw new PlayerCertificateError();
    return { publicDER: publicDER.toString('base64'), privateDER: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signatureV2: keys.signatureV2.toString('base64'), expiresOn: expiry.toISOString() };
  } catch { throw new PlayerCertificateError(); }
}
