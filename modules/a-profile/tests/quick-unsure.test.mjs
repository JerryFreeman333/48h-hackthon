import test from 'node:test';
import assert from 'node:assert/strict';
import {completeUnknownTopics} from '../src/ui/quick-unsure.mjs';
import {topics} from '../src/needs/catalog.mjs';
test('explicit unsure shortcut preserves selected answers, hard conditions and earlier pages without mutating input',()=>{
 const data={answers:{'growth.priority':'priority','growth.details':['learning'],'growth.policy':null,'pay.priority':'secondary'},conditions:[{key:'min_fixed_monthly_salary',value:15000,strength:'hard'}]};
 const before=structuredClone(data),next=completeUnknownTopics(data,topics);
 assert.deepEqual(data,before);assert.equal(next.answers['growth.priority'],'priority');assert.deepEqual(next.answers['growth.details'],['learning']);assert.equal(next.answers['growth.policy'],'unsure');assert.equal(next.answers['pay.priority'],'secondary');assert.deepEqual(next.conditions,data.conditions);assert.deepEqual(next.answers['hours.details'],['unsure']);
 const later=completeUnknownTopics(data,topics,2);assert.equal(later.answers['growth.policy'],null);assert.equal(later.answers['pay.details'],undefined);
});
