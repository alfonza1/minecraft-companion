// The bearer token stays inside the secure account worker. Callers receive only
// success/failure, never a provider response that might contain credentials.
export async function authorizeSession(session, serverIdHash, request = fetch) {
  if (!session?.token || !/^[a-f0-9]{32}$/i.test(session.profile?.id || '') || typeof serverIdHash !== 'string' || !/^-?[0-9a-f]{1,40}$/.test(serverIdHash)) throw new Error('Invalid Minecraft session request.');
  try {
    const response = await request('https://sessionserver.mojang.com/session/minecraft/join', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
      body: JSON.stringify({ accessToken: session.token, selectedProfile: session.profile.id, serverId: serverIdHash }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error();
  } catch { throw new Error('Minecraft session authorization failed.'); }
}
