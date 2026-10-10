import {z} from 'zod';
import type {CandidateBundle} from '../../../packages/contracts';
import {validateV3Snapshot,type V3Snapshot} from '../v3-contract';
import {executeXmind} from './execution';
export const reviewInput=z.strictObject({reviewId:z.string().min(1).max(160),state:z.enum(['human_reviewed','dismissed','deferred']),decision:z.string().trim().min(1).max(3000)});
export function recordXmindReview(previous:V3Snapshot,bundle:CandidateBundle,raw:unknown){
 const data=reviewInput.parse(raw),s=structuredClone(previous),review=s.reviews.find(r=>r.id===data.reviewId);
 if(!review)throw Object.assign(Error('该复核任务不属于报告'),{status:404});
 Object.assign(review,{state:data.state,decision:data.decision,updatedAt:new Date().toISOString(),reason:'用户主动记录复核结果；此记录不独立认证来源，不自动修改问题结论'});
 s.xmind=executeXmind(s,bundle);s.xmind.updates.push({kind:'review',evidenceIds:review.claimIds.flatMap(id=>s.claims.filter(c=>c.id===id).map(c=>c.evidenceId)),reason:review.reason,at:review.updatedAt});
 return validateV3Snapshot(s,bundle);
}
