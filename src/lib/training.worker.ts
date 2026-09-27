import {Trainer,TRAINING} from './training.ts';
import {benchmark} from './benchmark.ts';
import {validModel} from './policy.ts';
self.onmessage=(event:MessageEvent)=>{
 try{
  if(event.data.type==='benchmark'){
   if(!validModel(event.data.model))throw new Error('Invalid model');
   self.postMessage({type:'benchmark',result:benchmark(event.data.model)});return;
  }
  const trainer=new Trainer(Number(event.data.seed)||20260912);
  self.postMessage({type:'initial',model:trainer.champion});
  const run=()=>{
   try{
    const progress=trainer.step();self.postMessage({type:'progress',progress});
    if(trainer.generation<TRAINING.generations)setTimeout(run,30);
    else self.postMessage({type:'complete'});
   }catch(error){self.postMessage({type:'error',message:String(error)});}
  };setTimeout(run,30);
 }catch(error){self.postMessage({type:'error',message:String(error)});}
};
