import { RealmVersionError } from './realm-version.js';
import { PlayerCertificateError } from './player-certificates.js';

const PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const FAILURES = {
  JAVA_PROFILE_REQUIRED: 'Microsoft sign-in succeeded, but Minecraft reports no Java Edition profile. Finish Java account setup and choose a Java username on Minecraft.net or in the official launcher, then check again.',
  JAVA_PROFILE_UNAVAILABLE: 'Minecraft could not verify the Java Edition profile. Your Microsoft session is saved; try checking the account again.',
};

class AccountSetupError extends Error {
  constructor(code) { super(FAILURES[code]); this.code = code; }
}

function validProfile(profile) {
  return /^[a-f0-9]{32}$/i.test(profile?.id || '') && /^[A-Za-z0-9_]{1,16}$/.test(profile?.name || '');
}

export async function requireJavaProfile(credentials, request = fetch) {
  if (validProfile(credentials?.profile)) return credentials.profile;
  if (typeof credentials?.token !== 'string' || !credentials.token) throw new AccountSetupError('JAVA_PROFILE_UNAVAILABLE');
  try {
    // Prismarine Auth suppresses profile HTTP errors. Recheck the fixed endpoint
    // so a missing profile is distinguished from a temporary service failure.
    const response = await request(PROFILE_URL, { headers: { Authorization: `Bearer ${credentials.token}` }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) throw new AccountSetupError('JAVA_PROFILE_REQUIRED');
    if (!response.ok) throw new AccountSetupError('JAVA_PROFILE_UNAVAILABLE');
    const profile = await response.json();
    if (!validProfile(profile)) throw new AccountSetupError('JAVA_PROFILE_UNAVAILABLE');
    return profile;
  } catch (error) {
    if (error instanceof AccountSetupError) throw error;
    throw new AccountSetupError('JAVA_PROFILE_UNAVAILABLE');
  }
}

export function accountFailure(error) {
  if (error instanceof AccountSetupError) return { code: error.code, error: FAILURES[error.code] };
  if (error instanceof RealmVersionError || error instanceof PlayerCertificateError) return { code: error.code, error: error.message };
  return { code: 'ACCOUNT_UNAVAILABLE', error: 'Microsoft/Minecraft sign-in or Realm listing failed. Check account ownership, Xbox permissions, network access and Realm invitation, then reconnect.' };
}
