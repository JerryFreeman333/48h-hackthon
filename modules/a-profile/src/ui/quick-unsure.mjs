// Explicit user shortcut. Existing selections and conditions retain their meaning.
export function completeUnknownTopics(data,topics,startIndex=0){
 const next=structuredClone(data);
 for(const topic of topics.slice(startIndex))for(const q of topic.questions){
  if(next.answers[q.id]===null||next.answers[q.id]===undefined)next.answers[q.id]=q.kind==='multiple'?['unsure']:'unsure';
 }
 return next;
}
