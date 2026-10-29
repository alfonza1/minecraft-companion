import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { dataFor } from '../../packages/minecraft-data/index.js';
import { validateBlueprint, blueprintHash } from './blueprint.js';
import { calculateMaterials } from './materials.js';
import { splitAssignments, updateUserProgress, reconcileAssignments, reconcileProjectInventory, reserveMaterials, assignmentNeeds } from '../resource-ledger/index.js';
import { archiveReference, parseSchematic, privateDataDir, REFERENCE_LIMITS, youtubeReference } from '../reference-ingestion/index.js';
import { constructionCompatibility, executeBuild, validateOrigin } from '../build-executor/index.js';
import { createBuildSupplies, remainingMaterials } from '../build-executor/supplies.js';
import { assertConstructionEditable, prepareConstruction, constructionPolicy } from '../build-executor/construction-plan.js';
import {assistedAssignments} from '../resource-ledger/acquisition.js';
import {registerAnalysisRoutes} from '../reference-ingestion/analysis-routes.js';

export { validateBlueprint, blueprintHash, calculateMaterials };

export function reviseProject(project, input) {
  assertConstructionEditable(project);
  const blueprint = validateBlueprint(input);
  if (blueprint.version !== project.version) throw new Error('Blueprint version must match its project. Create a new project to change Minecraft version.');
  const materials = calculateMaterials(blueprint);
  return { ...project, blueprint, revision: project.revision + 1, approvedRevision: null, approvedHash: null, materials, assignments: splitAssignments(materials.raw, project.aiPercent ?? 50), checkpoint: null, construction: null, reservations: {}, compatibility: constructionCompatibility(blueprint), status: 'draft', updatedAt: new Date().toISOString() };
}

export function approveProject(project) {
  if (!project.blueprint?.blocks.length) throw new Error('Import a complete non-empty blueprint before approval.');
  return { ...project, approvedRevision: project.revision, approvedHash: blueprintHash(project.blueprint), status: 'approved', materials: { ...project.materials, accuracy: 'exact-blueprint' }, updatedAt: new Date().toISOString() };
}

export function registerBuildRoutes(app, context) {
  const { store, runtime, publish } = context;
  const directory = context.dataDir ?? privateDataDir();
  // Compatibility is derived capability metadata, not blueprint content. Refresh
  // old saved projects without invalidating the user's approved design/hash.
  for (const project of store.get('projects')) if (project.blueprint) {
    store.put('projects', { ...project, compatibility: constructionCompatibility(project.blueprint) });
  }
  const inFlight = new Set();
  const getProject = (id) => {
    const project = store.get('projects').find((p) => p.id === id);
    if (!project) { const error = new Error('Project not found.'); error.statusCode = 404; throw error; }
    return project;
  };
  const ensureEditable = (id) => { if (inFlight.has(id)) throw new Error('Stop the current project job before revising this project.'); };
  const put = (project) => {
    store.put('projects', project);
    const world = runtime.snapshot().world;
    for (const reconciled of reconcileProjectInventory(store.get('projects'), world?.inventory, world?.inventoryExact === false ? null : world?.observedAt)) store.put('projects', reconciled);
    publish();
    return getProject(project.id);
  };
  const endpoint = (handler) => async (request, reply) => {
    try { return await handler(request, reply); }
    catch (error) { return reply.code(error.statusCode ?? 400).send({ error: error.message }); }
  };
  const saveRevision = (project) => {
    store.put('blueprintRevisions', { id: `${project.id}:${project.revision}`, projectId: project.id, revision: project.revision, blueprint: project.blueprint, at: new Date().toISOString() });
    return put(project);
  };
  registerAnalysisRoutes(app,{...context,dataDir:directory},{getProject,ensureEditable,put,saveRevision,inFlight,reviseProject});

  app.get('/api/projects', async () => store.get('projects').map(project => project.blueprint ? { ...project, compatibility: constructionCompatibility(project.blueprint) } : project));
  app.post('/api/references/search',endpoint(async({body})=>context.orchestrator.searchYouTube(body?.query)));
  app.post('/api/projects/:id/reference-choice',endpoint(async({params,body})=>{
    ensureEditable(params.id);const project=getProject(params.id);
    assertConstructionEditable(project);
    const search=store.get('referenceSearches').find(value=>value.id===body?.searchId);
    const reference=search?.videos.find(value=>value.id===body?.referenceId);
    if(!reference)throw new Error('Choose a verified result from a recent YouTube search.');
    const existing=project.references.find(value=>value.url===reference.url);
    if(!existing&&project.references.length>=50)throw new Error('A project may hold at most 50 references.');
    const references=existing?project.references:[...project.references,reference];
    const changed=project.selectedReference?.url!==reference.url;
    store.put('projectFocus',{id:'current',projectId:project.id});
    return put({...project,...(changed?{approvedRevision:null,approvedHash:null,status:'draft',sourceAnalysis:null,analysisStatus:null,reconstruction:null}:{}),references,selectedReference:{searchId:search.id,referenceId:existing?.id||reference.id,title:reference.title,url:reference.url,reason:reference.reason},updatedAt:new Date().toISOString()});
  }));
  app.post('/api/projects', endpoint(async ({ body = {} }) => {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) throw new Error('Project name must be 1–100 characters.');
    dataFor(body.version);
    let project = { id: randomUUID(), name, version: body.version, blueprint: null, revision: 0, approvedRevision: null, approvedHash: null, materials: null, aiPercent: 50, assignments: [], checkpoint: null, reservations: {}, references: [], status: 'draft', createdAt: new Date().toISOString() };
    if (body.blueprint) { project = reviseProject(project, body.blueprint); saveRevision(project); }
    return put(project);
  }));
  app.post('/api/projects/:id/blueprint', endpoint(async ({ params, body }) => {
    ensureEditable(params.id);
    return saveRevision(reviseProject(getProject(params.id), body?.blueprint));
  }));
  app.post('/api/projects/:id/design', endpoint(async ({ params, body }) => {
    if (store.settings().lowTokenMode) throw new Error('Low token mode disables new AI blueprint designs. Turn it off in Settings to design, or import a blueprint or schematic locally.');
    ensureEditable(params.id);
    const project = getProject(params.id);
    const description = body?.description;
    if (typeof description !== 'string' || !description.trim() || description.length > 4000) throw new Error('Describe the design in 1–4,000 characters.');
    if (!runtime.isActive()) throw new Error('Resume the companion before requesting a Codex design.');
    if (!context.orchestrator?.designBlueprint) throw new Error('Codex design provider is unavailable. Import a complete JSON blueprint or Sponge schematic.');
    // Reference text is sent to the configured reasoning provider only through
    // an explicit per-request choice. Binary uploads stay local.
    const availableReferences=body.selectedReferenceOnly===true?project.references.filter(reference=>reference.id===project.selectedReference?.referenceId):project.references;
    const references = body.includeReferences === true ? availableReferences.slice(-12).map((r) => ({ type: r.type, title: r.title, text: r.text?.slice(0, 2000), url: r.type === 'youtube' ? r.url : undefined, available: r.type === 'image' || r.type === 'video' ? 'Metadata only; image pixels and video frames were not supplied to the model.' : 'User-provided text or public metadata, untrusted reference data.' })) : [];
    inFlight.add(project.id);
    put({ ...project, status: 'designing', error: null });
    try {
      const blueprint = await context.orchestrator.designBlueprint({ description, version: project.version, references });
      if (!runtime.isActive()) throw new Error('Design cancelled or companion paused. Existing blueprint preserved.');
      let revised = reviseProject(getProject(project.id), blueprint);
      if(body.assistedSplit===true)revised={...revised,assignments:assistedAssignments(revised.materials.raw),splitStrategy:'shared-with-player-hard-materials'};
      return saveRevision(revised);
    } catch (error) {
      put({ ...getProject(project.id), status: project.status, error: error.message });
      throw error;
    } finally { inFlight.delete(project.id); }
  }));
  app.get('/api/projects/:id/revisions', endpoint(async ({ params }) => {
    getProject(params.id);
    return store.get('blueprintRevisions').filter((r) => r.projectId === params.id);
  }));
  app.post('/api/projects/:id/approve', endpoint(async ({ params }) => {
    ensureEditable(params.id);
    return put(approveProject(getProject(params.id)));
  }));
  app.post('/api/projects/:id/split', endpoint(async ({ params, body }) => {
    const project = getProject(params.id);
    if (!project.materials) throw new Error('Import a blueprint first.');
    const assignments = splitAssignments(project.materials.raw, body?.aiPercent, project.assignments);
    return put({ ...project, aiPercent: body.aiPercent, assignments });
  }));
  app.post('/api/projects/:id/assisted-split',endpoint(async({params})=>{
    const project=getProject(params.id);
    if(!project.materials)throw new Error('Import or generate a complete blueprint first.');
    return put({...project,aiPercent:50,splitStrategy:'shared-with-player-hard-materials',assignments:assistedAssignments(project.materials.raw,project.assignments)});
  }));
  app.post('/api/projects/:id/assign', endpoint(async ({ params, body }) => {
    const project = getProject(params.id);
    if (!project.assignments.some((a) => a.material === body?.material)) throw new Error('Unknown project material.');
    const single = project.materials.raw.filter((r) => r.name === body.material);
    const [assignment] = splitAssignments(single, body.aiPercent, project.assignments);
    return put({ ...project, assignments: project.assignments.map((a) => a.material === body.material ? assignment : a) });
  }));
  app.post('/api/projects/:id/progress', endpoint(async ({ params, body }) => {
    if (body?.owner !== 'user') throw new Error('Only user-reported progress may be edited manually. Bot counts come from live inventory observations.');
    const project = getProject(params.id);
    return put({ ...project, assignments: updateUserProgress(project.assignments, body.material, body.quantity) });
  }));
  app.post('/api/projects/:id/gather', endpoint(async ({ params, body }) => {
    if (runtime.bot?.companionTransport?.projected) throw new Error('Assigned gathering is disabled on translated connections because inventory identities may be mapped.');
    if (runtime.snapshot().world?.inventoryExact === false) throw new Error('Wait for server inventory confirmation before assigned gathering.');
    ensureEditable(params.id);
    const project = getProject(params.id);
    if (project.approvedRevision !== project.revision || !project.blueprint || project.approvedHash !== blueprintHash(project.blueprint)) throw new Error('Approve the project before gathering its assigned resources.');
    if (!runtime.isActive() || runtime.snapshot().state === 'BUSY') throw new Error('Resume an idle companion before gathering.');
    const material = body?.material;
    if (!['oak_log', 'spruce_log', 'birch_log'].includes(material)) throw new Error('Assigned gathering currently supports oak, spruce and birch logs only. Other resources require an explicitly approved safe mining site.');
    const world = runtime.snapshot().world;
    if (!world?.observedAt) throw new Error('Live inventory is required before resource reconciliation.');
    const reconciled = reconcileProjectInventory(store.get('projects'), world.inventory, world.observedAt).find((p) => p.id === project.id);
    const assignment = reconciled.assignments.find((a) => a.material === material);
    if (!assignment) throw new Error('This material is not assigned to the project.');
    const count = Math.min(16, assignmentNeeds(assignment));
    if (!count) return { started: false, summary: 'The current assignment is already covered by observed stock and user-reported contributions.' };
    const bot = runtime.bot;
    const logs = bot.findBlocks({ maxDistance: 32, count: 128, matching: (b) => b.name === material }).map((p) => bot.blockAt(p)).filter(Boolean);
    const firstRoot = logs.find((block) => {
      const below = bot.blockAt(block.position.offset(0, -1, 0));
      return below?.boundingBox === 'block' && !below.name.endsWith('_log') && !below.name.endsWith('_leaves');
    }) ?? logs[0];
    const soil = firstRoot && bot.blockAt(firstRoot.position.offset(0, -1, 0));
    if (!firstRoot || !['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'rooted_dirt', 'moss_block'].includes(soil?.name)) throw new Error('No clearly natural tree is selected nearby. Move to an untouched forest; structure logs are not approved resource targets.');
    const species = material.replace(/_log$/, '');
    const leaves = bot.findBlocks({ point: firstRoot.position, maxDistance: 8, count: 1, matching: bot.registry.blocksByName[`${species}_leaves`]?.id });
    if (!leaves.length) throw new Error('Selected logs have no observed matching leaf canopy. Refusing possible structure logs.');
    const result = await runtime.execute('chop_tree', { species, count });
    const observed = runtime.snapshot().world;
    const latest = getProject(project.id);
    put({ ...latest, assignments: reconcileAssignments(latest.assignments, observed?.inventory, observed?.observedAt) });
    return { ...result, material, requested: count, remaining: assignmentNeeds(getProject(project.id).assignments.find((a) => a.material === material)) };
  }));
  app.post('/api/projects/:id/construction-plan', endpoint(async ({ params, body }) => {
    ensureEditable(params.id);
    const project = getProject(params.id), bot = runtime.bot;
    if (!runtime.isActive() || runtime.snapshot().state === 'BUSY' || !bot?.entity) throw new Error('Connect and resume an idle companion at the build site to prepare automatic construction.');
    if (bot.companionTransport?.projected || runtime.snapshot().world?.inventoryExact === false) throw new Error('Automatic worksite planning requires confirmed native world and inventory data.');
    if (project.approvedRevision !== project.revision || project.approvedHash !== blueprintHash(project.blueprint)) throw new Error('Approve the blueprint before preparing its worksite plan.');
    if (project.version !== bot.version) throw new Error('Project and connected Minecraft versions must match.');
    const origin = validateOrigin(body?.origin), policy = constructionPolicy.parse(body?.policy);
    const construction = prepareConstruction(project, origin, bot, store.settings().realmId, policy);
    return put({ ...project, construction });
  }));
  async function startBuild(projectId, body) {
    if (runtime.bot?.companionTransport?.projected) throw new Error('Exact construction is disabled on translated connections. Use a natively supported server version.');
    if (runtime.snapshot().world?.inventoryExact === false) throw new Error('Wait for server inventory confirmation before construction.');
    ensureEditable(projectId);
    const project = getProject(projectId);
    if (body.expectedRevision !== undefined && (body.expectedRevision !== project.revision || body.expectedHash !== project.approvedHash)) throw new Error('The saved build revision changed. Review and approve it before restarting construction.');
    const origin = validateOrigin(body?.origin);
    if (!runtime.isActive() || runtime.snapshot().state === 'BUSY') throw new Error('Start/resume an idle companion before building.');
    if (project.approvedRevision !== project.revision || !project.blueprint || project.approvedHash !== blueprintHash(project.blueprint)) throw new Error('Approve the current blueprint before starting.');
    const compatibility = constructionCompatibility(project.blueprint);
    if (!compatibility.supported) throw new Error(`${compatibility.limitation} Unsupported: ${compatibility.unsupported.join(', ')}.`);
    const reservations = reserveMaterials(store.get('projects'), project.id, remainingMaterials(project.blueprint, runtime.bot, origin), runtime.bot?.inventory.items() ?? [], { partial: true });
    project.reservations = reservations;
    put(project);
    inFlight.add(project.id);
    const save = p => store.put('projects', { ...getProject(p.id), checkpoint: p.checkpoint, construction: p.construction, status: p.status, reservations: p.reservations, error: null });
    const ensureMaterials = createBuildSupplies({ project, origin, bot: runtime.bot, store, teammate: runtime.teammate, save });
    const cleanupOnly = body.cleanupOnly === true;
    const job = runtime.runJob(`${cleanupOnly ? 'scaffold cleanup' : 'build'}:${project.name}`, (signal) => executeBuild({ project, origin, bot: runtime.bot, realmId:store.settings().realmId, signal, save, publish, ensureMaterials, cleanupOnly }), { tool: 'resume_build', args: { projectId, origin, expectedRevision: project.revision, expectedHash: project.approvedHash, cleanupOnly } });
    // The long-running task is owned by the runtime, not the HTTP connection.
    // Frontend aborts cannot masquerade as backend task cancellation.
    void job.catch((error) => {
      const current = getProject(project.id);
      put({ ...current, status: current.status === 'paused' ? 'paused' : 'blocked', error: error.message });
    }).finally(() => {
      inFlight.delete(project.id);
      const current = getProject(project.id);
      put({ ...current, reservations: {} });
    });
    return { started: true, projectId: project.id, job };
  }
  runtime.resumeHandlers ||= new Map();
  runtime.resumeHandlers.set('resume_build', async args => {
    if (!args || typeof args.projectId !== 'string' || !Number.isSafeInteger(args.expectedRevision) || typeof args.expectedHash !== 'string') throw new Error('Invalid saved build checkpoint.');
    const result = await startBuild(args.projectId, args); return result.job;
  });
  app.post('/api/projects/:id/build', endpoint(async ({ params, body }) => { const { job, ...result } = await startBuild(params.id, body || {}); return result; }));
  app.post('/api/projects/:id/schematic', endpoint(async (request) => {
    ensureEditable(request.params.id);
    const project = getProject(request.params.id);
    if (!request.isMultipart?.()) throw new Error('Upload one .schem file as multipart/form-data.');
    const file = await request.file({ limits: { fileSize: REFERENCE_LIMITS.schematicBytes, files: 1 } });
    if (!file || !/\.schem(?:atic)?$/i.test(file.filename)) throw new Error('Upload a Sponge .schem file. Legacy MCEdit files are rejected rather than approximated.');
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw new Error('Schematic exceeds 4 MiB.');
    const blueprint = await parseSchematic(buffer, project.version);
    ensureEditable(project.id);
    return saveRevision(reviseProject(getProject(project.id), blueprint));
  }));
  app.post('/api/projects/:id/references', endpoint(async (request) => {
    const project = getProject(request.params.id);
    if (project.references.length >= 50) throw new Error('A project may hold at most 50 references.');
    let reference;
    if (request.isMultipart?.()) {
      const file = await request.file({ limits: { fileSize: REFERENCE_LIMITS.uploadBytes, files: 1 } });
      if (!file) throw new Error('Reference file is required.');
      const buffer = await file.toBuffer();
      if (file.file.truncated) throw new Error('Reference exceeds 32 MiB.');
      reference = await archiveReference(buffer, file.mimetype, directory);
    } else if (request.body?.type === 'youtube') reference = await youtubeReference(request.body.url);
    else if (request.body?.type === 'text') {
      const text = request.body.text;
      if (typeof text !== 'string' || !text.trim() || text.length > 20_000) throw new Error('Reference description must be 1–20,000 characters.');
      reference = { id: randomUUID(), type: 'text', text, at: new Date().toISOString(), analysis: { status: 'awaiting-design', confidence: 'unknown', uncertainties: ['Design not generated. Import or author a complete blueprint before calculating exact materials.'] } };
    } else throw new Error('Use a text or YouTube reference, or upload an allowed image/video.');
    const latest = getProject(project.id);
    return put({ ...latest, references: [...latest.references, reference] });
  }));
  app.get('/api/projects/:id/references/:referenceId', endpoint(async ({ params }, reply) => {
    const reference = getProject(params.id).references.find((r) => r.id === params.referenceId);
    if (!reference?.filename || !/^[0-9a-f-]{36}\.(png|jpg|webp|mp4|webm)$/.test(reference.filename)) throw new Error('Archived media not found.');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.type(reference.mime).send(createReadStream(join(directory, 'references', reference.filename)));
  }));

  let lastObservation;
  runtime.on('change', () => {
    const world = runtime.snapshot().world;
    const marker = world?.inventoryExact === false ? null : world?.observedAt ?? null;
    if (marker === lastObservation) return;
    lastObservation = marker;
    for (const project of reconcileProjectInventory(store.get('projects'), world?.inventory, marker)) store.put('projects', project);
  });
}
