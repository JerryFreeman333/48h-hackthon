// Uses SurveyJS Form Library (MIT). No question generation, translation, or scoring.
export function mountSurvey(container,bank,attempt,onChange,onComplete){
 if(!globalThis.Survey?.Model)throw new Error('SurveyJS 未加载，请先执行 npm ci');
 const model=new Survey.Model({locale:'en',showProgressBar:'top',progressBarType:'questions',showQuestionNumbers:'on',showCompletedPage:false,completeText:'查看兴趣结果',pageNextText:'下一页',pagePrevText:'上一页',pages:Array.from({length:6},(_,i)=>({name:`page-${i}`,elements:bank.questions.slice(i*5,i*5+5).map(q=>({type:'radiogroup',name:q.id,title:q.originalText,isRequired:true,choices:q.options.map(o=>({value:o.value,text:o.text}))}))}))});
 model.data=Object.fromEntries(Object.entries(attempt.answers).filter(([,v])=>v!==null));
 model.currentPageNo=Math.max(0,Math.min(5,attempt.draft.questionPage??0));
 model.onValueChanged.add(()=>onChange());model.onCurrentPageChanged.add(()=>onChange());
 model.onCompleting.add((_,options)=>{options.allowComplete=false;onComplete();});
 model.render(container);
 return {capture(){return {answers:Object.fromEntries(bank.questions.filter(q=>Number.isInteger(model.data[q.id])).map(q=>[q.id,model.data[q.id]])),page:model.currentPageNo};},dispose(){model.dispose();}};
}
