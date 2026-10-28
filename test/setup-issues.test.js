import test from 'node:test';
import assert from 'node:assert/strict';
import { setupIssues } from '../packages/shared-types/setup-issues.js';

const configured = () => ({ planning: false, settings: { realmId: 42 }, auth: { status: 'connected', error: null }, connection: { status: 'offline', error: null }, codex: { available: true, authenticated: true }, voice: { available: true, status: 'ready', error: null, desktop: { running: false } } });

test('configured offline, stopped and paused companions have no setup banner', () => {
  for (const state of ['DISCONNECTED', 'PAUSED', 'ACTIVE', 'BUSY']) assert.deepEqual(setupIssues({ ...configured(), state, world: null }), []);
});

test('cached account recheck, empty initial Realm list and unknown startup services are not setup failures', () => {
  for (const status of ['disconnected', 'authenticating']) assert.deepEqual(setupIssues({ ...configured(), auth: { status, username: null }, realms: [], codex: { available: null, authenticated: null }, voice: { available: false, status: 'setup-required', error: null } }), []);
});

test('actual missing Realm configuration and confirmed authentication/service failures identify their specific issue', () => {
  assert.equal(setupIssues({ ...configured(), settings: { realmId: null } })[0].id, 'realm-selection');
  for (const status of ['expired', 'error', 'profile-required']) assert.equal(setupIssues({ ...configured(), auth: { status, error: 'Sign in again.' } })[0].id, 'minecraft-account');
  assert.equal(setupIssues({ ...configured(), codex: { authenticated: false } })[0].id, 'codex');
  assert.equal(setupIssues({ ...configured(), voice: { status: 'setup-required', available: false, error: 'Speech model missing.' } })[0].id, 'voice');
});

test('active Realm failures show, stale errors after intentional stop do not, and resolved issues disappear', () => {
  const state = configured(); state.connection = { status: 'error', error: 'Realm unavailable.' };
  assert.equal(setupIssues(state)[0].id, 'realm-connection'); state.connection.status = 'offline'; assert.deepEqual(setupIssues(state), []);
  state.connection.status = 'connected'; state.connection.error = null; assert.deepEqual(setupIssues(state), []);
});

test('intentional offline planning does not require Realm setup but still reports a real model service error', () => {
  const state = { ...configured(), planning: true, settings: { realmId: null }, auth: { status: 'expired' } };
  assert.deepEqual(setupIssues(state), []); state.codex.authenticated = false; assert.equal(setupIssues(state)[0].id, 'codex');
});
