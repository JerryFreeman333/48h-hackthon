/**
 * P4 带模型的管线包装（规格 §16 P4）。
 *
 * runMatchPipeline 保持同步纯函数（无模型路径零改动，112 项既有测试不回归）；
 * 配置模型时：先跑确定性管线 → 模型精炼（见 application/model/refine.ts）→
 * 以精炼后的 report/promptVersion/diagnostics 重建快照对象。
 * 未配置模型时行为与 runMatchPipeline 逐字节一致。
 */
import type { UserProfile, CandidateBundle, SearchIntent } from '../domain/contract.js';
import type { RunDiagnostics } from './diagnostics.js';
import type { DecisionTrace } from '../domain/trace.js';
import type { ReportScope } from '../domain/report.js';
import { runMatchPipeline, type PipelineInput, type PipelineResult, type ReportSnapshot } from './pipeline.js';
import { refineReportWithModel, type ModelRuntimeConfig } from './model/refine.js';

export async function runMatchPipelineWithModel(
  input: PipelineInput,
  model?: ModelRuntimeConfig,
): Promise<PipelineResult> {
  const deterministic = runMatchPipeline(input);
  if (!deterministic.ok || model === undefined) {
    return deterministic;
  }
  const { snapshot } = deterministic;
  const refined = await refineReportWithModel(
    deterministic.report,
    { profile: snapshot.profile as UserProfile, bundle: snapshot.bundle as CandidateBundle, diagnostics: snapshot.diagnostics },
    model,
  );

  const rebuiltSnapshot: ReportSnapshot = {
    ...snapshot,
    report: refined.report,
    diagnostics: refined.diagnostics as RunDiagnostics,
    promptVersion: refined.promptVersion,
    decisionTraces: snapshot.decisionTraces as DecisionTrace[],
    scope: snapshot.scope as ReportScope,
    intentContext: snapshot.intentContext as SearchIntent | Partial<SearchIntent>,
  };

  return { ok: true, report: refined.report, snapshot: rebuiltSnapshot };
}
