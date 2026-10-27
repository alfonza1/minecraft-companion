export function splitAssignments(materials, aiPercent = 50, previous = []) {
  if (!Number.isFinite(aiPercent) || aiPercent < 0 || aiPercent > 100) throw new Error('AI percentage must be between 0 and 100.');
  return materials.map(({ name, quantity }) => {
    const old = previous.find((assignment) => assignment.material === name);
    const aiRequired = Math.floor(quantity * aiPercent / 100);
    return { material: name, total: quantity, aiRequired, userRequired: quantity - aiRequired, aiProgress: old?.aiProgress ?? 0, userProgress: old?.userProgress ?? 0, aiObservedAt: old?.aiObservedAt ?? null, userObservedAt: old?.userObservedAt ?? null, aiProvenance: old?.aiProvenance ?? 'unknown', userProvenance: 'manual' };
  });
}

export function updateUserProgress(assignments, material, quantity, now = new Date().toISOString()) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10_000_000) throw new Error('Quantity must be a non-negative integer below ten million.');
  if (!assignments.some((a) => a.material === material)) throw new Error('Material is not part of this project.');
  return assignments.map((a) => a.material === material ? { ...a, userProgress: quantity, userObservedAt: now, userProvenance: 'manual' } : a);
}

export function inventoryCounts(inventory = []) {
  const result = {};
  for (const item of inventory) if (item?.name && Number.isSafeInteger(item.count) && item.count > 0) result[item.name] = (result[item.name] ?? 0) + item.count;
  return result;
}

export function reconcileAssignments(assignments, inventory, observedAt) {
  if (!observedAt) return assignments.map((a) => ({ ...a, aiProvenance: a.aiObservedAt ? 'last-observed-inventory' : 'unknown' }));
  const counts = inventoryCounts(inventory);
  return assignments.map((a) => ({ ...a, aiProgress: counts[a.material] ?? 0, aiObservedAt: observedAt, aiProvenance: 'live-inventory' }));
}

export function reconcileProjectInventory(projects, inventory, observedAt) {
  if (!observedAt) return projects.map((project) => ({ ...project, assignments: reconcileAssignments(project.assignments, inventory, null) }));
  const stock = inventoryCounts(inventory);
  const available = { ...stock };
  const ordered = [...projects].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id.localeCompare(b.id));
  const allocated = new Map();
  for (const project of ordered) {
    const assignments = project.assignments.map((assignment) => {
      const needed = project.status === 'complete' ? 0 : Math.max(0, Math.min(assignment.aiRequired, assignment.total - assignment.userProgress));
      const quantity = Math.min(available[assignment.material] ?? 0, needed);
      available[assignment.material] = (available[assignment.material] ?? 0) - quantity;
      return { ...assignment, aiProgress: quantity, aiInventoryTotal: stock[assignment.material] ?? 0, aiObservedAt: observedAt, aiProvenance: 'live-inventory-allocation' };
    });
    allocated.set(project.id, { ...project, assignments });
  }
  return projects.map((project) => allocated.get(project.id));
}

export function reserveMaterials(projects, projectId, required, inventory) {
  const counts = inventoryCounts(inventory);
  const reserved = {};
  for (const p of projects) {
    if (p.id === projectId) continue;
    for (const [name, quantity] of Object.entries(p.reservations ?? {})) reserved[name] = (reserved[name] ?? 0) + quantity;
  }
  const result = {};
  for (const { name, quantity } of required) {
    const available = Math.max(0, (counts[name] ?? 0) - (reserved[name] ?? 0));
    if (available < quantity) throw new Error(`${name}: need ${quantity}, available ${available} after other project reservations.`);
    result[name] = quantity;
  }
  return result;
}

export function assignmentNeeds(assignment) {
  const remainingTotal = Math.max(0, assignment.total - assignment.userProgress - assignment.aiProgress);
  return Math.min(remainingTotal, Math.max(0, assignment.aiRequired - assignment.aiProgress));
}
