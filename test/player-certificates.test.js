import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { serializePlayerCertificates, PlayerCertificateError } from '../services/realm-connector/player-certificates.js';
import { accountFailure } from '../services/realm-connector/java-profile.js';

const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicDER = keyPair.publicKey.export({ type: 'spki', format: 'der' });
const privateDER = keyPair.privateKey.export({ type: 'pkcs8', format: 'der' });
const valid = () => ({ publicDER, privateDER, signatureV2: randomBytes(512), expiresOn: new Date(Date.now() + 3600000) });

test('canonical player certificates remove the trailing PEM footer bytes rejected by Java 25', () => {
  const keys = valid();
  // prismarine-auth 3.1.1's per-line PEM decoder includes the footer when the
  // provider ends PEM with a newline; Node/OpenSSL accepts the trailing bytes.
  keys.publicDER = Buffer.concat([publicDER, Buffer.from('-----END RSA PUBLIC KEY-----', 'base64')]);
  keys.privateDER = Buffer.concat([privateDER, Buffer.from('-----END RSA PRIVATE KEY-----', 'base64')]);
  assert.ok(keys.publicDER.length > publicDER.length);
  const serialized = serializePlayerCertificates(keys);
  assert.deepEqual(Buffer.from(serialized.publicDER, 'base64'), publicDER);
  assert.deepEqual(Buffer.from(serialized.privateDER, 'base64'), privateDER);
  assert.deepEqual(Buffer.from(serialized.signatureV2, 'base64'), keys.signatureV2);
  assert.equal(serialized.expiresOn, keys.expiresOn.toISOString());
});

test('expired, mismatched and malformed player certificates fail without exposing key data', () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const keys of [null, { ...valid(), expiresOn: new Date(0) }, { ...valid(), signatureV2: Buffer.alloc(0) }, { ...valid(), publicDER: Buffer.from('private provider details') }, { ...valid(), privateDER: other.privateKey.export({ type: 'pkcs8', format: 'der' }) }]) {
    assert.throws(() => serializePlayerCertificates(keys), error => {
      assert.ok(error instanceof PlayerCertificateError);
      const failure = accountFailure(error);
      assert.equal(failure.code, 'JAVA_CERTIFICATES_UNAVAILABLE');
      assert.equal(failure.error.includes('private provider details'), false);
      return true;
    });
  }
});
