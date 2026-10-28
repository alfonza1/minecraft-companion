export function uniqueTreeLogs(bot, root, count) {
  const pending = [root], visited = new Set([root.position.toString()]), found = [];
  while (pending.length && found.length < count) {
    const block = pending.shift(); found.push(block);
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const position = block.position.offset(x, y, z);
      if (position.distanceTo(root.position) > 8 || visited.has(position.toString())) continue;
      const neighbor = bot.blockAt(position);
      if (neighbor?.name === root.name) { visited.add(position.toString()); pending.push(neighbor); }
    }
  }
  return found.sort((a, b) => a.position.y - b.position.y || a.position.distanceTo(root.position) - b.position.distanceTo(root.position));
}
