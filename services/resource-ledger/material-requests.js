import { acquisitionAdvice } from './acquisition.js';

export function requestMaterial({ store, project, teammate, item, count, reason, available = 0 }) {
  const advice = acquisitionAdvice(item);
  const id = `${project.id}:${project.revision}:${item}`;
  const previous = store.get('materialRequests').find(value => value.id === id);
  const request = { id, projectId: project.id, revision: project.revision, item, count, targetStock:available+count, reason: reason || advice.reason, status: 'requested', at: new Date().toISOString(), realmId: project.construction?.realmId, dimension: project.construction?.dimension };
  store.put('materialRequests', request);
  const message = `Could you grab ${count} ${item.replaceAll('_', ' ')} for ${project.name || 'the build'}? ${request.reason} You can also tell me “find ${item.replaceAll('_', ' ')}” and I’ll check safe nearby terrain.`;
  if (!previous || previous.status !== 'requested') teammate?.notice?.(message, 'blocked', id);
  const error = new Error(message); error.code = 'MATERIAL_HELP_NEEDED'; return error;
}

export function resolveMaterialRequest(store, project, item, available) {
  const id = `${project.id}:${project.revision}:${item}`;
  const previous = store.get('materialRequests').find(value => value.id === id);
  if (previous?.status === 'requested' && available >= (previous.targetStock ?? previous.count)) store.put('materialRequests', { ...previous, status: 'supplied', resolvedAt: new Date().toISOString() });
}
