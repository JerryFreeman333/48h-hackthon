"""Discovery and acquisition are separate. A platform label never claims direct access."""
from __future__ import annotations
import base64
import re
from dataclasses import dataclass
from urllib.parse import quote_plus, urlsplit, parse_qs, urljoin
from bs4 import BeautifulSoup
from .parsers import clean
from .transport import canonical_url, SourceError

PLATFORMS = {
    'tianyancha':('天眼查','tianyancha.com','credit'),
    'qixin':('启信宝','qixin.com','credit'),
    'qcc':('企查查','qcc.com','credit'),
    'xiaohongshu':('小红书','xiaohongshu.com','community'),
    'zhihu':('知乎','zhihu.com','community'),
    'weibo':('微博','weibo.com','community'),
    'maimai':('脉脉','maimai.cn','community'),
}
CHANNEL_LABELS={'credit':'企业信用','disclosure':'企业披露','recruitment_procurement':'招聘与采购','community':'社区经历'}


@dataclass(frozen=True)
class PublicPlatformAdapter:
    key: str
    label: str
    domain: str
    channel: str

    def query(self, identity, terms):
        return '"'+(identity.get('legal_name') or identity['brand'])+'" '+terms+' site:'+self.domain

    def discover(self, search, identity, terms, provider='360'):
        hits=search.discover(self.query(identity,terms),provider)
        return [h for h in hits if (urlsplit(h['url']).hostname or '')==self.domain or (urlsplit(h['url']).hostname or '').endswith('.'+self.domain)]


PLATFORM_ADAPTERS={key:PublicPlatformAdapter(key,*values) for key,values in PLATFORMS.items()}


def platform_for(url):
    host=urlsplit(url).hostname or ''
    return next((key for key,(_,domain,_) in PLATFORMS.items() if host==domain or host.endswith('.'+domain)),host)


def _result_url(href, base):
    url=urljoin(base,href)
    p=urlsplit(url)
    # Decode documented outbound redirect representations; never fabricate a source URL.
    if p.hostname and p.hostname.endswith('bing.com') and p.path.startswith('/ck/a'):
        encoded=parse_qs(p.query).get('u',[''])[0]
        if encoded.startswith('a1'):
            try: url=base64.urlsafe_b64decode(encoded[2:]+'='*((-len(encoded[2:]))%4)).decode('utf-8')
            except Exception: raise SourceError('parse_error','search','unresolved_source_url')
    return canonical_url(url)


def parse_search(body: bytes, url: str, provider: str) -> list[dict]:
    soup=BeautifulSoup(body,'html.parser')
    title=clean(soup.title.get_text() if soup.title else '')
    visible=soup.get_text(' ',strip=True)
    if re.search(r'验证码|安全验证|访问验证|Access Denied|Just a moment',title,re.I) or re.search(r'请输入验证码|请完成.{0,12}验证|verify you are human',visible,re.I):
        raise SourceError('blocked','search','verification_page')
    selectors=['li.b_algo'] if provider=='bing' else ['li.res-list','li.res-list2','li.res-rich','div.res-list']
    cards=[]
    for selector in selectors: cards+=soup.select(selector)
    hits=[]
    for card in cards:
        heading=card.select_one('h2 a[href], h3 a[href], .res-title a[href]')
        if not heading: continue
        try: target=_result_url(str(heading.get('data-mdurl') or heading.get('data-cache') or heading['href']),url)
        except SourceError: continue
        host=urlsplit(target).hostname or ''
        if any(host==root or host.endswith('.'+root) for root in ('bing.com','so.com')):
            continue
        snippet_node=card.select_one('.b_caption p, .b_snippet, .res-desc, .res-summary, .res-comm-con')
        snippet=clean(snippet_node.get_text(' ',strip=True) if snippet_node else card.get_text(' ',strip=True))
        if not snippet: continue
        hits.append({'url':target,'title':clean(heading.get_text(' ',strip=True)),'snippet':snippet[:4000],
            'published_at':None,'platform':platform_for(target),'discovery_url':url,'provider':provider})
    if not hits and not re.search(r'没有找到|未找到相关|找不到与|没有相关结果|No results found|There are no results',visible,re.I):
        raise SourceError('parse_error','search','unrecognized_results_or_unresolved_urls')
    return hits


class SearchAdapter:
    def __init__(self, fetcher):
        self.fetcher=fetcher

    def discover(self, query, provider='bing'):
        url=('https://cn.bing.com/search?q=' if provider=='bing' else 'https://www.so.com/s?q=')+quote_plus(query)
        response=self.fetcher.fetch(url)
        return parse_search(response.body,response.url,provider)


def channel_queries(identity):
    name=identity.get('legal_name') or identity['brand']
    brand=identity['brand']
    stock=identity.get('stock') or {}
    disclosure_target='"'+name+'" '+(stock.get('code') or '')
    disclosures=[f'{disclosure_target.strip()} 年度报告 财务报告 filetype:pdf']
    if stock.get('market') in ('SH','SZ','BJ'):
        disclosures.insert(0,f'{disclosure_target.strip()} 年度报告 site:static.cninfo.com.cn')
    elif stock.get('market')=='HK':
        disclosures.insert(0,f'{disclosure_target.strip()} 年報 site:hkexnews.hk')
    return {
        'disclosure':disclosures,
        'credit':[f'"{name}" 统一社会信用代码 行政处罚'],
        'recruitment_procurement':[f'"{name}" 招聘 工资 工作时间',f'"{name}" 员工 食堂 采购 公告'],
        'community':[PLATFORM_ADAPTERS['zhihu'].query({'brand':brand},'员工 工作 体验'),PLATFORM_ADAPTERS['maimai'].query({'brand':brand},'工作 体验')],
    }


def capability_matrix(attempts):
    matrix=[]
    for key,(label,domain,channel) in PLATFORMS.items():
        rows=[a for a in attempts if a.get('platform')==key]
        body=any(a['status']=='ok' and a.get('access_mode')=='html' for a in rows)
        index=any(a['status']=='ok' and a.get('access_mode')=='index_snippet' for a in rows)
        matrix.append({'platform':key,'label':label,'channel':channel,'domain':domain,
            'capability':'direct_public' if body else 'index_only' if index else 'not_verified',
            'direct_status':next((a['status'] for a in reversed(rows) if a.get('stage')!='search' and a.get('access_mode')!='index_snippet'),'not_attempted'),
            'configured_api':False,'login_used':False,'reason':'公开正文已取得' if body else '仅搜索索引摘要' if index else '本次未验证可用；可经公开搜索发现，未配置专有接口。'})
    return matrix
