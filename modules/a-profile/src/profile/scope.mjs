// Read projections keep original historical snapshots intact in private storage.
import {projectSelectionDraft,projectV1Choices,selectionVersion} from './selections.mjs';
export const FLOW_VERSION='personality-needs-1';
export const emptyBackground=()=>({education:null,major:null,skills:[],experiences:[]});
export function hasBackground(x){return x&&Object.entries(x).some(([k,v])=>['skills','experiences'].includes(k)?Array.isArray(v)&&v.length:v!==null&&v!==undefined&&v!=='');}
export const cleanV1Draft=d=>Object.fromEntries(Object.entries(d??{}).filter(([k])=>['questionPage','goals','industryTags','roleTypes','cities','salary','preferences','imported'].includes(k)));
export function publicV1Attempt(a){const {owner,...out}=structuredClone(a);out.draft=projectV1Choices(cleanV1Draft(out.draft));return out;}
export function publicV1Profile(p){return {...structuredClone(p),background:emptyBackground()};}
function filterPersonal(container){
 const out=structuredClone(container),removed=new Set(),privateRefs=new Set();
 for(const c of [...(out.capabilities??[]),...(out.claims??[])]){privateRefs.add(c.claimId);for(const id of c.evidenceIds??[])removed.add(id);}
 let changed=true;while(changed){changed=false;
  for(const e of out.evidence??[])if(e.kind==='resume'||privateRefs.has(e.sourceRef)){if(!removed.has(e.evidenceId)){removed.add(e.evidenceId);changed=true;}}
  for(const i of out.insights??[])if(i.evidenceIds.some(id=>removed.has(id))&&!privateRefs.has(i.insightId)){privateRefs.add(i.insightId);changed=true;}
 }
 out.evidence=(out.evidence??[]).filter(e=>!removed.has(e.evidenceId));
 out.insights=(out.insights??[]).filter(i=>!privateRefs.has(i.insightId));
 if(out.uncertainties)out.uncertainties=out.uncertainties.filter(u=>u.code!=='no_confirmed_experience'&&!u.evidenceIds.some(id=>removed.has(id)));
 return out;
}
export function publicProfile(p){const out=filterPersonal(p);out.capabilities=[];return out;}
export function publicSession(s){const {owner,...out}=filterPersonal(s);delete out.claims;if(out.draft)delete out.draft.statementBuffer;if(s.flowVersion!==FLOW_VERSION)out.step=s.step>=5?s.step-1:s.step;out.flowVersion=FLOW_VERSION;if(s.selectionVersion!==selectionVersion){const d=projectSelectionDraft(out.draft);out.selectionResetRequired=out.selectionResetRequired||JSON.stringify(d)!==JSON.stringify(out.draft);out.draft=d;out.selectionVersion=selectionVersion;}return out;}
