import nativeProtocol from '../native-26.3/preload.cjs';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import minecraftAssets from 'minecraft-assets';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store } from '../memory/store.js';
import { RealmConnector, supportedVersions } from '../realm-connector/index.js';
import { CompanionRuntime } from '../companion-runtime/index.js';
import { lockBody } from '../../src/session.js';
import { registerSetupRoutes } from '../setup/index.js';
import { getBridgeStatus } from '../protocol-bridge/index.js';
import { registerPrivateAccountRoutes } from '../realm-connector/private-browser.js';
import { sourceFingerprint } from '../../scripts/desktop-source.mjs';
import { normalizeHotkey } from '../../packages/shared-types/hotkeys.js';
import voiceCatalog from '../voice/voices.json' with { type: 'json' };
import { TeammateService } from '../skill-executor/teammate.js';
import { registerTeammateRoutes } from '../skill-executor/teammate-routes.js';
import { createProviderRegistry } from '../agent-orchestrator/providers/index.js';
import { modelSelection } from '../../packages/shared-types/providers.js';
import { IdleWorkService } from '../skill-executor/idle-work.js';
import { createModelCatalog } from '../agent-orchestrator/models.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runningSourceFingerprint = await sourceFingerprint(root);
const hotkeySchema = z.unknown().transform((value, context) => { try { return normalizeHotkey(value); } catch (error) { context.addIssue({ code: 'custom', message: error.message }); return z.NEVER; } });
const desktopDevice = z.object({name:z.string().min(1).max(300),hostapi:z.number().int().min(0).max(100)}).strict().nullable();
const voiceSettings = z.object({ enabled: z.boolean().optional(), desktopEnabled:z.boolean().optional(), desktopInputDevice:desktopDevice.optional(), desktopOutputDevice:desktopDevice.optional(), handsFree: z.boolean().optional(), speed: z.number().min(0.5).max(2).optional(), volume: z.number().min(0).max(1).optional(), inputDevice: z.string().max(300).optional(), outputDevice: z.string().max(300).optional(), pushToTalk: hotkeySchema.optional(), ttsVoice: z.enum(voiceCatalog.map(voice => voice.id)).optional() }).strict();
const miningZoneSchema = z.object({ x: z.number().int().min(-29_999_800).max(29_999_800), y: z.number().int().min(-64).max(319), z: z.number().int().min(-29_999_800).max(29_999_800), radius: z.number().int().min(1).max(32) }).strict();
export const settingsSchema = z.object({ realmId: z.number().int().positive().nullable().optional(), playerName: z.string().regex(/^(?:[A-Za-z0-9_]{3,16})?$/).optional(), autonomy: z.enum(['instructions','helpful','independent']).optional(), combat: z.enum(['retreat','defend']).optional(), followDistance: z.number().min(2).max(8).optional(), alertFrequency: z.enum(['quiet','normal']).optional(), movementSpeed: z.enum(['normal','brisk']).optional(), model: z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9_.:/-]{0,99})?$/).optional(), provider: z.enum(['codex','claude','opencode']).optional(), providerModels: z.object({ claude: z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9_.:/+\[\]@-]{0,199})?$/).optional(), opencode: z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9_.:/+\[\]@-]{0,199})?$/).optional() }).strict().optional(), separateConversationModel:z.boolean().optional(),conversationModels:z.object({codex:z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9_.:/+\[\]@-]{0,199})?$/).optional(),claude:z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9_.:/+\[\]@-]{0,199})?$/).optional(),opencode:z.string().regex(/^(?:[A-Za-z0-9][A-Za-z0-9_.:/+\[\]@-]{0,199})?$/).optional()}).strict().optional(),fastResponses:z.boolean().optional(), lowTokenMode: z.boolean().optional(), maxRequestsPerHour: z.number().int().min(0).max(200).optional(), inputTokenLimitEnabled: z.boolean().optional(), maxInputTokens: z.number().int().min(0).max(10_000_000).optional(), voice: voiceSettings.optional() }).strict();

export async function createApp(options = {}) {
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024, trustProxy: false });
  const store = options.store || new Store();
  const connector = options.connector || new RealmConnector(store.directory);
  const runtime = options.runtime || new CompanionRuntime({ store, connector });
  const modelCatalog = options.modelCatalog || createModelCatalog();
  const clients = new Set();
  let providerRegistry;
  let orchestrator, teammate, idleWork, voiceModule = options.voiceModule;
  let codexStatus = { available: null, authenticated: null, version: null, error: null };
  const snapshot = () => ({ ...runtime.snapshot(), auth: connector.auth, realms: connector.realms,
    projects: store.get('projects'),referenceSearches:store.get('referenceSearches').slice(-10), memories: store.get('memories'), conversation: store.get('conversation').slice(-100),
    usage: orchestrator?.usage || { requests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, billingCost: null },
    ai: { ...modelSelection(store.settings()), ...((store.settings().provider || 'codex') === 'codex' ? codexStatus : providerRegistry?.status(store.settings().provider)), modelState: orchestrator?.modelState || { active: null, last: store.get('modelRuns').find(value => value.id === 'last') || null } },
    settings: store.settings(), teammate: teammate?.snapshot(), codex: { ...codexStatus, model: orchestrator?.modelState || { active: null, last: store.get('modelRuns').find(value => value.id === 'last') || null } }, voice: voiceModule?.getVoiceStatus() || { available: false, status: 'setup-required', error: null },
  });
  let scheduled = false;
  const publish = () => {
    if (scheduled) return; scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!clients.size) return;
      const event = JSON.stringify({ type: 'state', state: snapshot() });
      for (const client of clients) { if (client.readyState === 1 && client.bufferedAmount < 1024 * 1024) client.send(event); }
    });
  };
  providerRegistry = options.providerRegistry || createProviderRegistry({ modelCatalog, publish });
  const readiness = options.readiness || {
    codex: () => codexStatus,
    ai: () => ({ ...modelSelection(store.settings()), ...((store.settings().provider || 'codex') === 'codex' ? codexStatus : providerRegistry.status(store.settings().provider)) }),
    voice: () => voiceModule?.getVoiceStatus() || { available: false, status: 'setup-required', error: null },
    async refresh() {
      if (!voiceModule) return;
      const { getCodexStatus } = await import('../agent-orchestrator/index.js');
      const results = await Promise.allSettled([getCodexStatus(), voiceModule.checkVoice()]);
      if (results[0].status === 'fulfilled') codexStatus = results[0].value;
      else codexStatus = { available: false, authenticated: false, error: 'Codex readiness check failed.' };
      if (store.settings().provider !== 'codex') await providerRegistry.get(store.settings().provider, { refresh: true }).catch(() => {});
    },
  };
  const context = { store, connector, runtime, publish, modelCatalog, providerRegistry, dataDir: store.directory, readiness };
  if(options.videoCredentials)context.videoCredentials=options.videoCredentials;
  if(options.visionRequest)context.visionRequest=options.visionRequest;
  if(options.youtubeAnalysis)context.youtubeAnalysis=options.youtubeAnalysis;
  teammate = new TeammateService(context); context.teammate = teammate;
  idleWork=new IdleWorkService({runtime,teammate,publish});
  app.decorate('companion', { ...context, snapshot });
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    if (!host || !allowedHosts.has(host.replace(/:\d+$/, ''))) return reply.code(403).send({ error: 'Dashboard accepts localhost requests only.' });
    const origin = request.headers.origin;
    if (origin) {
      let url;
      try { url = new URL(origin); } catch { return reply.code(403).send({ error: 'Invalid request origin.' }); }
      const port = new URL(`http://${host}`).port;
      if (url.protocol !== 'http:' || !allowedHosts.has(url.hostname) || ![port, '4366'].includes(url.port)) return reply.code(403).send({ error: 'Cross-origin dashboard request rejected.' });
    }
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    if (request.method !== 'GET' && request.method !== 'HEAD' && !/^(application\/json|multipart\/form-data)(?:;|$)/i.test(request.headers['content-type'] || '')) return reply.code(415).send({ error: 'Use application/json or a supported file upload.' });
  });
  app.setErrorHandler((error, request, reply) => {
    const status = error instanceof z.ZodError ? 400 : error.statusCode || (/must|requires|choose|already|unsupported|invalid|cannot|select|connect|resume|active|paused|companion/i.test(error.message) ? 409 : 500);
    const message = error instanceof z.ZodError ? error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ') : error.message;
    reply.code(Math.min(Math.max(status, 400), 599)).send({ error: message.slice(0, 1500), ...(['INPUT_TOKEN_BUDGET','MODEL_REQUEST_LIMIT'].includes(error.code) ? { code:error.code } : {}) });
  });
  await app.register(websocket, { options: { maxPayload: 1024 } });
  await app.register(multipart, { limits: { fileSize: 24 * 1024 * 1024, files: 1, fields: 5, parts: 6 } });
  app.get('/api/events', { websocket: true }, socket => {
    clients.add(socket); socket.send(JSON.stringify({ type: 'state', state: snapshot() }));
    socket.on('close', () => clients.delete(socket)); socket.on('error', () => clients.delete(socket));
  });
  runtime.on('change', publish); connector.on('change', publish);
  connector.on('diagnostic', message => runtime.log('error', message));
  app.get('/api/state', async () => snapshot());
  const providerName = value => z.enum(['codex','claude','opencode']).parse(value);
  app.get('/api/ai/:provider/models', async request => { const catalog = await providerRegistry.get(providerName(request.params.provider)); publish(); return catalog; });
  app.post('/api/ai/:provider/models/refresh', async request => { const catalog = await providerRegistry.get(providerName(request.params.provider), { refresh: true }); publish(); return catalog; });
  app.post('/api/ai/claude/login', async () => providerRegistry.startClaudeLogin());
  app.get('/api/codex/models', async () => modelCatalog.get());
  app.post('/api/codex/models/refresh', async () => modelCatalog.get({ refresh: true }));
  app.get('/api/desktop/revision', async () => ({ sourceFingerprint: runningSourceFingerprint }));
  app.get('/api/health', async () => ({ name: 'Minecraft Companion', node: process.versions.node, host: '127.0.0.1', supportedVersions, latestSupportedVersion: supportedVersions.at(-1), bridge: getBridgeStatus(), authStorage: 'Windows DPAPI CurrentUser outside repository', dataDirectory: store.directory, liveWorldObserved: Boolean(runtime.world), voice: voiceModule?.getVoiceStatus(), limitations: [nativeProtocol.installed ? 'Native 26.3 is installed; newly introduced materials and uncommon item codecs still require validation.' : '26.3 requires the optional protocol bridge; its projected view cannot support exact construction or resource reconciliation.', 'Full-cube construction on native connections only; oriented blocks, scaffolding and advanced progression require further gameplay validation.'] }));
  app.post('/api/auth/connect', async () => { connector.connectAccount(); return { started: true }; });
  registerPrivateAccountRoutes(app, context, options.privateBrowser);
  app.post('/api/realms/refresh', async () => { connector.connectAccount(); return { started: true }; });
  app.post('/api/settings', async request => { const settings = store.updateSettings(settingsSchema.parse(request.body)); await voiceModule?.updateVoiceSettings(settings.voice); if(settings.inputTokenLimitEnabled===false)voiceModule?.clearTokenBudgetError?.(); publish(); return settings; });
  app.post('/api/permissions/mining', async request => {
    const { zone } = z.object({ zone: miningZoneSchema.nullable() }).strict().parse(request.body);
    const settings = store.updateSettings({ miningZone: zone });
    if(zone&&runtime.world)store.put('workAreas',{id:'mining',realmId:settings.realmId,dimension:runtime.world.dimension,position:{x:zone.x,y:zone.y,z:zone.z},radius:zone.radius});else store.delete('workAreas','mining');
    publish(); return settings;
  });
  app.post('/api/control', async request => {
    const { command } = z.object({ command: z.enum(['start','plan','pause','resume','stop','cancel','emergency','disconnect']) }).strict().parse(request.body);
    await runtime.control(command); publish(); return snapshot();
  });
  app.post('/api/tasks', async request => {
    const { tool, args } = z.object({ tool: z.string().max(60), args: z.record(z.string(), z.unknown()).default({}) }).strict().parse(request.body);
    const result = await runtime.execute(tool, args); publish(); return result;
  });
  app.post('/api/conversation', async request => {
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).strict().parse(request.body);
    if (!orchestrator) throw new Error('Conversation service unavailable.');
    return { text: await orchestrator.respond(text) };
  });
  app.post('/api/conversation/cancel', async () => { await orchestrator?.cancelInference(); return { cancelled: true }; });
  app.post('/api/usage/renew-budget', async request => {
    z.object({}).strict().parse(request.body);
    if (!orchestrator) throw new Error('Conversation service unavailable.');
    return orchestrator.renewTokenBudget();
  });
  registerTeammateRoutes(app, { ...context, getOrchestrator: () => orchestrator });
  app.post('/api/memories', async request => {
    const value = z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(3000) }).strict().parse(request.body);
    const record = store.put('memories', { ...value, id: randomUUID(), provenance: 'user-reported', at: new Date().toISOString() }); publish(); return record;
  });
  app.post('/api/memories/delete', async request => { const { id } = z.object({ id: z.string().uuid() }).strict().parse(request.body); store.delete('memories', id); publish(); return { deleted: true }; });
  app.post('/api/data/backup', async () => ({ path: store.backup() }));
  app.post('/api/system/shutdown', async (_, reply) => { reply.send({ shuttingDown: true }); setImmediate(() => app.close().catch(() => { process.exitCode = 1; })); });
  app.get('/api/data/export', async () => ({ format: 'minecraft-companion/v1', settings: store.settings(), projects: store.get('projects'), memories: store.get('memories'), exportedAt: new Date().toISOString() }));
  app.get('/api/assets/:kind/:name', async (request, reply) => {
    const { kind, name } = request.params;
    if (!['item','block'].includes(kind) || !/^[a-z0-9_]+$/.test(name)) return reply.code(404).send({ error: 'Unknown Minecraft asset.' });
    const assets = minecraftAssets(runtime.connection.version || '1.21.11');
    const embedded = assets?.textureContent?.[name]?.texture;
    if (typeof embedded === 'string' && embedded.startsWith('data:image/png;base64,')) return reply.type('image/png').header('Cache-Control', 'private,max-age=3600').send(Buffer.from(embedded.slice('data:image/png;base64,'.length), 'base64'));
    const record = (kind === 'item' ? assets?.items : assets?.blocks)?.[name];
    if (!record?.texture) return reply.code(404).send({ error: 'No texture in installed asset pack.' });
    const texture = resolve(assets.directory, `${record.texture.replace('minecraft:', '')}.png`);
    if (!texture.startsWith(resolve(assets.directory) + sep)) return reply.code(404).send({ error: 'Invalid asset path.' });
    try { const bytes = await readFile(texture); return reply.type('image/png').header('Cache-Control', 'private,max-age=3600').send(bytes); }
    catch { return reply.code(404).send({ error: 'Texture unavailable.' }); }
  });
  if (!options.skipExtensions) {
    voiceModule ??= await import('../voice/index.js');
    voiceModule.registerVoiceRoutes(app, context);
    const { createOrchestrator, getCodexStatus } = await import('../agent-orchestrator/index.js');
    orchestrator = createOrchestrator({...context,request:options.modelRequest,designRequest:options.designRequest,searchRequest:options.searchRequest,verifyVideos:options.verifyVideos});
    context.orchestrator = orchestrator;
    runtime.modelCancel = options => orchestrator.cancel(options); runtime.audioStop = () => voiceModule.cancelSpeech(); runtime.fullAudioStop = () => voiceModule.stopVoice();
    runtime.on('conversation', text => orchestrator.respond(text).catch(error => runtime.log('error', error.message)));
    const { registerBuildRoutes } = await import('../build-planner/index.js');
    await registerBuildRoutes(app, context);
    void voiceModule.checkVoice().then(publish);
    void getCodexStatus().then(status => { codexStatus = status; publish(); });
    if (modelSelection(store.settings()).provider !== 'codex') void providerRegistry.get(modelSelection(store.settings()).provider).catch(() => {});
  }
  registerSetupRoutes(app, context);
  const dashboard = join(root, 'apps', 'dashboard', 'dist');
  if (existsSync(dashboard)) {
    await app.register(staticFiles, { root: dashboard, prefix: '/' });
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: 'API endpoint not found.' }) : reply.sendFile('index.html'));
  } else app.get('/', async (_, reply) => reply.type('text/plain').send('Minecraft Companion: run npm run build, then restart the launcher.'));
  app.addHook('onClose', async () => {
    idleWork.close();
    for (const client of clients) client.close(1001, 'Companion shutting down'); clients.clear();
    await runtime.close(); await orchestrator?.close(); await providerRegistry.close(); await modelCatalog.close(); store.close();
  });
  return app;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const store = new Store();
  let unlock;
  try { unlock = lockBody(join(store.directory, 'runtime.pid')); }
  catch (error) { store.close(); throw error; }
  process.on('exit', unlock);
  let app;
  try { app = await createApp({ store }); }
  catch (error) { unlock(); store.close(); throw error; }
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await app.close(); unlock(); };
  process.on('SIGINT', () => shutdown().catch(() => process.exitCode = 1));
  process.on('SIGTERM', () => shutdown().catch(() => process.exitCode = 1));
  try { await app.listen({ host: '127.0.0.1', port: Number(process.env.COMPANION_PORT || 4365) }); console.log('Minecraft Companion: http://127.0.0.1:4365'); }
  catch (error) { await shutdown(); console.error(error.message); process.exitCode = 1; }
}
