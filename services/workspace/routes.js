import { z } from 'zod';

export function registerWorkspaceRoutes(app,service) {
  app.get('/api/games',async()=>({games:service.registry.list(),selectedGameId:'minecraft-survival'}));
  app.post('/api/workspace/game',async({body})=>{
    const {gameId}=z.object({gameId:z.string().min(1).max(80)}).strict().parse(body);
    const descriptor=service.registry.get(gameId).descriptor;
    if(!descriptor.playable)throw Object.assign(new Error('This is a development fixture, not a playable game.'),{statusCode:409});
    return {selectedGameId:descriptor.id,game:descriptor};
  });
  app.post('/api/workspace/assistance/:id',async({params,body})=>{
    const id=z.string().min(1).max(300).parse(params.id);
    const response=z.object({action:z.enum(['player','companion','replan','defer']),revision:z.number().int().min(0)}).strict().parse(body);
    return service.respond(id,response);
  });
  app.post('/api/workspace/tasks/:id',async({params,body})=>{
    const id=z.string().uuid().parse(params.id);
    const update=z.object({action:z.enum(['claim','transfer','defer','prioritize','cancel']),revision:z.number().int().min(0)}).strict().parse(body);
    return service.manageTask(id,update);
  });
  app.addHook('onClose',async()=>service.close());
}
