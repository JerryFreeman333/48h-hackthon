import {assertLocalRequest,getAHost,integrationError} from '@/packages/integration/a-host';
import {ResearchService} from '@/modules/b-research/research-service';
import {describe} from '@/modules/a-profile/src/needs/service.mjs';
import {conditionLabels,conditionText} from '@/modules/a-profile/src/profile/selections.mjs';
import {industries,roles} from '@/modules/a-profile/src/taxonomy.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  assertLocalRequest(request);
  const url=new URL(request.url),sessionId=url.searchParams.get('sessionId'),revision=Number(url.searchParams.get('revision'));
  if(!sessionId||!Number.isInteger(revision)||revision<1)throw Error('请选择已确认的用户侧写版本');
  const a=getAHost(),owner=a.owner(request),input=a.service.export(owner,sessionId,revision);
  if(input.UserProfile.mode!=='manual')throw Error('请使用自己确认的用户侧写，演示需求不进入正式调查');
  // Use B's actual disconnected-provider path; never substitute demo fixtures or personal JD inputs.
  const {bundle}=new ResearchService().createResearchRun({...input.SearchIntent,mode:'live'});
  return Response.json({sessionId,revision,goals:input.UserProfile.goals,
   industries:input.SearchIntent.industryTags.map((id:string)=>industries.find((x:any)=>x.id===id)?.name??id),
   roles:input.SearchIntent.roleTypes.map((id:string)=>roles.find((x:any)=>x.id===id)?.name??id),
   conditions:input.UserProfile.preferences.map((c:any)=>({label:conditionLabels[c.key as keyof typeof conditionLabels],text:conditionText(c),strength:c.strength})),
   topics:describe(input.JobNeedsSnapshot),candidateCount:bundle.jobs.length,
   coverage:bundle.coverage.map(c=>({topic:c.topic,status:c.status,reason:c.reason}))
  },{headers:{'cache-control':'no-store'}});
 }catch(error){return integrationError(error);}
}
