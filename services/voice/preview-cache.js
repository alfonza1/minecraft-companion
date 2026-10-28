import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const PREVIEW_TEXT = "Hey, I'm here. Ready to grab some wood and head out?";
const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;
const MAX_SAVED_SAMPLES = 32;
const isWave = value => value.length > 44 && value.length <= MAX_SAMPLE_BYTES && value.toString('ascii', 0, 4) === 'RIFF' && value.toString('ascii', 8, 12) === 'WAVE';

export function createPreviewCache({ directory, identify, render }) {
  const pending = new Map();
  async function trim() {
    const names = (await readdir(directory)).filter(name => /^[a-f0-9]{64}\.wav$/.test(name));
    if (names.length <= MAX_SAVED_SAMPLES) return;
    const files = await Promise.all(names.map(async name => ({ name, modified: (await stat(join(directory, name))).mtimeMs })));
    for (const file of files.sort((a, b) => b.modified - a.modified).slice(MAX_SAVED_SAMPLES)) await unlink(join(directory, file.name)).catch(() => {});
  }
  async function generate(file, voice, signal) {
    let temporary;
    try {
      const audio = await render(PREVIEW_TEXT, voice, signal); signal.throwIfAborted();
      if (!isWave(audio)) throw new Error('Voice preview did not produce a valid WAV sample.');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      temporary = `${file}.${randomUUID()}.tmp`; await writeFile(temporary, audio, { mode: 0o600 });
      signal.throwIfAborted(); await rename(temporary, file); temporary = null;
      await trim().catch(() => {}); return audio;
    } finally { if (temporary) await unlink(temporary).catch(() => {}); }
  }
  return { async get(voiceId, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const identity = await identify(voiceId); signal.throwIfAborted();
    const key = createHash('sha256').update(JSON.stringify({ revision: 1, text: PREVIEW_TEXT, ...identity })).digest('hex');
    const file = join(directory, `${key}.wav`);
    try { const audio = await readFile(file); signal.throwIfAborted(); if (isWave(audio)) return { audio, cached: true }; }
    catch (error) { signal.throwIfAborted(); if (error.code !== 'ENOENT') throw error; }
    let entry = pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, readers: new Set(), promise: null };
      entry.promise = Promise.resolve().then(() => generate(file, identity.voice, controller.signal)).finally(() => { if (pending.get(key) === entry) pending.delete(key); });
      pending.set(key, entry);
    }
    const token = {}; entry.readers.add(token);
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => {
        entry.readers.delete(token);
        if (!entry.readers.size) { entry.controller.abort(); entry.promise.catch(() => {}).finally(() => reject(signal.reason)); }
        else reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
    });
    try { const audio = await Promise.race([entry.promise, cancelled]); signal.throwIfAborted(); return { audio, cached: false }; }
    finally { signal.removeEventListener('abort', abort); entry.readers.delete(token); }
  } };
}
