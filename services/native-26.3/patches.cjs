function replaceOnce(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error('Pinned native patch context changed.');
  return source.replace(before, after);
}

module.exports = function applyNativePatch(file, bytes) {
  if (!file.patch) return bytes;
  if (file.patch !== 'queue-teleport-replies') throw new Error('Unknown native patch.');
  let source = bytes.toString('utf8');
  source = replaceOnce(source, '  let shouldUsePhysics = false', '  let pendingTeleportReply = null\n  let shouldUsePhysics = false');
  source = replaceOnce(source, '    if (shouldUsePhysics) {\n      updatePosition(now)\n    }', `    if (shouldUsePhysics) {
      if (pendingTeleportReply) {
        const reply = pendingTeleportReply
        pendingTeleportReply = null
        sendPacketPositionAndLook(reply.position, reply.yaw, reply.pitch, reply.onGround)
      } else updatePosition(now)
    }`);
  source = replaceOnce(source, '  // player position and look (clientbound)', `  // 26.3 permits one position-bearing reply per client tick. Corrections
  // arrive between ticks; queue their reply instead of emitting a second move.
  function queueForcedPosition (position, yaw, pitch, onGround) {
    if (bot.version === '26.3') pendingTeleportReply = { position: position.clone(), yaw, pitch, onGround }
    else sendPacketPositionAndLook(position, yaw, pitch, onGround)
  }

  // player position and look (clientbound)`);
  source = replaceOnce(source, '        sendPacketPositionAndLook(delayedPos, delayedYaw, delayedPitch, delayedOnGround)', '        queueForcedPosition(delayedPos, delayedYaw, delayedPitch, delayedOnGround)');
  source = replaceOnce(source, '    sendPacketPositionAndLook(pos, newYaw, newPitch, bot.entity.onGround)', '    queueForcedPosition(pos, newYaw, newPitch, bot.entity.onGround)');
  return Buffer.from(source);
};
