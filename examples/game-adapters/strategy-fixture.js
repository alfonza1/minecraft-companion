// A non-playable contract fixture. No game client, model, network or automation.
export const strategyFixture = {
  descriptor: {apiVersion:1,id:'strategy-fixture',name:'Strategy contract fixture',status:'test-fixture',playable:false,capabilities:['Observe synthetic resources'],requirements:['Developer tests only'],widgets:['resource-counts'],actions:[],safety:['No gameplay execution']},
  project(state) {
    return {schemaVersion:1,game:structuredClone(this.descriptor),session:{id:'fixture',gameId:'strategy-fixture',status:'fixture',connected:false,observedAt:null,stale:true},
      companion:{name:'Test observer',status:'idle'},activity:{state:'idle',label:'Development fixture',detail:'Synthetic strategy observations; no supported second game.',tool:null,progress:null,next:[]},
      mission:null,resources:(state.stock||[]).map(item=>({id:item.id,kind:'raw',projectId:'fixture',projectName:'Synthetic test',name:item.id,required:item.required,inventory:item.quantity,storage:0,storageObservedAt:null,reservedElsewhere:0,verifiedPlaced:0,remainingToPlace:item.required,availableForProject:item.quantity,missing:Math.max(0,item.required-item.quantity),userAssigned:0,agentAssigned:0,userReported:0,agentAllocated:0,source:'test-fixture',difficulty:'unknown',reason:'Development-only data',gathering:false})),
      assistance:[],tasks:[],environment:{position:null,dimension:null,health:null,food:null,observedAt:null},storage:[]};
  },
};
