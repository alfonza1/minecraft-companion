import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createVideoCredentials,analyzeYouTube,cleanupVideoJob} from './video-provider.js';
import {analysisPrompt,analysisOutputSchema,validateAnalysis} from './analysis-schema.js';
import {withReferenceFrames} from './frames.js';
import {codexVisionRequest} from '../agent-orchestrator/index.js';
import {expandReconstruction,reconstructionSchemaFor,reconstructionPrompt,assertSourceDimensions,compareSourceMaterials} from '../build-planner/reconstruction.js';
import {assistedAssignments} from '../resource-ledger/acquisition.js';

const notesSchema=z.string().max(4000).default('');
export function registerAnalysisRoutes(app,context,{getProject,ensureEditable,put,saveRevision,inFlight,reviseProject}){
  const {store,runtime,publish}=context;
  const credentials=context.videoCredentials||createVideoCredentials(context.dataDir||store.directory);
  const vision=context.visionRequest||codexVisionRequest;
  const youtube=context.youtubeAnalysis||analyzeYouTube;
  app.get('/api/video-provider',async()=>({...await credentials.status(),pendingJobs:store.get('videoRemoteJobs').filter(job=>!['completed','cancelled'].includes(job.status))}));
  app.post('/api/video-provider',async({body})=>{
    const value=z.object({key:z.string().min(20).max(200),model:z.string().optional()}).strict().parse(body);
    if((await credentials.status()).configured&&store.get('videoRemoteJobs').some(job=>!['completed','cancelled'].includes(job.status)))throw new Error('Resolve the remote video job before replacing its key.');
    return credentials.save(value.key,value.model);
  });
  app.post('/api/video-provider/forget',async()=>{
    if(store.get('videoRemoteJobs').some(job=>!['completed','cancelled'].includes(job.status)))throw new Error('A remote analysis needs attention. Resolve it before removing the key.');
    return credentials.clear();
  });
  app.post('/api/video-provider/cleanup',async()=>{
    for(const job of store.get('videoRemoteJobs').filter(job=>!['completed','cancelled'].includes(job.status)))store.put('videoRemoteJobs',await cleanupVideoJob(job,credentials));
    return {cleaned:true};
  });
  const endpoint=handler=>async(request,reply)=>{try{return await handler(request);}catch(error){return reply.code(400).send({error:error instanceof z.ZodError?'Invalid media analysis request.':error.message});}};
  app.post('/api/projects/:id/analyze',endpoint(async({params,body})=>{
    const value=z.object({provider:z.enum(['youtube','frames']),referenceIds:z.array(z.string().max(100)).min(1).max(8),notes:notesSchema,shareMedia:z.literal(true)}).strict().parse(body);
    ensureEditable(params.id);const project=getProject(params.id);
    if(!runtime.isActive())throw new Error('Start or resume a planning/Realm session before analysis.');
    const references=value.referenceIds.map(id=>project.references.find(reference=>reference.id===id));
    if(references.some(reference=>!reference))throw new Error('Unknown reference.');
    if(value.provider==='youtube'&&(references.length!==1||references[0].type!=='youtube'))throw new Error('Choose exactly one public YouTube reference.');
    if(value.provider==='frames'&&(references.some(reference=>!['image','video'].includes(reference.type))||references.filter(reference=>reference.type==='video').length>1))throw new Error('Choose up to seven images and one uploaded video, or up to eight images.');
    const provider=value.provider==='youtube'?'gemini':'codex';
    const status=value.provider==='youtube'?await credentials.status():null;
    if(status&&!status.configured)throw new Error('Connect a Google AI Studio key below before direct YouTube analysis.');
    if(status&&store.get('videoRemoteJobs').some(job=>!['completed','cancelled'].includes(job.status)))throw new Error('A previous Google video job needs attention before another starts.');
    ensureEditable(project.id);
    inFlight.add(project.id);put({...getProject(project.id),analysisStatus:'analyzing',analysisError:null});
    try{
      let sampling=null;
      const result=await context.orchestrator.referenceRequest({provider,model:status?.model,purpose:'source-analysis',request:async options=>{
        if(value.provider==='youtube'){options.onModel(status.model);return youtube({url:references[0].url,notes:value.notes,credentials,signal:options.signal,onRemoteJob:job=>store.put('videoRemoteJobs',{...job,projectId:project.id,at:new Date().toISOString()})});}
        async function attach(index,frames=[]){
          if(index===references.length){
            sampling=frames.map(frame=>({referenceId:frame.referenceId,seconds:frame.seconds}));
            return vision({prompt:analysisPrompt(value.notes)+`\nAttached images in order: ${JSON.stringify(sampling)}. Only sampled visuals are supplied, no audio.`,images:frames.map(frame=>frame.path),schema:analysisOutputSchema},options);
          }
          return withReferenceFrames(references[index],context.dataDir||store.directory,options.signal,sample=>attach(index+1,[...frames,...sample.frames.map(frame=>({...frame,referenceId:references[index].id}))]));
        }
        return attach(0);
      }});
      const report=validateAnalysis(result.report||result.data);
      const analysis={...report,id:randomUUID(),referenceIds:value.referenceIds,provider,model:result.model,at:new Date().toISOString(),sampling,coverage:value.provider==='youtube'?'Provider processed the public video and available audio. Sampling can miss fast details.':'Sampled uploaded visuals only; no audio transcription.',sourceRevision:getProject(project.id).revision};
      return put({...getProject(project.id),sourceAnalysis:analysis,analysisStatus:report.sourceAccessible?'analyzed':'unavailable',analysisError:null});
    }catch(error){put({...getProject(project.id),analysisStatus:'error',analysisError:error.message});throw error;}finally{inFlight.delete(project.id);publish();}
  }));
  app.post('/api/projects/:id/reconstruct',endpoint(async({params,body})=>{
    const value=z.object({analysisId:z.string(),notes:notesSchema,acceptUncertainty:z.literal(true)}).strict().parse(body);
    ensureEditable(params.id);const project=getProject(params.id),analysis=project.sourceAnalysis;
    if(!analysis?.sourceAccessible||analysis.id!==value.analysisId)throw new Error('Analyze accessible source visuals first and review the current report.');
    if(!runtime.isActive())throw new Error('Start or resume the companion before reconstruction.');
    inFlight.add(project.id);put({...project,analysisStatus:'reconstructing',analysisError:null});
    try{
      const result=await context.orchestrator.referenceRequest({provider:'codex',purpose:'source-reconstruction',request:options=>vision({prompt:reconstructionPrompt({analysis,version:project.version,notes:value.notes}),schema:reconstructionSchemaFor(project.version,analysis,value.notes)},options)});
      const blueprint=expandReconstruction(result.data,project.version);
      assertSourceDimensions(blueprint,analysis);
      const current=getProject(project.id),revised=reviseProject(current,blueprint);
      return saveRevision({...revised,sourceAnalysis:analysis,analysisStatus:'reconstructed',reconstruction:{analysisId:analysis.id,revision:revised.revision,at:new Date().toISOString(),exactSource:false,materialComparison:compareSourceMaterials(revised.materials,analysis)},assignments:assistedAssignments(revised.materials.raw),splitStrategy:'shared-with-player-hard-materials'});
    }catch(error){put({...getProject(project.id),analysisStatus:'error',analysisError:error.message});throw error;}finally{inFlight.delete(project.id);publish();}
  }));
}
