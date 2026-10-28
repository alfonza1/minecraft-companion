import prismarineAuth from 'prismarine-auth';
import prismarineRealms from 'prismarine-realms';
import { secureCacheFactory } from './secure-cache.js';
import mcProtocol from 'minecraft-protocol';
import { authorizeSession } from './session-join.js';

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
    const { profile } = credentials;
    if (!profile?.name) throw new Error('This Microsoft account does not have a Minecraft Java profile.');
    if (message.type === 'connect') send({ type: 'profile', username: profile.name });
    const realms = await RealmAPI.from(flow, 'java', { minecraftVersion: '26.3' }).getRealms();
    if (message.type !== 'connect') {
      const realm = realms.find(item => item.id === message.realmId);
      if (!realm) throw new Error('Realm access unavailable.');
      const address = await realm.getAddress();
      const status = await new Promise((resolve, reject) => mcProtocol.ping({ ...address, closeTimeout: 8000 }, (error, result) => error ? reject(error) : resolve(result)));
      const keys = credentials.certificates?.profileKeys;
      if (message.type === 'session') session = credentials;
      send({ type: 'resolved', protocol: status.version?.protocol, version: status.version?.name,
        ...(message.type === 'session' ? { address, profile: { id: profile.id, name: profile.name }, certificates: keys ? {
          publicDER: keys.publicDER.toString('base64'), privateDER: keys.privateDER.toString('base64'), signatureV2: keys.signatureV2.toString('base64'), expiresOn: keys.expiresOn.toISOString(),
        } : null } : {}) });
      if (message.type !== 'session') process.disconnect();
      return;
    }
    send({ type: 'realms', realms: realms.map(realm => ({ id: realm.id, name: realm.name, owner: realm.owner, state: realm.state, expired: realm.expired })) });
    process.disconnect();
  } catch {
    // Provider exceptions may contain HTTP credentials or tokens. Send only a
    // stable diagnosis across IPC; raw auth output never reaches the dashboard.
    send({ type: 'failure', error: 'Microsoft/Minecraft sign-in or Realm listing failed. Check account ownership, Xbox permissions, network access and Realm invitation, then reconnect.' });
    process.disconnect();
  }
});
send({ type: 'ready' });
