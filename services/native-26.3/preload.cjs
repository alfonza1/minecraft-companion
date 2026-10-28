const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'node_modules', '.companion-native', '26.3');
const lockBytes = fs.readFileSync(path.join(__dirname, 'dependencies.lock.json'));
const lock = JSON.parse(lockBytes);
const lockHash = createHash('sha256').update(JSON.stringify(lock)).digest('hex');
const requireProject = Module.createRequire(path.join(root, 'package.json'));
const status = { installed: false, version: lock.version, protocol: lock.protocol, lockHash, error: null };

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function load() {
  if (!fs.existsSync(path.join(directory, 'ready.json'))) return;
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'ready.json')));
  if (receipt.lockHash !== lockHash) throw new Error('Native dependency lock changed.');
  for (const [name, version] of Object.entries(lock.baseVersions)) {
    const installed = requireProject(`${name}/package.json`);
    if (installed.version !== version) throw new Error('Native base dependency changed.');
  }
  // Validate every downloaded overlay before executing any of it. Failed installs
  // retain the released stack and its translation safety restrictions.
  for (const file of lock.files) {
    if (digest(fs.readFileSync(path.join(directory, file.target))) !== (file.installedSha256 || file.sha256)) throw new Error('Native dependency integrity check failed.');
  }
  const rawData = requireProject('minecraft-data/data.js');
  const dataRoot = path.dirname(requireProject.resolve('minecraft-data'));
  const row = {};
  for (const [name, relative] of Object.entries(lock.dataPaths)) {
    if (name === 'proto') continue;
    const local = path.join(directory, 'data', relative, `${name}.json`);
    row[name] = JSON.parse(fs.readFileSync(fs.existsSync(local) ? local : path.join(dataRoot, 'minecraft-data/data', relative, `${name}.json`)));
  }
  for (const item of row.items) {
    if (lock.itemStackSizeCorrections[item.name]) item.stackSize = lock.itemStackSizeCorrections[item.name];
  }
  // The inherited material-speed table uses 26.2 item IDs. Native packet IDs
  // are correct, but using those old IDs makes every real axe look barehanded.
  const sourceItems = JSON.parse(fs.readFileSync(path.join(directory, 'data/pc', lock.materialsItemVersion, 'items.json')));
  const sourceNames = new Map(sourceItems.map(item => [item.id, item.name]));
  const nativeIds = new Map(row.items.map(item => [item.name, item.id]));
  row.materials = Object.fromEntries(Object.entries(row.materials).map(([material, tools]) => [material,
    Object.fromEntries(Object.entries(tools).map(([id, speed]) => {
      const nativeId = nativeIds.get(sourceNames.get(Number(id)));
      if (!Number.isInteger(nativeId)) throw new Error('Unknown native material tool mapping.');
      return [nativeId, speed];
    })),
  ]));
  rawData.pc[lock.version] = row;
  const features = requireProject('minecraft-data/minecraft-data/data/pc/common/features.json');
  const additions = JSON.parse(fs.readFileSync(path.join(directory, 'data/pc/common/features.json')));
  for (const feature of additions) {
    const index = features.findIndex(existing => existing.name === feature.name);
    if (index < 0) features.push(feature); else features[index] = feature;
  }
  for (const name of ['minecraft-protocol', 'prismarine-chunk', 'prismarine-physics', 'mineflayer']) {
    const original = requireProject(name);
    const exports = require(path.join(directory, name));
    if (name === 'minecraft-protocol' && !exports.supportedVersions.includes(lock.version)) exports.supportedVersions.push(lock.version);
    const id = requireProject.resolve(name);
    require.cache[id].exports = typeof original === 'object' && typeof exports === 'object' ? Object.assign(original, exports) : exports;
  }
  status.installed = true;
}
try { if (process.env.COMPANION_NATIVE_PROTOCOL !== 'off') load(); }
catch { status.error = 'Native 26.3 dependencies are missing, stale or damaged. Run npm run setup:native, then restart Minecraft Companion.'; }
module.exports = Object.freeze(status);
