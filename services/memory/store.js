import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const dataDirectory = process.env.COMPANION_DATA_DIR || join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'MinecraftCompanion');
export const defaults = {
  realmId: null, playerName: '', autonomy: 'instructions', combat: 'retreat', followDistance: 3, miningZone: null,
  alertFrequency: 'normal', model: '', maxRequestsPerHour: 30, maxInputTokens: 100_000,
  voice: { enabled: false, handsFree: false, speed: 1, volume: 0.8, inputDevice: '', outputDevice: '' },
};

export class Store {
  constructor(directory = dataDirectory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, 'companion.sqlite');
    this.db = new DatabaseSync(this.path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS documents (collection TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(collection,id));');
  }
  get(collection) {
    return this.db.prepare('SELECT json FROM documents WHERE collection = ? ORDER BY rowid').all(collection).map(row => JSON.parse(row.json));
  }
  put(collection, record) {
    if (typeof record?.id !== 'string' || !record.id) throw new Error('Persistent records require an id.');
    this.db.prepare('INSERT INTO documents(collection,id,json) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET json=excluded.json').run(collection, record.id, JSON.stringify(record));
    return record;
  }
  delete(collection, id) { this.db.prepare('DELETE FROM documents WHERE collection=? AND id=?').run(collection, id); }
  settings() {
    const saved = this.get('settings')[0] ?? {};
    return { ...defaults, ...saved, voice: { ...defaults.voice, ...saved.voice } };
  }
  updateSettings(patch) {
    const current = this.settings();
    return this.put('settings', { ...current, ...patch, voice: { ...current.voice, ...patch.voice }, id: 'settings' });
  }
  backup() {
    this.db.exec('PRAGMA wal_checkpoint(FULL)');
    const target = join(this.directory, 'backups', `companion-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
    mkdirSync(dirname(target), { recursive: true });
    if (existsSync(this.path)) copyFileSync(this.path, target);
    return target;
  }
  close() { this.db.close(); }
}
