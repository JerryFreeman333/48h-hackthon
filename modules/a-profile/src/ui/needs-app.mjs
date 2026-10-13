try{
 const response=await fetch('/api/a/needs/bootstrap');
 if(!response.ok)throw new Error('暂时无法读取本地记录，请刷新后重试。');
 const boot=await response.json(),params=new URL(location.href).searchParams;
 const requested=params.get('sessionId'),fresh=params.get('new')==='1'||params.get('home')==='1';
 const target=requested&&boot.sessions.some(s=>s.id===requested)?requested:fresh?null:boot.latestSessionId;
 let session=null;
 if(target){const r=await fetch('/api/a/needs/sessions/'+encodeURIComponent(target));if(!r.ok)throw new Error('无法读取这份记录，请从历史记录重新打开。');session=await r.json();}
 // An old last-opened draft must not hide the redesigned default entry.
 // Explicit history links still open that draft in its original flow.
 if(session?.data.tradeoff||boot.features.tradeoff&&(!target||!requested&&!session?.data.tradeoff)){
  const {startTradeoff}=await import('./tradeoff-app.mjs');await startTradeoff(boot,session?.data.tradeoff?session:null);
 }else await import('./legacy-needs-app.mjs');
}catch(error){
 document.querySelector('#notice').textContent=error.message??'暂时无法读取本地记录，请刷新后重试。';
 document.querySelector('#app').textContent='已保存的记录不会被此错误覆盖。';
}