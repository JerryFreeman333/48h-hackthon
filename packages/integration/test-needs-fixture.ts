import type { createAHost } from './a-host';

/** Test users explicitly complete the current opportunity/industry/role step. */
export function requiredNeedsData(data: any) {
  const selected = structuredClone(data);
  selected.stageId = null;
  if (!selected.goalIds.some((id: string) => ['find_internship', 'find_first_job', 'change_job'].includes(id))) selected.goalIds.unshift('find_first_job');
  if (!selected.industryTags.length) selected.industryTags = ['software_it'];
  if (!selected.roleTypes.length) selected.roleTypes = ['product_operations'];
  return selected;
}

export function createSelectedNeeds(service: ReturnType<typeof createAHost>['service'], owner: string, options: { mode: 'manual' | 'demo' }) {
  const draft = service.create(owner, options);
  return service.update(owner, draft.id, { expectedRevision: draft.revision, questionnaireVersion: draft.questionnaireVersion, step: 8, data: requiredNeedsData(draft.data) });
}
