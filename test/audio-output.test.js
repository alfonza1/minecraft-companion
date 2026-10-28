import test from 'node:test';
import assert from 'node:assert/strict';
import { configureAudioOutput } from '../apps/desktop-voice/audio-output.js';

test('default output needs no permission and a permitted headset is used directly', async () => {
  const calls = [], player = { setSinkId: async id => calls.push(id) };
  assert.equal((await configureAudioOutput(player, '')).notice, null);
  assert.equal((await configureAudioOutput(player, 'default')).notice, null);
  assert.deepEqual(calls, []);
  assert.equal((await configureAudioOutput(player, 'headset')).notice, null);
  assert.deepEqual(calls, ['headset']);
});

test('fixed voice previews recover from denied, missing and failed output devices with a visible default notice', async () => {
  for (const name of ['NotAllowedError', 'SecurityError', 'NotFoundError', 'AbortError']) {
    const player = { sinkId: '', setSinkId: async () => { throw new DOMException('Device unavailable', name); } };
    assert.match((await configureAudioOutput(player, 'old-id', { fallbackToDefault: true })).notice, /Preview is using the system default/);
    await assert.rejects(configureAudioOutput(player, 'old-id'), /Choose an audio output in Settings/);
  }
});

test('conversation audio never silently redirects a denied private headset selection', async () => {
  const calls = [], player = { sinkId: 'headset', setSinkId: async id => { calls.push(id); throw new DOMException('Denied', 'NotAllowedError'); } };
  await assert.rejects(configureAudioOutput(player, 'blocked-headset'), /System default/);
  assert.deepEqual(calls, ['blocked-headset']);
});

test('preview fallback resets an already selected sink and preserves unexpected or reset failures', async () => {
  const calls = [], player = { sinkId: 'headset', setSinkId: async id => { calls.push(id); if (id) throw new DOMException('Unplugged', 'NotFoundError'); } };
  assert.match((await configureAudioOutput(player, 'unplugged', { fallbackToDefault: true })).notice, /system default/);
  assert.deepEqual(calls, ['unplugged', '']);
  await assert.rejects(configureAudioOutput({ setSinkId: async () => { throw new TypeError('Unexpected failure'); } }, 'device', { fallbackToDefault: true }), /Unexpected failure/);
  await assert.rejects(configureAudioOutput({ sinkId: 'old', setSinkId: async id => { if (id) throw new DOMException('Unplugged', 'NotFoundError'); throw new Error('Reset failed'); } }, 'new', { fallbackToDefault: true }), /Reset failed/);
});

test('browsers without output selection can preview by default but do not pretend to honor a selected headset', async () => {
  assert.match((await configureAudioOutput({}, 'headset', { fallbackToDefault: true })).notice, /system default/);
  await assert.rejects(configureAudioOutput({}, 'headset'), /selected speakers/);
});
