import {test} from 'node:test';import assert from 'node:assert/strict';import {RequestQueue} from '../src/background/request-queue';
test('queue bounds concurrency and rejects waiting work on settings changes',async()=>{
  const q=new RequestQueue(2,2);let active=0,max=0;const releases:Array<()=>void>=[];
  const task=()=>q.run(async()=>{active++;max=Math.max(max,active);await new Promise<void>(r=>releases.push(r));active--;return 1;});
  const a=task(),b=task(),c=task(),d=task();const rejected=Promise.allSettled([c,d]);
  await assert.rejects(task(),/busy/);q.clear();assert.equal((await rejected).every(r=>r.status==='rejected'),true);
  releases.forEach(r=>r());await Promise.all([a,b]);assert.equal(max,2);
});
