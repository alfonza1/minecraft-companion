export const BUILD_PHASE_HEIGHT = 3;
export const BUILD_PHASE_PLACEMENTS = 128;
const MAX_ROUTED_LAYER = 512;
const MATERIAL_SWITCH_PENALTY = 1;
export function phasePlacements(pending, blocks) {
  const first = Math.min(...pending.map(index => blocks[index].y));
  return pending.filter(index => blocks[index].y < first + BUILD_PHASE_HEIGHT).slice(0, BUILD_PHASE_PLACEMENTS).map(index => blocks[index]);
}
export function orderPlacements(pending, blocks, position, origin) {
  const layers = new Map();
  for (const index of pending) {
    const y = blocks[index].y;
    if (!layers.has(y)) layers.set(y, []);
    layers.get(y).push(index);
  }
  const ordered = [];
  let cursor = { x: position.x - origin.x, z: position.z - origin.z }, material;
  const score = index => {
    const block = blocks[index];
    return Math.hypot(block.x - cursor.x, block.z - cursor.z) + (material && block.name !== material ? MATERIAL_SWITCH_PENALTY : 0);
  };
  for (const [, indices] of [...layers].sort(([a], [b]) => a - b)) {
    // Bound greedy routing work for very large imported schematics.
    if (indices.length > MAX_ROUTED_LAYER) {
      ordered.push(...indices); cursor = blocks[indices.at(-1)]; material = cursor.name;
      continue;
    }
    while (indices.length) {
      let nearest = 0;
      for (let i = 1; i < indices.length; i++) if (score(indices[i]) < score(indices[nearest])) nearest = i;
      const [next] = indices.splice(nearest, 1);
      ordered.push(next); cursor = blocks[next]; material = cursor.name;
    }
  }
  return ordered;
}
