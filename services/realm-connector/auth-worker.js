import { Authflow, Titles } from 'prismarine-auth';
import { RealmAPI } from 'prismarine-realms';
import { secureCacheFactory } from './secure-cache.js';
import mcProtocol from 'minecraft-protocol';

const send = value => process.send?.(value);
process.on('message', async message => {
  if (!['connect', 'resolve'].includes(message.type)) return;
  try {
    const flow = new Authflow('companion-account', secureCacheFactory(message.directory), {
      flow: 'live', authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo',
    }, code => {
      if (message.type === 'resolve') throw new Error('Account sign-in required.');
      send({ type: 'device', verificationUri: code.verification_uri, userCode: code.user_code, expiresIn: code.expires_in });
    });
    const { profile } = await flow.getMinecraftJavaToken({ fetchProfile: true });
    if (!profile?.name) throw new Error('This Microsoft account does not have a Minecraft Java profile.');
    if (message.type === 'connect') send({ type: 'profile', username: profile.name });
    const realms = await RealmAPI.from(flow, 'java').getRealms();
    if (message.type === 'resolve') {
      const realm = realms.find(item => item.id === message.realmId);
      if (!realm) throw new Error('Realm access unavailable.');
      const address = await realm.getAddress();
      const status = await new Promise((resolve, reject) => mcProtocol.ping({ ...address, closeTimeout: 8000 }, (error, result) => error ? reject(error) : resolve(result)));
      send({ type: 'resolved', protocol: status.version?.protocol, version: status.version?.name });
      process.disconnect(); return;
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
