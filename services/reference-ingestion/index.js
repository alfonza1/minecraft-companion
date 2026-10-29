import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Worker } from 'node:worker_threads';

export const REFERENCE_LIMITS = Object.freeze({ uploadBytes: 32 * 1024 * 1024, imageBytes: 8 * 1024 * 1024, schematicBytes: 4 * 1024 * 1024, uncompressedSchematicBytes: 16 * 1024 * 1024, parseTimeoutMs: 15_000 });
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm' };

export function privateDataDir() {
  return join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'MinecraftCompanion');
}

export function validateMedia(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > REFERENCE_LIMITS.uploadBytes) throw new Error('Reference upload must be 1 byte–32 MiB.');
  if (!MIME_EXT[mime]) throw new Error('Allowed references: PNG, JPEG, WebP, MP4 and WebM.');
  if (mime.startsWith('image/') && buffer.length > REFERENCE_LIMITS.imageBytes) throw new Error('Images are limited to 8 MiB.');
  const valid = mime === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      : mime === 'image/webp' ? buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
        : mime === 'video/mp4' ? buffer.toString('ascii', 4, 8) === 'ftyp'
          : buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!valid) throw new Error('File signature does not match its media type.');
  return MIME_EXT[mime];
}

export async function archiveReference(buffer, mime, directory = privateDataDir()) {
  const extension = validateMedia(buffer, mime);
  const id = randomUUID();
  const folder = join(directory, 'references');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const filename = `${id}${extension}`;
  await writeFile(join(folder, filename), buffer, { flag: 'wx', mode: 0o600 });
  return { id, filename, mime, bytes: buffer.length, type: mime.startsWith('image/') ? 'image' : 'video', at: new Date().toISOString(), analysis: { status: 'awaiting-design', confidence: 'unknown', uncertainties: ['Reference archived locally. No dimensions, hidden blocks or material counts have been inferred. Image/video design inference is not yet connected; import a schematic or complete blueprint for exact counts.'] } };
}

export function youtubeId(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Provide a valid YouTube URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Only public HTTPS YouTube URLs are supported.');
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)\/?$/)?.[1];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Unsupported YouTube URL.');
  return id;
}

export async function youtubeReference(input, fetcher = fetch, signal) {
  const id = youtubeId(input);
  const url = `https://www.youtube.com/watch?v=${id}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetcher(endpoint, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error(`YouTube metadata unavailable (${response.status}). Upload permitted screenshots or your own video instead.`);
  if (Number(response.headers.get('content-length')) > 65_536) throw new Error('YouTube metadata response exceeded the limit.');
  let body = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    body += decoder.decode(chunk, { stream: true });
    if (body.length > 65_536) throw new Error('YouTube metadata response exceeded the limit.');
  }
  const data = JSON.parse(body);
  return { id: randomUUID(), type: 'youtube', url, title: String(data.title ?? '').slice(0, 500), author: String(data.author_name ?? '').slice(0, 200), at: new Date().toISOString(), analysis: { status: 'metadata-only', confidence: 'unknown', uncertainties: ['oEmbed supplies public metadata, not video frames, captions or dimensions. No exact reproduction or block count can be inferred. Upload permitted screenshots/video or a complete schematic.'] } };
}

export function parseSchematic(buffer, version) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > REFERENCE_LIMITS.schematicBytes) throw new Error('Schematic must be 1 byte–4 MiB.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./schematic-worker.js', import.meta.url), { workerData: { buffer, version }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 24, stackSizeMb: 4 }, execArgv: [] });
    let done = false;
    function finish(error, blueprint) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      error ? reject(error) : resolve(blueprint);
    }
    const timer = setTimeout(() => finish(new Error('Schematic parsing exceeded its time limit.')), REFERENCE_LIMITS.parseTimeoutMs);
    worker.once('message', (result) => finish(result.error ? new Error(result.error) : null, result.blueprint));
    worker.once('error', (error) => finish(new Error(`Schematic rejected: ${error.message}`)));
    worker.once('exit', (code) => { if (!done) finish(new Error(`Schematic parser stopped (${code}).`)); });
  });
}
