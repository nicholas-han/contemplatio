import {QUEUE_WAIT_MS} from '../shared/request-budget';
export class RequestQueue {
  private active=0;private pending:Array<{run:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}> = [];
  constructor(private concurrency=2,private maxPending=24){}
  run<T>(task:()=>Promise<T>):Promise<T>{
    if(this.pending.length>=this.maxPending)return Promise.reject(Error('busy'));
    return new Promise((resolve,reject)=>{
      const execute=()=>{this.active++;task().then(resolve,reject).finally(()=>{this.active--;const next=this.pending.shift();if(next){clearTimeout(next.timer);next.run();}});};
      if(this.active<this.concurrency)execute();
      else {const item={run:execute,reject,timer:setTimeout(()=>{const index=this.pending.indexOf(item);if(index>=0)this.pending.splice(index,1);reject(Error('busy'));},QUEUE_WAIT_MS)};this.pending.push(item);}
    });
  }
  clear(){for(const item of this.pending){clearTimeout(item.timer);item.reject(Error('cancelled'));}this.pending=[];}
}
