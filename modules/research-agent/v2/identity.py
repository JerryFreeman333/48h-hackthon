"""Identity clues never establish a job's signing entity."""
from __future__ import annotations
import re
import sqlite3
from pathlib import Path


def stock_identity(value: str, market: str = '') -> dict | None:
    value, market = str(value or '').strip().upper(), str(market or '').upper()
    hk = re.fullmatch(r'(?:HK[:. ]?)?(\d{1,5})(?:\.HK| HK)?', value)
    if hk and ('HK' in value or re.search(r'香港|港股|HK', market)):
        return {'market': 'HK', 'code': hk[1].zfill(5)}
    a = re.fullmatch(r'(?:(SH|SZ|BJ)[:. ]?)?(\d{6})(?:\.(SH|SS|SZ|BJ))?', value)
    if not a:
        return None
    code = a[2]
    inferred = 'SH' if code.startswith(('6',)) else 'SZ' if code.startswith(('0','3')) else 'BJ' if code.startswith(('4','8','92')) else None
    explicit = a[1] or a[3]
    explicit = 'SH' if explicit == 'SS' else explicit
    if not inferred or (explicit and explicit != inferred):
        return None
    return {'market': explicit or inferred, 'code': code}


def company_identity(source: Path, company_id: int) -> dict:
    if isinstance(company_id, bool) or not isinstance(company_id, int) or company_id <= 0:
        raise ValueError('Invalid company ID')
    with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        company = db.execute('SELECT * FROM companies WHERE id=?', (company_id,)).fetchone()
        if company is None:
            raise ValueError('Unknown company')
        business = db.execute('SELECT * FROM company_business WHERE company_id=?', (company_id,)).fetchone()
        c, b = dict(company), dict(business or {})
        legal = (b.get('legal_name') or c.get('full_name') or '').strip()
        brand = re.split(r'[/／]', c['name'])[0].strip()
        code = b.get('credit_code') or c.get('credit_code_collab') or None
        candidates = db.execute('SELECT id,full_name,credit_code_collab FROM companies WHERE full_name=?', (legal,)).fetchall() if legal else []
        other_codes = {r['credit_code_collab'] for r in candidates if r['credit_code_collab']}
        ambiguous = len(other_codes) > 1 and not code
        stock = stock_identity(b.get('stock_code') or '', b.get('listing_market') or '')
        return {'company_id': company_id, 'legal_name': legal or None, 'brand': brand,
                'aliases': list(dict.fromkeys(x for x in [legal, brand] if len(x) >= 2)),
                'credit_code': code, 'stock': stock, 'relationship': 'unknown',
                'match_status': 'ambiguous' if ambiguous or not legal else 'record_clue',
                'candidates': [dict(x) for x in candidates] if ambiguous else [],
                'job_scope': 'unconfirmed'}


def match_document(identity: dict, title: str, text: str, *, disclosure=False) -> str:
    if identity.get('match_status') == 'ambiguous':
        return 'ambiguous'
    legal, credit = identity.get('legal_name'), identity.get('credit_code')
    # Financial reports must name the issuer in the title or opening pages.
    scope_text = title + '\n' + text[:6000] if disclosure else title + '\n' + text
    codes = re.findall(r'(?:统一社会信用代码|信用代码)\s*[:：]?\s*([0-9A-Z]{18})\b', scope_text)
    if credit and codes and credit not in codes:
        return 'conflict'
    # A subsidiary's title is not an exact parent match just because it shares a prefix.
    title_companies = re.findall(r'[\u4e00-\u9fffA-Za-z（）()]{2,60}?(?:股份有限公司|有限责任公司|有限公司)', title)
    if legal and title_companies and all(legal != n for n in title_companies):
        return 'other_subject'
    if credit and credit in codes:
        return 'credit_code_match'
    if legal and legal in scope_text:
        return 'legal_name_match'
    if not disclosure and any(alias in scope_text for alias in identity.get('aliases', []) if len(alias) >= 2):
        return 'alias_only'
    return 'unresolved'


def identity_key(identity: dict) -> str:
    return '|'.join(str(identity.get(k) or '') for k in ('company_id','legal_name','credit_code'))
