export function mountBattery(container,tool,attempt,onChange,onComplete){
 if(attempt.locale!=='zh-CN')throw new Error('英语答题入口已停用，请使用中文审校入口；历史答案仍保留');
 if(!globalThis.Survey?.Model)throw new Error('SurveyJS未加载');
 const chinese=attempt.locale==='zh-CN'?tool.chineseDraft:null;
 if(attempt.locale==='zh-CN'&&(!chinese||chinese.translationVersion!==attempt.translationVersion))throw new Error('中文译稿未发布或版本不一致');
 const choices=chinese?chinese.responseScale:tool.responseScale;
 const pages=Array.from({length:Math.ceil(tool.items.length/5)},(_,i)=>({name:'p'+i,elements:tool.items.slice(i*5,i*5+5).map(q=>({type:'radiogroup',name:q.id,title:chinese?chinese.items.find(x=>x.id===q.id).chineseText:q.originalText,isRequired:true,choices:choices.map(c=>({value:c.value,text:c.text}))}))}));
 const model=new Survey.Model({locale:chinese?'zh-cn':'en',showProgressBar:'top',progressBarType:'questions',showQuestionNumbers:'on',showCompletedPage:false,pageNextText:'下一页',pagePrevText:'上一页',completeText:'保存并继续',pages});
 model.data=Object.fromEntries(Object.entries(attempt.answers).filter(([,v])=>v!==null));model.currentPageNo=Math.min(pages.length-1,attempt.page??0);
 model.onValueChanged.add(()=>onChange());model.onCurrentPageChanged.add(()=>onChange());model.onCompleting.add((_,o)=>{o.allowComplete=false;onComplete();});model.render(container);
 return {capture(){return {responses:tool.items.map(q=>({itemId:q.id,value:model.data[q.id]??null})),page:model.currentPageNo};},dispose(){model.dispose();}};
}
