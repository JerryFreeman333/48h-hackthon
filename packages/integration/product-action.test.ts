import {feedbackQuestions,createVerificationNote} from "./verification-feedback";
import test from "node:test";
import assert from "node:assert/strict";
import fixture from "../contracts/fixtures/match-report.json";
import type {MatchReport} from "../contracts";
import type {NeedsResponse} from "./job-needs";
import {productActions,applyProductActions} from "./product-action";
test("unknown confirmed constraints and verify-first needs block explore without changing core report",()=>{
 const report=structuredClone(fixture) as MatchReport;
 report.results[0].recommendation="explore";report.results[0].constraints=[];
 const needs={candidates:[{jobId:report.results[0].jobId,items:[{requiresAction:true,topicId:"growth",itemId:"learning"}]}]} as NeedsResponse;
 const old=structuredClone(report);assert.equal(productActions(report,needs)[0].recommendation,"verify_first");assert.deepEqual(report,old);
 needs.candidates[0].items[0].requiresAction=false;assert.equal(productActions(report,needs)[0].recommendation,"explore");
 report.results[0].constraints=[{key:"city",result:"unknown",factIds:[]}];assert.equal(productActions(report,needs)[0].recommendation,"verify_first");
 report.results[0].recommendation="deprioritize";needs.candidates[0].items[0].requiresAction=true;assert.equal(productActions(report,needs)[0].recommendation,"deprioritize");
 report.results[0].recommendation="insufficient";assert.equal(productActions(report,needs)[0].recommendation,"insufficient");
});

test("manual hard conflict takes question priority without mutating evidence or core view",()=>{
 const vm={meta:{mode:"manual"},candidates:[{jobId:"j",recommendation:"deprioritize",actionLabel:"暂缓",actionNote:"存在可信硬冲突",constraints:[{key:"accept_sales_kpi",result:"fail"}]}],summary:{action:{jobId:"j"},primaryQuestion:{text:"薪资是多少",resolves:["salary"]}}};
 const before=structuredClone(vm),actions=[{jobId:"j",recommendation:"deprioritize",unknownHard:[],mustAsk:["growth.learning"]}];
 const shown=applyProductActions(vm as any,actions as any);assert.deepEqual(vm,before);assert.equal(shown.candidates[0].recommendation,"deprioritize");assert.match(shown.summary.action!.actionNote,/你提供的岗位描述/);assert.match(shown.summary.primaryQuestion!.text,/销售签单指标/);assert.deepEqual(shown.summary.primaryQuestion!.resolves,["accept_sales_kpi"]);
 vm.meta.mode="demo";assert.equal(applyProductActions(vm as any,actions as any).candidates[0].actionNote,"存在可信硬冲突");
});

test("hard conflict first question can be recorded but cannot be marked verified by the user",()=>{
 const record={report:{results:[{jobId:"job-a",constraints:[{key:"accept_sales_kpi",result:"fail"}],questions:[]}]},inputs:{bundle:{jobs:[{jobId:"job-a",title:"待核实销售岗位"}]}}} as any;
 const questions=feedbackQuestions(record);assert.match(questions[0].text,/销售签单指标/);assert.deepEqual(questions[0].targets,["accept_sales_kpi"]);const note=createVerificationNote(record,{questionId:questions[0].id,answer:"对方称指标可调整，待书面核实",verification:"verified"});assert.equal(note.verification,"user_provided_unverified");assert.equal(record.report.results[0].constraints[0].result,"fail");
});
