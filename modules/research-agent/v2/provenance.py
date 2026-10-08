"""Adapted from MARA verify_bundle.py, MIT, Aditya Mhaske (2026).

Upstream a887720b4621b9c0b116c0b6cccbe9aee682be36. Modified for X-Ray's
document/table/claim schema: no Pydantic dependency or human-approval gate.
Integrity is structural; scope/negation/time checks are separate in analysis.py.
See licenses/MARA-MIT.txt and docs/agent-v2/REUSE_MANIFEST.md.
"""
from __future__ import annotations
from dataclasses import dataclass
from .parsers import content_hash


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ''


def check_evidence_integrity(documents):
    # Adaptation of MARA _check_evidence_integrity; normalized full-document hashes.
    bad=[]
    for document in documents:
        if document['content_hash']!=content_hash(document['text']):
            bad.append(document['id'])
    return CheckResult('evidence_integrity',not bad,', '.join(bad))


def valid_quote(fact,doc):
    locator=fact.get('locator',{})
    if locator.get('table') is not None:
        table=next((t for t in doc.get('tables',[]) if t['table']==locator['table'] and t.get('physical_page')==locator.get('physical_page')),None)
        if table is None: return False
        index=locator.get('row',0)-1
        col=locator.get('column',0)-1
        if not 0<=index<len(table['rows']): return False
        row=table['rows'][index]
        if not 0<=col<len(row) or ' | '.join(row)!=fact['quote']: return False
        from .analysis import number
        return number(row[col]) is not None and str(number(row[col]))==fact.get('value')
    if locator.get('physical_page') is not None:
        page=next((p for p in doc.get('pages',[]) if p['physical_page']==locator['physical_page']),None)
        return page is not None and bool(fact['quote']) and fact['quote'] in page['text']
    if locator.get('paragraph') is not None:
        para=next((p for p in doc.get('paragraphs',[]) if p['paragraph']==locator['paragraph']),None)
        return para is not None and bool(fact['quote']) and fact['quote'] in para['text']
    return False


def validate_snapshot(documents,facts,company_id):
    index={d['id']:d for d in documents}
    integrity=check_evidence_integrity(documents)
    errors=[] if integrity.passed else ['evidence_hash_mismatch']
    if len(index)!=len(documents): errors.append('duplicate_evidence_id')
    if len({f['id'] for f in facts})!=len(facts): errors.append('duplicate_fact_id')
    for fact in facts:
        doc=index.get(fact['evidence_id'])
        if not doc: errors.append('missing_evidence'); continue
        if fact['company_id']!=company_id or doc['company_id']!=company_id: errors.append('subject_mismatch')
        if not valid_quote(fact,doc): errors.append('quote_or_locator_mismatch')
        if fact.get('job_id') and fact.get('job_id')!=doc.get('job_id'): errors.append('job_scope_mismatch')
    return sorted(set(errors))
