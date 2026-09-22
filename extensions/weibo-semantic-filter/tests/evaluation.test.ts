import {test} from 'node:test';import assert from 'node:assert/strict';import {evaluate} from '../src/shared/evaluation';import type{FeedbackRow}from'../src/storage/local';
test('empty predictions and unlabelled data cannot pass release evaluation',()=>{
  assert.equal(evaluate([]).readyForReview,false);assert.equal(evaluate([]).collapsePrecision.rate,null);
  const row={id:'1',contentHash:'x',sessionId:'one',label:'KEEP',decision:{state:'visible'},thresholds:{}} as FeedbackRow;
  assert.equal(evaluate([row,row]).labeled,1);assert.equal(evaluate([row]).thresholdsMet,false);
});
