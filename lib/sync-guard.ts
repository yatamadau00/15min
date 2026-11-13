// A read may update the UI only if no newer read or write superseded it.
export function createSyncGuard() {
 let generation=0, sequence=0, writes=0;
 return {
  read:()=>writes?null:{generation,sequence:++sequence},
  accepts:(ticket:{generation:number;sequence:number}|null)=>!!ticket&&!writes&&ticket.generation===generation&&ticket.sequence===sequence,
  write:()=>{
   writes++;generation++;let finished=false;
   return ()=>{if(!finished){finished=true;writes--;generation++;}};
  },
 };
}
