export const HOME_STORAGE_RADIUS = 32;
const validPosition = p => p && ['x','y','z'].every(axis=>Number.isFinite(p[axis])) && Math.abs(p.x)<=30000000 && Math.abs(p.z)<=30000000 && p.y>=-64 && p.y<=320;
const dimensionName = value => typeof value==='string'?value.replace(/^minecraft:/,''):null;

export function recordServerSpawn(store, realmId, packet, currentDimension) {
  const position=packet.globalPos?.location??packet.location;
  const dimension=dimensionName(packet.globalPos?.dimension??currentDimension);
  if(!validPosition(position)||!['x','y','z'].every(axis=>Number.isSafeInteger(position[axis]))||!dimension||!Number.isSafeInteger(realmId))return;
  store.put('spawnPoints',{id:`${realmId}:${dimension}`,realmId,dimension,position:{x:position.x,y:position.y,z:position.z},provenance:'server-reported',observedAt:new Date().toISOString()});
}

export function storageAnchor(service) {
  const realmId=service.store.settings().realmId,dimension=service.runtime.bot?.game?.dimension;
  if(!dimension)return null;
  if(service.runtime.connection?.realmId!=null&&service.runtime.connection.realmId!==realmId)return null;
  const locations=service.store.get('locations').filter(place=>place.realmId===realmId&&/^(home|base)$/i.test(place.name));
  const home=locations.find(place=>/^home$/i.test(place.name))??locations[0];
  // A home in another dimension requires returning there, never quietly
  // depositing at an unrelated Overworld chest instead.
  if(home)return home.dimension===dimension&&validPosition(home.position)?{...home,position:Object.fromEntries(['x','y','z'].map(axis=>[axis,Math.floor(home.position[axis])])),kind:'home'}:null;
  const spawn=service.store.get('spawnPoints').find(place=>place.realmId===realmId&&place.dimension===dimension&&place.provenance==='server-reported'&&validPosition(place.position));
  return spawn?{...spawn,kind:'spawn'}:null;
}
