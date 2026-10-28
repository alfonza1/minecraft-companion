import prismarineAuth from 'prismarine-auth';
import prismarineRealms from 'prismarine-realms';
import { secureCacheFactory } from './secure-cache.js';
import { inspectRealmVersion } from './realm-version.js';
import { authorizeSession } from './session-join.js';
import { accountFailure, requireJavaProfile } from './java-profile.js';
import { serializePlayerCertificates } from './player-certificates.js';

const { Authflow, Titles } = prismarineAuth;
const { RealmAPI } = prismarineRealms;

const send = value => process.send?.(value);
let session = null;
process.on('message', async message => {
  if (message.type === 'join') {
    try {
      await authorizeSession(session, message.serverIdHash);
      send({ type: 'joined', id: message.id, ok: true });
    } catch { send({ type: 'joined', id: message.id, ok: false }); }
    return;
  }
  if (!['connect', 'resolve', 'session'].includes(message.type)) return;
  try {
    const flow = new Authflow('companion-account', secureCacheFactory(message.directory), {
      flow: 'live', authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo',
    }, code => {
      if (message.type !== 'connect') throw new Error('Account sign-in required.');
      send({ type: 'device', verificationUri: code.verification_uri, userCode: code.user_code, expiresIn: code.expires_in });
    });
    const credentials = await flow.getMinecraftJavaToken({ fetchProfile: true, fetchCertificates: message.type === 'session' });
    const profile = await requireJavaProfile(credentials);
    credentials.profile = profile;
    if (message.type === 'connect') send({ type: 'profile', username: profile.name });
    const api = RealmAPI.from(flow, 'java', { minecraftVersion: '26.3' });
    // The library's Realm wrapper drops activeVersion from the service response.
    const { servers: realms } = await api.rest.get('/worlds');
    if (message.type !== 'connect') {
      const realm = realms.find(item => item.id === message.realmId);
      if (!realm) throw new Error('Realm access unavailable.');
      const address = await api.getRealmAddress(realm.id);
      const status = await inspectRealmVersion(address, realm.activeVersion);
      const keys = credentials.certificates?.profileKeys;
      if (message.type === 'session') session = credentials;
      send({ type: 'resolved', ...status,
        ...(message.type === 'session' ? { address, profile: { id: profile.id, name: profile.name }, certificates: serializePlayerCertificates(keys) } : {}) });
      if (message.type !== 'session') process.disconnect();
      return;
    }
    send({ type: 'realms', realms: realms.map(realm => ({ id: realm.id, name: realm.name, owner: realm.owner, state: realm.state, expired: realm.expired })) });
    process.disconnect();
  } catch (error) {
    // Provider exceptions may contain HTTP credentials or tokens. Send only a
    // stable diagnosis across IPC; raw auth output never reaches the dashboard.
    send({ type: 'failure', ...accountFailure(error) });
    process.disconnect();
  }
});
send({ type: 'ready' });
