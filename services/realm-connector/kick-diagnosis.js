const CERTIFICATE_REJECTED = 'Minecraft rejected the player public-key packet. Stop and reconnect after updating the companion; automatic retries are disabled.';

export function diagnoseKick(reason) {
  let text = '';
  try { text = typeof reason === 'string' ? reason.slice(0, 16000) : JSON.stringify(reason).slice(0, 16000); } catch { }
  if (/serverbound\/minecraft:chat_session_update/.test(text)) return { code: 'PLAYER_CERTIFICATE_REJECTED', message: CERTIFICATE_REJECTED };
  if (/multiplayer\.disconnect\.invalid_player_movement/.test(text)) return { code: 'MOVEMENT_PROTOCOL_REJECTED', message: 'Minecraft rejected the movement protocol. Gameplay stopped; update the connection adapter before retrying.' };
  if (/multiplayer\.disconnect\.(?:unverified_username|invalid_public_key_signature|missing_public_key)/.test(text)) return { code: 'MINECRAFT_SESSION_REJECTED', message: 'Minecraft rejected the saved player session. Reconnect the account before trying again.' };
  if (/multiplayer\.disconnect\.duplicate_login/.test(text)) return { code: 'ACCOUNT_ALREADY_PLAYING', message: 'This Minecraft account joined elsewhere. Use the separate bot account for the companion.' };
  return { code: 'REALM_KICKED', message: 'The Realm kicked the companion. Check account permissions, session and version before trying again.' };
}
