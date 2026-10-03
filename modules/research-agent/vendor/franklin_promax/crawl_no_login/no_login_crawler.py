"""
无登录爬虫（对齐 CRAWL-STANDARD §1.2「免登录只能看搜索摘要」）。

四个工作源（实测可访问、零账号、零 Playwright）:
    1. 搜狗微信搜索（weixin.sogou.com）       — 公众号文章官方+HR+媒体叙事
    2. 必应中国（cn.bing.com）                 — 通用网页，命中知乎/微博/小红书/脉脉 cache
    3. 360 搜索（so.com）                      — 职友集/看准网 等聚合站
    4. 巨潮资讯网（cninfo.com.cn）              — A 股年报/公告（verified）

每个 hit 标 verification:
    - 巨潮 → verified（交易所公告/年报）
    - 其它 → unverified（搜索摘要级）
    - 命中小红书/脉脉/知乎 cache 时 source_type 字段更具体

不引入 LLM / 不引入 playwright / 不引入登录态。
"""
from __future__ import annotations

import html as _html_mod
import json
import re
import sqlite3
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import urllib.request

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "xray_hangzhou.db"
PKG_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG_ROOT))

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 20


@dataclass
class Hit:
    title: str
    snippet: str
    url: str
    platform: str
    source_website: str
    published_at: str | None
    is_official: bool = False
    extra: dict = field(default_factory=dict)


def _fetch(url: str, *, method: str = "GET", data: str | None = None,
           extra_headers: dict | None = None) -> str:
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/json,*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
    }
    if extra_headers:
        headers.update(extra_headers)
    if data:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data.encode("utf-8") if data else None,
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        raw = resp.read()
    return raw.decode("utf-8", errors="ignore")


def _strip(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    s = _html_mod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def _host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).hostname or ""
    except Exception:
        return ""


def _classify_source(url: str) -> str:
    h = _host(url)
    if "zhihu.com" in h:
        return "zhihu"
    if "weibo" in h or "weibo.cn" in h:
        return "weibo"
    if "xiaohongshu" in h or "xhslink" in h:
        return "xhs"
    if "maimai" in h:
        return "maimai"
    if "weixin" in h or "mp.weixin" in h:
        return "wechat"
    if "jobui" in h:
        return "jobui"
    if "kanzhun" in h:
        return "kanzhun"
    if "qcc.com" in h or "tianyancha" in h:
        return "qcc_tianyancha"
    if "eastmoney" in h:
        return "eastmoney"
    return f"web_{h}"


# ============================================================
# 1. 搜狗微信搜索
# ============================================================

def fetch_sogou_wechat(query: str) -> list[Hit]:
    url = (f"https://weixin.sogou.com/weixin?type=2"
           f"&query={urllib.parse.quote(query)}&ie=utf8")
    try:
        html_text = _fetch(url, extra_headers={"Referer": "https://weixin.sogou.com/"})
    except Exception as e:
        return [_err("sogou_wechat", query, str(e))]
    if len(html_text) < 5000 or "您的访问过于频繁" in html_text or "请输入验证码" in html_text:
        return [_err("sogou_wechat", query, "blocked-or-captcha")]

    out: list[Hit] = []
    # 卡片结构（已实测）:
    #   <h3><a id="sogou_vr_11002601_title_N" href="/link?url=...">TITLE</a></h3>
    #   <p class="txt-info" id="sogou_vr_11002601_summary_N">SUMMARY</p>
    #   <span class="all-time-y2">公众号名</span><span class="s2">JS-time</span>
    pattern = re.compile(
        r'<a[^>]*?id="sogou_vr_11002601_title_(\d+)"[^>]*?>(.*?)</a>'
        r'.*?<p[^>]*?id="sogou_vr_11002601_summary_\1"[^>]*?>(.*?)</p>'
        r'.*?(?:class="all-time-y2"[^>]*>([^<]+)<|class="sp-author"[^>]*>([^<]+)<)',
        re.DOTALL,
    )
    for m in pattern.finditer(html_text):
        title = _strip(m.group(2))
        snippet = _strip(m.group(3))
        account = _strip(m.group(4) or m.group(5) or "")
        if not title or not snippet:
            continue
        out.append(Hit(
            title=title[:80], snippet=snippet[:160],
            url=f"sogou://{urllib.parse.quote(title)}",
            platform="wechat_sogou", source_website=account or "微信公众号",
            published_at=None, is_official=False,
            extra={"sogou_query": query, "category": "official_or_media"},
        ))
    # Fallback：宽松匹配
    if not out:
        for m in re.finditer(
            r'<a[^>]+id="sogou_vr_11002601_title_(\d+)"[^>]*>(.*?)</a>',
            html_text, re.DOTALL,
        ):
            title = _strip(m.group(2))
            if title:
                out.append(Hit(
                    title=title[:80], snippet="(sogou-summary-parse-failed)",
                    url=f"sogou://{urllib.parse.quote(title)}",
                    platform="wechat_sogou", source_website="微信公众号",
                    published_at=None,
                ))
    return out[:15]


# ============================================================
# 2. 必应中国（cn.bing.com）
# ============================================================

def fetch_bing_cn(query: str) -> list[Hit]:
    url = f"https://cn.bing.com/search?q={urllib.parse.quote(query)}"
    try:
        html_text = _fetch(url, extra_headers={"Referer": "https://cn.bing.com/"})
    except Exception as e:
        return [_err("bing_cn", query, str(e))]
    out: list[Hit] = []
    # 标准结构: <li class="b_algo">...</li>
    for m in re.finditer(r'<li[^>]*class="b_algo"[^>]*>(.*?)</li>', html_text, re.DOTALL):
        block = m.group(1)
        t = re.search(r'<h2[^>]*>(.*?)</h2>', block, re.DOTALL)
        u = re.search(r'<a[^>]+href="(https?://[^"]+)"', block)
        s = re.search(r'<p[^>]*>(.*?)</p>', block, re.DOTALL)
        title = _strip(t.group(1)) if t else ""
        href = u.group(1) if u else ""
        snippet = _strip(s.group(1)) if s else ""
        if not title or not href:
            continue
        out.append(Hit(
            title=title[:80], snippet=snippet[:160],
            url=href,
            platform=_classify_source(href),
            source_website=_host(href),
            published_at=None,
            extra={"bing_query": query},
        ))
    return out[:15]


# ============================================================
# 3. 360 搜索（so.com）
# ============================================================

def fetch_360(query: str) -> list[Hit]:
    url = f"https://www.so.com/s?q={urllib.parse.quote(query)}"
    try:
        html_text = _fetch(url, extra_headers={"Referer": "https://www.so.com/"})
    except Exception as e:
        return [_err("so_360", query, str(e))]
    out: list[Hit] = []
    # 360 结果可能在 class="res-list" 或 g-link 或者 class 形式多样
    # 宽松策略：抓所有看起来像结果的链接
    for m in re.finditer(
        r'<h3[^>]*class="[^"]*res-title[^"]*"[^>]*>\s*<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>',
        html_text, re.DOTALL,
    ):
        href = m.group(1).replace("&amp;", "&")
        title = _strip(m.group(2))
        if not title or not href or "so.com/link?" in href:
            continue
        # 找后面的 description
        rest = html_text[m.end():m.end()+2000]
        # Project adapter fix: never borrow a later result's description.
        next_title = re.search(r'<h3\b', rest, re.IGNORECASE)
        if next_title:
            rest = rest[:next_title.start()]
        ds = re.search(r'<p[^>]*class="[^"]*res-desc[^"]*"[^>]*>(.*?)</p>', rest, re.DOTALL)
        snippet = _strip(ds.group(1)) if ds else ""
        out.append(Hit(
            title=title[:80], snippet=snippet[:160],
            url=href,
            platform=_classify_source(href),
            source_website=_host(href),
            published_at=None,
            extra={"so_query": query},
        ))
    if not out:
        # 终极 fallback: 抓所有外链带 title
        for m in re.finditer(
            r'<a[^>]+href="(https?://(?:www\.so\.com/link\?m=[^"]+|.*?))"[^>]*>([^<]{10,80})</a>',
            html_text, re.DOTALL,
        ):
            url = m.group(1)
            title = m.group(2).strip()
            if "so.com/link" in url:
                continue
            out.append(Hit(
                title=title[:80], snippet="",
                url=url,
                platform=_classify_source(url),
                source_website=_host(url),
                published_at=None,
            ))
    return out[:15]


# ============================================================
# 4. 巨潮资讯（cninfo.com.cn）— 上市公司公告 / 年报
# ============================================================

A_CODE_RE = re.compile(r"\b(60[0-9]{4}|00[0-9]{4}|30[0-9]{4})\b")
HK_CODE_RE = re.compile(r"\b(\d{5})\b")


def guess_a_code(s: str) -> str | None:
    if not s:
        return None
    m = A_CODE_RE.search(s)
    return m.group(0) if m else None


def _market_prefix(code: str) -> str:
    """A 股 6xxxxx/688xxx → SH；002xxx/300xxx → SZ；港股 5 位数字 → HK。
    港股 EM F10 secucode 格式：HK02500。"""
    if not code:
        return ""
    if code.startswith(("60", "688")):
        return "SH"
    if code.startswith(("00", "30")):
        return "SZ"
    # 港股 5 位数字 → HK
    if code.isdigit() and len(code) == 5:
        return "HK"
    return "SZ"


def fetch_eastmoney_f10(stock_code: str) -> list[Hit]:
    """东方财富 F10 + 公告（无登录 JSON API）。verified 数据源。"""
    if not stock_code:
        return []
    prefix = _market_prefix(stock_code)
    if not prefix:
        return []
    secucode = f"{prefix}{stock_code}"
    out: list[Hit] = []
    # 1) F10 公司资料
    try:
        f10_url = f"https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code={secucode}"
        body = _fetch(f10_url, extra_headers={"Referer": "https://emweb.securities.eastmoney.com/"})
        if body and len(body) > 100:
            data = json.loads(body)
            jbzl = (data.get("jbzl") or [{}])[0]
            sec_name = jbzl.get("SECURITY_NAME_ABBR", stock_code)
            org_name = jbzl.get("ORG_NAME", "")
            emp_num = jbzl.get("EMP_NUM", "")
            legal_person = jbzl.get("LEGAL_PERSON", "")
            reg_capital = jbzl.get("REG_CAPITAL", "")
            snipp = f"全称: {org_name or sec_name}"
            if emp_num:
                snipp += f" | 员工: {emp_num}"
            if legal_person:
                snipp += f" | 法人: {legal_person}"
            if reg_capital:
                snipp += f" | 注册资本: {str(reg_capital)[:30]}"
            out.append(Hit(
                title=f"{sec_name}（{stock_code}）公司资料",
                snippet=snipp[:160],
                url=f"https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/Index?type=web&code={secucode}",
                platform="eastmoney",
                source_website="东方财富 F10",
                published_at=None,
                is_official=True,
                extra={"secucode": secucode, "stock": stock_code, "org_name": org_name,
                       "emp_num": emp_num, "legal_person": legal_person,
                       "reg_capital": reg_capital},
            ))
    except Exception as e:
        out.append(_err("eastmoney_f10", stock_code, str(e)))

    # 2) 公告列表（年报）
    try:
        suffix = ".HK" if prefix == "HK" else ""
        ann_url = ("https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=20&page_index=1"
                   f"&ann_type=A&client_source=web&stock_list={stock_code}{suffix}")
        body = _fetch(ann_url, extra_headers={"Referer": "https://data.eastmoney.com/"})
        if body and len(body) > 200:
            data = json.loads(body)
            for ann in (data.get("data", {}).get("list") or []):
                title = (ann.get("title") or ann.get("title_ch") or "")
                title = title.replace("<em>", "").replace("</em>", "")
                # 只保留年报 / 招股书 / 半年报
                if not any(k in title for k in ("年度报告", "年报", "招股", "上市公告")):
                    continue
                cols = ann.get("columns") or [{}]
                col_name = cols[0].get("column_name", "") if cols else ""
                out.append(Hit(
                    title=title[:80],
                    snippet=f"东财 {ann.get('notice_date', '')[:10]} {col_name}",
                    url=f"https://data.eastmoney.com/notices/detail/{stock_code}/{ann.get('art_code', '')}.html",
                    platform="eastmoney",
                    source_website="东方财富 公告",
                    published_at=ann.get("notice_date", "")[:10],
                    is_official=True,
                    extra={"stock": stock_code, "art_code": ann.get("art_code")},
                ))
    except Exception as e:
        out.append(_err("eastmoney_ann", stock_code, str(e)))
    return out[:10]


# ============================================================
# 4b. 港股 — etnet 經濟通（無登錄 verified 級數據源）
# ============================================================
# HKEX 披露易 (www1.hkexnews.hk) 在新時區（ET 凌晨）會被 Akamai 503 攔截；
# aastocks F10 頁面 Content-Length:0（純 JS 渲染、無純 HTTP 數據）。
# 最終採用 etnet.com.hk：
#   - quote_ci_brief.php — 公司基本資料（主席/秘書/核數師/上市日期/註冊辦事處/股本）
#     數據源為港交所披露原文 → is_official=True
#   - quote_news.php — 公司新聞列表（業績/股權變動/董事變動）
#     內容轉引港交所披露文件原文 → is_official=True
# 等價於 A 股巨潮 (cninfo.com.cn) 的港股版 verified 數據源。
# ============================================================

def _etnet_text(html_text: str, key: str, max_len: int = 80) -> str:
    """etnet HTML 中提取「key value」直譯後的純文本（去 HTML tag）。"""
    if not html_text or key not in html_text:
        return ""
    idx = html_text.find(key)
    if idx < 0:
        return ""
    after = html_text[idx + len(key):idx + len(key) + 400]
    clean = re.sub(r"<[^>]+>", " ", after)
    clean = re.sub(r"\s+", " ", clean).strip()
    # 截斷到下一個明顯的字段关键字前
    for stop_kw in ("業務報告", "董事會成員名單", "業績報告", "上市價", "股份過戶登記處",
                    "主要股東", "股票面值", "註冊辦事處", "公司地址", "電郵地址",
                    "財政年度", "業務類別", "備註：", "內資股"):
        s = clean.find(stop_kw)
        if 0 < s < max_len + 100:
            clean = clean[:s].strip()
            break
    return clean[:max_len]


def fetch_hkex_news(stock_code: str) -> list[Hit]:
    """港股 verified 資料源（etnet 經濟通 ≈ 港交所披露易二級轉錄）。

    回傳:
        - 1 個 ci_brief hit（公司基本資料，verified）
        - 1~3 個 news hit（業績/股權/董事變動新聞，verified — 轉引港交所原文）
    任一 source 失敗時單獨 try/except，不互相阻塞；全部失敗不返回假資料。
    """
    if not stock_code or len(stock_code) != 5 or not stock_code.isdigit():
        return []
    out: list[Hit] = []
    code_nolead = stock_code.lstrip("0") or "0"  # etnet URL 用不帶前導零

    # ----- 1) etnet quote_ci_brief：公司基本資料 -----
    try:
        ci_url = f"https://www.etnet.com.hk/www/tc/stocks/realtime/quote_ci_brief.php?code={code_nolead}"
        body = _fetch(ci_url, extra_headers={"Referer": "https://www.etnet.com.hk/www/tc/stocks/realtime/quote.php?code={0}".format(code_nolead)})
        if body and len(body) > 50000:
            title_m = re.search(r"<title>([^<]+)</title>", body)
            sec_name = _strip(title_m.group(1)) if title_m else f"港股 {stock_code}"
            # 关键字段提取（每个字段都单独 try，找不到就跳过）
            chairman = _etnet_text(body, "主席名稱", 60)
            biz = _etnet_text(body, "主要業務", 60)
            list_date_m = re.search(r"主力市日期\s*(\d{{2}}/\d{{2}}/\d{{4}})", body) or re.search(r"上市日期\s*(\d{{2}}/\d{{2}}/\d{{4}})", body)
            list_date = list_date_m.group(1) if list_date_m else ""
            auditor = _etnet_text(body, "核數師", 50)
            reg_office = _etnet_text(body, "註冊辦事處", 60)
            shares_m = re.search(r"發行股數\s*([\d,]+)", body)
            shares = shares_m.group(1) if shares_m else ""

            snipp_parts = []
            if chairman: snipp_parts.append(f"主席: {chairman[:30]}")
            if list_date: snipp_parts.append(f"上市: {list_date}")
            if biz: snipp_parts.append(f"業務: {biz[:40]}")
            if auditor: snipp_parts.append(f"核數師: {auditor[:25]}")
            if shares: snipp_parts.append(f"股數: {shares}")
            snipp = " | ".join(snipp_parts) if snipp_parts else f"港股代碼 {stock_code} 公司資料"

            out.append(Hit(
                title=f"{sec_name[:60]} - 公司基本資料",
                snippet=snipp[:160],
                url=ci_url,
                platform="etnet_cibrief",
                source_website="etnet.com.hk",
                published_at=None,
                is_official=True,
                extra={
                    "stock": stock_code,
                    "chairman": chairman,
                    "list_date": list_date,
                    "biz": biz,
                    "auditor": auditor,
                    "shares_outstanding": shares,
                    "data_origin": "etnet 經濟通 (港交所披露轉錄)",
                },
            ))
        else:
            out.append(_err("etnet_cibrief", stock_code, f"body too short ({len(body) if body else 0} bytes)"))
    except Exception as e:
        out.append(_err("etnet_cibrief", stock_code, str(e)[:100]))

    # ----- 2) etnet quote_news：公司新聞（業績/股權/董事變動） -----
    try:
        news_url = f"https://www.etnet.com.hk/www/tc/stocks/realtime/quote_news.php?code={code_nolead}"
        body = _fetch(news_url, extra_headers={"Referer": f"https://www.etnet.com.hk/www/tc/stocks/realtime/quote.php?code={code_nolead}"})
        # 已驗證的 HTML 結構:
        # <div class="DivArticleList">
        #   <p class="date">01/09/2026 09:00</p>
        #   <p class="ArticleHdr"><a href="quote_news_detail.php?section=...&newsid=...&code=...">TITLE</a></p>
        # </div>
        # etnet HTML 有兩種新聞塊格式：
        #   A) <div class="DivArticleList [dotLine]"><p class="date">DD/MM/YYYY HH:MM</p>
        #        <p class="ArticleHdr"><a href="quote_news_detail.php?section=S&newsid=N&amp;page=P&amp;code=C">TITLE</a></p></div>
        #   B) <div class="DivArticleList"><p><span class="date">DD/MM/YYYY HH:MM</span>
        #        <a href="quote_news_detail.php?section=S&newsid=N&amp;page=P&amp;code=C">&nbsp;TITLE</a></p></div>
        # 只保留公司直接相關 section，過濾掉 research / related (etnet 自己分類的關聯內容)
        _corp_sections = {"corporate", "result", "sdi", "disclosure", "profit",
                          "loss", "dividend", "announcement", "ipo", "shareholder",
                          "agm", "poll", "buyback", "issue", "warrant", "notice",
                          "capital", "restructure", "insider", "blocktrade", "ml"}
        news_pat = re.compile(
            r'<div class="DivArticleList[^"]*">'
            r'(?:<p class="date">|<p><span class="date">)(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})'
            r'(?:</span>)?</p>(?:<p class="ArticleHdr">)?'
            r'<a href="quote_news_detail\.php\?section=([^&]+)&newsid=(\d+)&amp;page=\d+&amp;code=(\d+)"[^>]*>'
            r'([^<]+)</a>',
        )
        seen_titles = set()
        news_added = 0
        for m in news_pat.finditer(body or ""):
            date_str, time_str, section, newsid, news_code, title_raw = m.groups()
            title = _strip(title_raw).replace("&nbsp;", "").strip()
            if not title or len(title) < 5 or title in seen_titles:
                continue
            seen_titles.add(title)
            # 1) 只保留與該公司（stock_code）直接相關的 section
            if news_code.lstrip("0") != code_nolead:
                continue
            # 2) 過濾掉 etnet 自己分類的關聯/研究內容（research/related 等不是公司原始披露）
            if section not in _corp_sections:
                continue
            # 把 dd/mm/yyyy → yyyy-mm-dd
            try:
                d, mo, y = date_str.split("/")
                published_at = f"{y}-{mo}-{d}"
            except Exception:
                published_at = None
            detail_url = f"https://www.etnet.com.hk/www/tc/stocks/realtime/quote_news_detail.php?section={section}&newsid={newsid}&code={news_code}"
            out.append(Hit(
                title=title[:80],
                snippet=f"etnet {date_str} {time_str} [{section}] 港交所披露轉錄",
                url=detail_url,
                platform="etnet_news",
                source_website="etnet.com.hk",
                published_at=published_at,
                is_official=True,
                extra={
                    "stock": stock_code,
                    "section": section,
                    "newsid": newsid,
                    "data_origin": "etnet 經濟通 (港交所披露原文轉引)",
                },
            ))
            news_added += 1
            if news_added >= 3:
                break
    except Exception as e:
        out.append(_err("etnet_news", stock_code, str(e)[:100]))

    return out[:10]



# ============================================================
# 主流程
# ============================================================

def _err(platform: str, query: str, msg: str) -> Hit:
    return Hit(title="(fetch-failed)", snippet=msg[:140], url="",
               platform=platform, source_website="err", published_at=None,
               extra={"query": query})


def _write_hits(conn: sqlite3.Connection, company_id: int,
                hits: list[Hit], run_id: str) -> int:
    n_evidence = 0
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S")
    for h in hits:
        if not h.title or h.title == "(fetch-failed)":
            continue
        evidence_id = f"ev_{run_id}_{company_id:03d}_{n_evidence:04d}"
        try:
            conn.execute(
                """INSERT OR IGNORE INTO evidence
                   (evidence_id, company_id, scope, source_type, title, url,
                    platform, published_at, retrieved_at, excerpt, excerpt_mode,
                    verification, fact_key, rating, rating_dimension, weight, is_stale,
                    raw_meta)
                   VALUES (?, ?, 'company', ?, ?, ?, ?, ?, ?, ?, 'quote',
                           'unverified', NULL, 'neutral', 'N/A', 1.0, 0, ?)""",
                (evidence_id, company_id, h.platform,
                 h.title[:80], h.url, h.platform,
                 h.published_at, now_iso, h.snippet[:160],
                 json.dumps(h.extra, ensure_ascii=False)),
            )
            if h.is_official:
                conn.execute(
                    "UPDATE evidence SET verification='verified' WHERE evidence_id=?",
                    (evidence_id,),
                )
            n_evidence += 1
        except sqlite3.Error as e:
            print(f"  db error: {e}", flush=True)
    conn.commit()
    return n_evidence


def load_companies(conn: sqlite3.Connection) -> list[dict]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, name, full_name, known_listing, search_keywords, notes FROM companies"
    ).fetchall()
    out = [dict(r) for r in rows]
    # 注: search_aliases 不在 DB schema 中；从 candidate_companies.py 装载
    try:
        from candidate_companies import CANDIDATES as _C
        from candidate_companies_v2 import CANDIDATES as _C2
        by_name = {c["name"]: c for c in (_C + _C2)}
        for r in out:
            extra = by_name.get(r["name"], {}).get("search_aliases") or []
            r["search_aliases"] = extra
    except ImportError:
        for r in out:
            r["search_aliases"] = []
    return out


# B3 / B4 维度关键词池（公共维度词，每个公司名拼一次）
B34_TEMPLATES = [
    " 加班",       # B1
    " 工资",       # B2
    " 文化",       # B3
    " 氛围",       # B3
    " 晋升",       # B4
    " 涨薪",       # B4
    " 校招",       # B4
    " M序列",      # B4 (字节/阿里系)
    " 脉脉",       # 跨平台找脉脉二手
    " maimai",
]
# 主公司名 + alias 列表，每个都跑一遍维度词
def build_queries(company: dict) -> list[str]:
    name = company["name"]
    aliases = company.get("search_aliases") or []
    # alias 不超过 2 个（避免请求数爆炸）
    aliases = aliases[:2]
    variants = [name] + aliases
    queries = []
    for v in variants:
        for tmpl in B34_TEMPLATES:
            queries.append(f"{v}{tmpl}")
    # 去重，保持顺序
    seen = set()
    return [q for q in queries if not (q in seen or seen.add(q))]


def run_for_company(company: dict, *, run_id: str, conn: sqlite3.Connection) -> dict:
    name = company["name"]
    kws_raw = json.loads(company.get("search_keywords") or "[]")
    # 兼容旧的：保留原有 keywords 列表（去掉已迁移到模板的）
    # 新方案: name + alias × 10 个维度词
    queries = build_queries(company)
    # 兼容：旧 search_keywords 里如果还有 name-only 的，保留
    for kw in kws_raw[:3]:
        if kw and kw not in queries:
            queries.insert(0, kw)
    hits: list[Hit] = []
    # 招聘维度（B2/B4）专用 fetcher：fetch_recruit.fetch_all_recruit 内部
    # 自带 _should_use_recruit 守卫，仅对含 工资/薪资/晋升/校招 等维度词的 q 启用。
    try:
        from fetch_recruit import fetch_all_recruit as _fetch_all_recruit
    except Exception:
        _fetch_all_recruit = None
    for q in queries:
        hits.extend(fetch_sogou_wechat(q))
        time.sleep(0.4)
        hits.extend(fetch_bing_cn(q))
        time.sleep(0.4)
        hits.extend(fetch_360(q))
        time.sleep(0.4)
        # B2/B4 维度增强 fetcher（不假数据：拿不到就空 list）
        if _fetch_all_recruit:
            hits.extend(_fetch_all_recruit(q))
            time.sleep(0.4)
    # 巨潮（A 股上市才用）
    a_code = guess_a_code(company.get("known_listing") or "") or guess_a_code(company.get("full_name") or "")
    # 港股识别：known_listing 里的 5 位数字
    hk_match = HK_CODE_RE.search(company.get("known_listing") or "") or HK_CODE_RE.search(company.get("full_name") or "")
    hk_code = hk_match.group(1) if hk_match else None
    if a_code:
        hits.extend(fetch_eastmoney_f10(a_code))
        time.sleep(0.4)
    elif hk_code:
        hits.extend(fetch_hkex_news(hk_code))
        time.sleep(0.4)
    n_e = _write_hits(conn, company["id"], hits, run_id)
    return {
        "company_id": company["id"],
        "name": name,
        "n_hits": len(hits),
        "n_evidence": n_e,
        "sources": list({h.platform for h in hits}),
    }


def main(argv: list[str]) -> int:
    import uuid
    run_id = f"nl_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    only_id = int(argv[1]) if len(argv) > 1 and argv[1].isdigit() else None
    limit = int(argv[2]) if len(argv) > 2 and argv[2].isdigit() else None
    start_id = int(argv[4]) if len(argv) > 4 and argv[4].isdigit() else 0
    skip_existing = (len(argv) > 3 and argv[3] == "skip-existing")
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        companies = load_companies(conn)
        if only_id:
            companies = [c for c in companies if c["id"] == only_id]
        if start_id:
            companies = [c for c in companies if c["id"] >= start_id]
        if limit:
            companies = companies[:limit]
        if skip_existing:
            existing = {r[0] for r in conn.execute(
                "SELECT DISTINCT company_id FROM evidence WHERE company_id IS NOT NULL")}
            before = len(companies)
            companies = [c for c in companies if c["id"] not in existing]
            print(f"[skip-existing] {before - len(companies)} companies already have evidence; "
                  f"will crawl {len(companies)} new", flush=True)
        started = time.time()
        n_total_hits = 0
        n_total_evidence = 0
        n_touched = 0
        for c in companies:
            t0 = time.time()
            try:
                res = run_for_company(c, run_id=run_id, conn=conn)
            except Exception as e:
                print(f"[{c['id']:3d}] {c['name'][:14]:14s} ERROR: {e}", flush=True)
                continue
            n_total_hits += res["n_hits"]
            n_total_evidence += res["n_evidence"]
            if res["n_hits"] > 0:
                n_touched += 1
            elapsed = time.time() - t0
            print(f"[{c['id']:3d}] {c['name'][:14]:14s} "
                  f"hits={res['n_hits']:3d} evidence={res['n_evidence']:3d} "
                  f"sources={','.join(res['sources'])[:30]:30s} ({elapsed:.1f}s)",
                  flush=True)
        elapsed = time.time() - started
        conn.execute(
            """INSERT INTO etl_runs
               (run_id, started_at, finished_at, source, n_companies, n_evidence)
               VALUES (?, datetime('now'), datetime('now'),
                       'no_login_crawler', ?, ?)""",
            (run_id, n_touched, n_total_evidence),
        )
        conn.commit()
        print(f"\n=== Run {run_id} ===")
        print(f"companies touched: {n_touched}/{len(companies)}")
        print(f"total hits: {n_total_hits}")
        print(f"evidence rows: {n_total_evidence}")
        print(f"elapsed: {elapsed:.1f}s")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
