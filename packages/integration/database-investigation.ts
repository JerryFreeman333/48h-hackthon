import type {CandidateBundle} from '../contracts';
import {annotateEvidenceTopics,needSignals} from './evidence-topics';
export {needSignals} from './evidence-topics';
/** Legacy database facts stay compatible. Agent passages are consumed directly. */
export function extractNeedLeads(bundle:CandidateBundle){
 for(const evidence of bundle.evidence){
  annotateEvidenceTopics(evidence);
  if(evidence.sourceType.startsWith('franklin_'))continue;
  for(const link of evidence.topicLinks??[])for(const detail of link.detailIds){
   const key=link.topicId+'.'+detail,factId=evidence.evidenceId+'-needs-'+key.replace('.','-');
   if(bundle.facts.some(f=>f.factId===factId))continue;
   bundle.facts.push({factId,companyId:evidence.companyId,jobId:evidence.jobId,key:'needs.'+key,value:link.quotes.join(' '),status:evidence.verification==='disputed'?'conflicting':'unknown',evidenceIds:[evidence.evidenceId],asOf:evidence.publishedAt});
  }
 }
}
