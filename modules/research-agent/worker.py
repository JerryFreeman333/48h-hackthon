"""Bounded JSON tools for Franklin. Never call its mutating lookup/selftest entrypoints."""
from __future__ import annotations
import concurrent.futures
import contextlib
import hashlib
import io
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

TOPICS = {
    'growth': ('晋升 培训', r'晋升|升职|培训|带教|职级'),
    'pay': ('薪资 工资', r'薪资|工资|月薪|日薪|底薪|提成'),
    'hours': ('工时 加班 双休', r'工时|加班|双休|轮班|打卡|工作时间'),
    'benefits': ('五险一金 社保', r'五险|六险|社保|公积金|缴纳'),
    'culture': ('团队 管理 工作方式', r'团队|管理|沟通|尊重|氛围'),
    'position': ('招聘 用工 合同 裁员', r'招聘|用工|合同|裁员|外包|派遣'),
    'company': ('经营 财报 营收', r'经营|财报|营收|净利|亏损|融资|业务'),
}
ROOT = Path(__file__).resolve().parents[2]
VENDOR = Path(__file__).resolve().parent / 'vendor' / 'franklin_promax'
sys.path[:0] = [str(VENDOR / 'crawl_no_login'), str(VENDOR / 'analysis')]

def working_database(source: Path, target: Path):
    source, target = source.resolve(), target.resolve()
    allowed = (ROOT / '.data' / 'research-agent').resolve()
    if not target.is_relative_to(allowed) or target == source:
        raise ValueError('Working database must stay in ignored research-agent directory')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
            with sqlite3.connect(target) as work:
                original.backup(work)
    conn = sqlite3.connect(target, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('CREATE TABLE IF NOT EXISTS agent_evidence (id TEXT PRIMARY KEY, company_id INTEGER, topic TEXT, title TEXT, excerpt TEXT, url TEXT, source_type TEXT, published_at TEXT, collected_at TEXT, verification_original TEXT)')
    conn.execute('CREATE TABLE IF NOT EXISTS agent_facts (id TEXT PRIMARY KEY, evidence_id TEXT, company_id INTEGER, fact_key TEXT, value TEXT)')
    conn.commit()
    return conn

def company_row(conn, company_id):
    if not isinstance(company_id, int) or isinstance(company_id, bool):
        raise ValueError('Invalid company ID')
    row = conn.execute('SELECT c.id,c.name,c.full_name,c.known_listing,b.stock_code FROM companies c LEFT JOIN company_business b ON b.company_id=c.id WHERE c.id=?', (company_id,)).fetchone()
    if not row:
        raise ValueError('Company not found')
    return dict(row)

def materials(conn, company_id, topics):
    # Complete rows, with original IDs/dates/text. No arbitrary first-eight samples.
    selected = {}
    for topic in topics:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        rows = conn.execute("SELECT * FROM agent_evidence WHERE company_id=? AND topic=? AND collected_at>=? AND id LIKE 'franklin2-%' ORDER BY collected_at DESC LIMIT 4", (company_id, topic, cutoff)).fetchall()
        for row in rows:
            selected[row['id']] = dict(row)
    facts = []
    for row in selected.values():
        facts.extend(dict(f) for f in conn.execute('SELECT * FROM agent_facts WHERE evidence_id=?', (row['id'],)))
    return {'company_id': company_id, 'evidence': list(selected.values()), 'facts': facts, 'topics': topics}

def collect(conn, company, topics):
    import no_login_crawler as crawler
    crawler.TIMEOUT = 6
    # Use the supplied fetchers, with bounded response sizes and public fixed hosts.
    import urllib.request
    from urllib.parse import urlparse
    def bounded_fetch(url, *, method='GET', data=None, extra_headers=None):
        host = urlparse(url).hostname or ''
        if not any(host == h or host.endswith('.'+h) for h in ('bing.com','so.com','sogou.com','eastmoney.com','etnet.com.hk')):
            raise ValueError('Unsupported source host')
        headers = {'User-Agent': crawler.UA, 'Accept-Language': 'zh-CN,zh;q=0.9'}
        headers.update(extra_headers or {})
        request = urllib.request.Request(url, data=data.encode() if data else None, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=6) as response:
            body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError('Source response too large')
        return body.decode('utf-8', 'ignore')
    crawler._fetch = bounded_fetch
    name = company.get('full_name') or re.split(r'\s*[/／]\s*', company['name'])[0].strip()
    chinese = re.match(r'[\u4e00-\u9fff]+', company['name'])
    if chinese:
        name = chinese.group(0)
    aliases = [name, company.get('full_name') or '', *re.findall(r'[A-Za-z][A-Za-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}', name)]
    calls = [(fn, name+' '+TOPICS[t][0], t) for t in topics for fn in (crawler.fetch_bing_cn, crawler.fetch_360, crawler.fetch_sogou_wechat)]
    # Existing code is a clue only; never guess a new stock code or alter identity.
    code = None
    listing = ' '.join(str(company.get(k) or '') for k in ('known_listing','stock_code'))
    if 'company' in topics:
        code = crawler.guess_a_code(listing)
        hk = crawler.HK_CODE_RE.search(listing)
        if code:
            calls.append((crawler.fetch_eastmoney_f10, code, 'company'))
        elif hk:
            calls.append((crawler.fetch_hkex_news, hk.group(1), 'company'))
    now = datetime.now(timezone.utc).isoformat()
    attempted = len(calls)
    failures = 0
    accepted = 0
    rejected = {'missing_excerpt': 0, 'unrelated_company': 0, 'unrelated_topic': 0, 'missing_url': 0}
    source_results = []
    def fetch_one(call):
        fn, query, topic = call
        try:
            return topic, fn(query), None, fn.__name__
        except Exception:
            return topic, [], 'source_failed', fn.__name__
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for topic, hits, error, provider in pool.map(fetch_one, calls):
            source_results.append({'topic': topic, 'provider': provider, 'hits': len(hits), 'failed': bool(error), 'empty': not hits})
            if error or not hits or all(h.title == '(fetch-failed)' for h in hits):
                failures += 1
            for hit in hits[:10]:
                if not hit.title or hit.title == '(fetch-failed)' or not hit.snippet:
                    rejected['missing_excerpt'] += 1
                    continue
                text = hit.title+' '+hit.snippet
                if not any(alias and alias.casefold() in text.casefold() for alias in aliases):
                    rejected['unrelated_company'] += 1
                    continue
                # Search snippets may contain instructions or other jobs; keep company scope.
                if not re.search(TOPICS[topic][1], text):
                    rejected['unrelated_topic'] += 1
                    continue
                url = hit.url if re.match(r'^https?://', hit.url or '') else None
                if not url:
                    rejected['missing_url'] += 1
                    continue
                ident = 'franklin2-'+hashlib.sha256(f"{company['id']}|{topic}|{url}|{hit.snippet}|{now}".encode()).hexdigest()[:32]
                conn.execute('INSERT OR IGNORE INTO agent_evidence VALUES (?,?,?,?,?,?,?,?,?,?)', (ident, company['id'], topic, hit.title[:240], hit.snippet[:1200], url, hit.platform, hit.published_at, now, 'source_claimed_official' if hit.is_official else 'unverified'))
                accepted += 1
                from extractors import extract_all
                for candidate in extract_all(text):
                    # Sentiment is never a company culture fact; copied substrings stay leads.
                    if candidate.dimension == 'B3.culture':
                        continue
                    fact_id = ident+'-'+hashlib.sha256((candidate.dimension+candidate.text_match).encode()).hexdigest()[:12]
                    conn.execute('INSERT OR IGNORE INTO agent_facts VALUES (?,?,?,?,?)', (fact_id, ident, company['id'], 'agent.raw.'+candidate.dimension, candidate.text_match[:500]))
    conn.commit()
    return {**materials(conn, company['id'], topics), 'attempted_sources': attempted, 'empty_or_failed_sources': failures, 'accepted_hits': accepted, 'rejected_hits': rejected, 'source_results': source_results, 'search_name': name, 'stock_code_used': code if 'company' in topics else None, 'collected_at': now}

def handle(request):
    topics = request.get('topics')
    if not isinstance(topics, list) or not 1 <= len(topics) <= 7 or any(t not in TOPICS for t in topics):
        raise ValueError('Invalid topics')
    topics = list(dict.fromkeys(topics))
    action = request.get('action')
    if action not in ('read_company_materials', 'investigate_company_topics'):
        raise ValueError('Unknown tool')
    source = ROOT / '.data/company-database/xray-v3-20261003.sqlite'
    target = ROOT / '.data/research-agent/work.sqlite'
    with working_database(source, target) as conn:
        company = company_row(conn, request.get('company_id'))
        return materials(conn, company['id'], topics) if action == 'read_company_materials' else collect(conn, company, topics)

if __name__ == '__main__':
    try:
        request = json.loads(sys.stdin.read(8000))
        with contextlib.redirect_stdout(io.StringIO()):
            result = handle(request)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        # No raw HTTP headers, request bodies, keys or filesystem details in errors.
        print(json.dumps({'error': type(error).__name__, 'message': '调查工具未完成；保留已有资料。'}, ensure_ascii=False))
        sys.exit(1)
