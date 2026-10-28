import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRealmVersion, RealmVersionError } from '../services/realm-connector/realm-version.js';
import { accountFailure } from '../services/realm-connector/java-profile.js';

const address = { host: '127.0.0.1', port: 25565 };
const closedPing = async () => { throw new Error('Connection closed before the server sent a status response'); };

test('a live status response takes precedence over a saved Realm version', async () => {
  const result = await inspectRealmVersion(address, '26.3', async options => {
    assert.equal(options.host, address.host);
    assert.equal(options.closeTimeout, 8000);
    return { version: { protocol: 769, name: '1.21.4' } };
  });
  assert.deepEqual(result, { protocol: 769, version: '1.21.4', protocolSource: 'server-status' });
});

test('a closed Realm status endpoint can use an authenticated exact version report', async () => {
  assert.deepEqual(await inspectRealmVersion(address, '26.3', closedPing), {
    protocol: 777, version: '26.3', protocolSource: 'realms-service',
  });
  const native = await inspectRealmVersion(address, '1.21.4', closedPing);
  assert.equal(native.protocol, 769);
  assert.equal(native.protocolSource, 'realms-service');
});

test('missing, unknown and partial reports never guess a Realm protocol', async () => {
  for (const reported of [null, undefined, '', '26', '26.3 latest', '26.3\n', '999.9', {}, ['26.3']]) {
    await assert.rejects(inspectRealmVersion(address, reported, closedPing), RealmVersionError);
  }
});

test('a malformed status response cannot establish protocol compatibility', async () => {
  for (const version of [null, { protocol: '777', name: '26.3' }, { protocol: -1, name: '26.3' }]) {
    await assert.rejects(inspectRealmVersion(address, null, async () => ({ version })), RealmVersionError);
  }
});

test('a status failure stays distinct from account authentication and hides provider details', async () => {
  let failure;
  try { await inspectRealmVersion(address, null, async () => { throw new Error('private provider response'); }); }
  catch (error) { failure = accountFailure(error); }
  assert.equal(failure.code, 'REALM_VERSION_UNAVAILABLE');
  assert.match(failure.error, /version.*unavailable/i);
  assert.equal(failure.error.includes('private provider response'), false);
});
