import test from 'node:test';
import assert from 'node:assert/strict';
import { requireJavaProfile, accountFailure } from '../services/realm-connector/java-profile.js';

const credentials = { token: 'fixture-secret-never-log', profile: {} };
const profile = { id: 'a'.repeat(32), name: 'FixtureBot' };

test('verified Java profile avoids an extra request and missing profile is explicitly rechecked', async () => {
  assert.equal(await requireJavaProfile({ ...credentials, profile }, () => assert.fail('Unexpected profile request.')), profile);
  const result = await requireJavaProfile(credentials, async (url, options) => {
    assert.equal(url, 'https://api.minecraftservices.com/minecraft/profile');
    assert.equal(options.headers.Authorization, `Bearer ${credentials.token}`);
    assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    return { status: 200, ok: true, json: async () => profile };
  });
  assert.deepEqual(result, profile);
});

test('profile 404 requests Java setup while temporary failures never claim the profile is absent', async () => {
  await assert.rejects(requireJavaProfile(credentials, async () => ({ status: 404, ok: false })), error => {
    const failure = accountFailure(error);
    assert.equal(failure.code, 'JAVA_PROFILE_REQUIRED'); assert.match(failure.error, /choose a Java username/);
    assert.equal(failure.error.includes(credentials.token), false); return true;
  });
  for (const response of [{ status: 503, ok: false }, { status: 401, ok: false }, { status: 200, ok: true, json: async () => ({}) }]) {
    await assert.rejects(requireJavaProfile(credentials, async () => response), error => accountFailure(error).code === 'JAVA_PROFILE_UNAVAILABLE');
  }
});

test('provider exceptions and forged issue codes cannot expose credentials through account diagnostics', async () => {
  await assert.rejects(requireJavaProfile(credentials, async () => { throw new Error(credentials.token); }), error => {
    assert.equal(accountFailure(error).code, 'JAVA_PROFILE_UNAVAILABLE'); assert.equal(error.message.includes(credentials.token), false); return true;
  });
  assert.equal(accountFailure(Object.assign(new Error(credentials.token), { code: 'JAVA_PROFILE_REQUIRED' })).code, 'ACCOUNT_UNAVAILABLE');
  assert.equal(accountFailure(new Error(credentials.token)).error.includes(credentials.token), false);
});
