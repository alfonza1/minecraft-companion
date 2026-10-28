import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import nativeProtocol from '../services/native-26.3/preload.cjs';
import { RealmConnector, supportedVersionForProtocol } from '../services/realm-connector/index.js';
import { dataFor, hasValidatedNativeMaterial } from '../packages/minecraft-data/index.js';
import { validateBlueprint } from '../services/build-planner/blueprint.js';
import { calculateMaterials } from '../services/build-planner/materials.js';
import { constructionCompatibility } from '../services/build-executor/index.js';
import { NativeRealmClient } from '../services/realm-connector/native-client.js';
import { EventEmitter } from 'node:events';
import blockLoader from 'prismarine-block';

const exec = promisify(execFile);
test('native Stop rejects a socket delivered after Microsoft authentication finishes', () => {
  const client = new NativeRealmClient(false, '1.16.5', undefined, true);
  let destroyed = false, connected = false;
  const socket = new EventEmitter(); socket.destroy = () => { destroyed = true; };
  client.on('connect', () => { connected = true; });
  client.end('Stop while authentication is pending'); client.setSocket(socket);
  assert.equal(destroyed, true); assert.equal(connected, false); assert.equal(client.socket, undefined);
});

test('native authentication errors expose useful network diagnoses without provider credentials', () => {
  const client = new NativeRealmClient(false, '1.16.5', undefined, true), observed = [];
  client.on('error', error => observed.push(error));
  client.emit('error', Object.assign(new Error('Bearer private-provider-token'), { code: 'ECONNREFUSED' }));
  client.emit('error', Object.assign(new Error('accessToken=private-provider-token'), { code: 'toString' }));
  assert.match(observed[0].message, /refused/); assert.match(observed[1].message, /saved account session/);
  assert.equal(JSON.stringify(observed.map(error => error.message)).includes('private-provider-token'), false);
  client.end('Test complete'); assert.equal(client.emit('error', new Error('late provider response')), false);
});

test('native adapter establishes exact 26.3 compatibility only when the pinned installation is ready', () => {
  assert.equal(supportedVersionForProtocol(777), nativeProtocol.installed ? '26.3' : null);
  if (!nativeProtocol.installed) return;
  const connector = new RealmConnector('.');
  const result = connector.recordCompatibility(1, { version: '26.3', protocol: 777, protocolSource: 'realms-service' });
  assert.equal(result.status, 'native'); assert.equal(result.clientVersion, result.serverVersion);
  assert.equal(dataFor('26.3').version.version, 777);
  assert.equal(dataFor('26.3').itemsByName.straw_bed.stackSize, 16);
  assert.equal(dataFor('26.3').itemsByName.white_cushion.stackSize, 16);
  assert.match(result.message, /No protocol translation/);
});

test('released stack remains a fail-closed fallback when native support is disabled', async () => {
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', `
    import { supportedVersionForProtocol } from './services/realm-connector/index.js';
    import native from './services/native-26.3/preload.cjs';
    console.log(JSON.stringify({ installed: native.installed, nativeVersion: supportedVersionForProtocol(777), legacy: supportedVersionForProtocol(754) }));
  `], { cwd: new URL('../', import.meta.url), env: { ...process.env, COMPANION_NATIVE_PROTOCOL: 'off' }, windowsHide: true });
  assert.deepEqual(JSON.parse(stdout), { installed: false, nativeVersion: null, legacy: '1.16.5' });
});

test('native blueprints use 26.3 recipes while unvalidated new block metadata stays gated', () => {
  if (!nativeProtocol.installed) return;
  const blueprint = validateBlueprint({ version: '26.3', dimensions: { x: 2, y: 1, z: 1 }, provenance: 'reconstructed', uncertainties: [], blocks: [{ x: 0, y: 0, z: 0, name: 'oak_planks' }, { x: 1, y: 0, z: 0, name: 'oak_planks' }] });
  const materials = calculateMaterials(blueprint, {}, { recipes: new Map(), source: null });
  assert.equal(materials.recipeVersion, '26.3');
  assert.equal(materials.placed[0].quantity, 2);
  assert.deepEqual(materials.raw.map(({ name, quantity }) => ({ name, quantity })), [{ name: 'oak_log', quantity: 1 }]);
  assert.equal(constructionCompatibility(blueprint).supported, true);
  assert.equal(hasValidatedNativeMaterial('26.3', 'sulfur'), false);
  const experimental = validateBlueprint({ ...blueprint, dimensions: { x: 1, y: 1, z: 1 }, blocks: [{ x: 0, y: 0, z: 0, name: 'sulfur' }] });
  assert.equal(constructionCompatibility(experimental).supported, false);
  assert.ok(calculateMaterials(experimental, {}, { recipes: new Map(), source: null }).unresolved.some(message => message.includes('not fully validated')));
});

test('native material speeds map inherited item identities to real 26.3 axes', () => {
  if (!nativeProtocol.installed) return;
  const data=dataFor('26.3'),Block=blockLoader('26.3'),log=Block.fromStateId(data.blocksByName.oak_log.defaultState,0);
  assert.equal(log.digTime(null,false,false,false,[],{}),3000);
  assert.equal(log.digTime(data.itemsByName.iron_axe.id,false,false,false,[],{}),500);
  assert.ok(log.digTime(data.itemsByName.diamond_axe.id,false,false,false,[],{})<500);
});
