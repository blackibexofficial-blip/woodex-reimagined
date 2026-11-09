import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidLeadHitCount,resolveIntakePolicy} from './intake-policy.mjs';

test('unset mode and explicit legacy preserve the legacy posture',()=>{
  assert.deepEqual(resolveIntakePolicy(undefined,undefined),{ok:true,mode:'legacy'});
  assert.deepEqual(resolveIntakePolicy('legacy',undefined),{ok:true,mode:'legacy'});
  assert.deepEqual(resolveIntakePolicy('legacy','test'),{ok:true,mode:'legacy'});
});
test('strict requires a nonblank secret',()=>{
  for(const s of [undefined,'','   ','\t']) assert.deepEqual(resolveIntakePolicy('strict',s),{ok:false});
  assert.deepEqual(resolveIntakePolicy('strict','synthetic'),{ok:true,mode:'strict'});
});
test('unknown, blank, padded, and case-mismatched explicit modes fail closed',()=>{
  for(const mode of ['', ' ', 'Strict', ' strict', 'strict ', '1', 'false', 'disabled']) {
    assert.deepEqual(resolveIntakePolicy(mode,'synthetic'),{ok:false},JSON.stringify(mode));
  }
});
test('strict limiter count must be a positive safe integer',()=>{
  for(const v of [null,undefined,'1',0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,{},[]]) assert.equal(isValidLeadHitCount(v),false,String(v));
  for(const v of [1,20,21,Number.MAX_SAFE_INTEGER]) assert.equal(isValidLeadHitCount(v),true,String(v));
});
