import mineflayer from 'mineflayer';

const MOVEMENT_PACKETS = new Set(['position', 'position_look', 'look', 'flying']);

// Mineflayer 4.39 omits tick_end. 26.3 enforces one movement per client tick,
// including through ViaBackwards: https://github.com/PrismarineJS/mineflayer/issues/4189
// Preserve each movement and close its tick; do not alter coordinates or timers.
export function installMovementTickBoundary(client) {
  const write = client.write.bind(client);
  client.write = (name, packet) => {
    const result = write(name, packet);
    if (MOVEMENT_PACKETS.has(name) && !client.ended) write('tick_end', {});
    return result;
  };
}

export function createBridgeClient(bridge, serverVersion) {
  const bot = mineflayer.createBot({ host: bridge.host, port: bridge.port, username: bridge.username, auth: 'offline', version: bridge.version, hideErrors: true, logErrors: false });
  if (serverVersion === '26.3') installMovementTickBoundary(bot._client);
  bot.companionTransport = { kind: 'bridge', serverVersion, clientVersion: bridge.version, projected: true };
  return bot;
}
