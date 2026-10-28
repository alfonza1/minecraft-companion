import mcProtocol from 'minecraft-protocol';
import minecraftData from 'minecraft-data';
import { BRIDGE_PROTOCOLS } from '../protocol-bridge/index.js';

const STATUS_TIMEOUT_MS = 8000;

export class RealmVersionError extends Error {
  constructor() {
    super('Realm version is unavailable. The server closed or failed its status check and did not report a recognized version through Realms. Try again once the Realm is available.');
    this.code = 'REALM_VERSION_UNAVAILABLE';
  }
}

function reportedProtocol(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(version) || version.trim() !== version) return null;
  const translated = [...BRIDGE_PROTOCOLS].find(([, name]) => name === version)?.[0];
  return translated ?? minecraftData.versionsByMinecraftVersion.pc[version]?.version ?? null;
}

export async function inspectRealmVersion(address, reportedVersion, ping = mcProtocol.ping) {
  try {
    const status = await ping({ ...address, closeTimeout: STATUS_TIMEOUT_MS });
    const { protocol, name } = status?.version ?? {};
    if (!Number.isInteger(protocol) || protocol < 0 || typeof name !== 'string') throw new RealmVersionError();
    return { protocol, version: name, protocolSource: 'server-status' };
  } catch {
    // Some Realm endpoints close status connections. Only an exact version from
    // this account's authenticated Realm listing can replace that observation.
    const protocol = reportedProtocol(reportedVersion);
    if (protocol === null) throw new RealmVersionError();
    return { protocol, version: reportedVersion, protocolSource: 'realms-service' };
  }
}
