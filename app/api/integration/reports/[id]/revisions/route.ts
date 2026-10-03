import {assertLocalRequest,getAHost,readJson,integrationError} from "@/packages/integration/a-host";
import {getDemoFlow} from "@/packages/integration/demo-flow";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){
 try {assertLocalRequest(request);const {id}=await params,a=getAHost(),owner=a.owner(request),context=getDemoFlow().revisionContext(owner,id);
 const sessions=a.service.bootstrap(owner).sessions.map((s:any)=>a.service.get(owner,s.id)).filter((s:any)=>s.profileId===context.profileId&&s.projectId===context.projectId&&s.mode===context.mode);
 return Response.json({...context,sessionId:sessions[0]?.id??null,choices:sessions.flatMap((s:any)=>s.confirmedRevisions.filter((r:number)=>r>context.profileRevision).map((revision:number)=>({sessionId:s.id,revision})))},{headers:{"cache-control":"no-store"}});
 } catch(error){return integrationError(error);}
}
export async function POST(request:Request,{params}:Context){
 try{assertLocalRequest(request);const {id}=await params,body=await readJson(request);if(typeof body.sessionId!=="string"||typeof body.revision!=="number"||!Number.isInteger(body.revision)||body.revision<1)throw Error("请选择已确认需求版本");const a=getAHost(),owner=a.owner(request);return Response.json(await getDemoFlow().reanalyze(owner,id,a.service.export(owner,body.sessionId,body.revision)),{headers:{"cache-control":"no-store"}});
 }catch(error){return integrationError(error);}
}
