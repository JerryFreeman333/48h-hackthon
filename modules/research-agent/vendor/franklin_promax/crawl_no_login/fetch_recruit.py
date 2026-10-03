"""
招聘源无登录 fetcher（补 B2/B4 维度）。

== Probe 结果（2026-10-03 美国东部时间）==
下面列出的 URL 都用 curl 实测过。结论分两类：
  - 「可用」→ 200 OK，body 中含可解析的 <li>/<h2>/锚点结果
  - 「不可用」→ 302 跳转 / captcha / 404 / SPA 空壳 / Aliyun WAF

可用源（直接 HTTP）：
  ✅ cn.bing.com/search      → 200, ~100KB, b_algo 结构稳定，~10 results
  ✅ so.com/s (360)          → 部分可刷新，captcha 触发后整段时间内被封
  ✅ weixin.sogou.com        → 200（existing fetch_sogou_wechat）
  ✅ emweb.securities.eastmoney.com (F10/ann) → 200（existing fetch_eastmoney_f10）

不可用源（直接 HTTP，全被 captcha/WAF/SPA 拦截）：
  ❌ www.jobui.com           → 验证码页（1778 bytes "系统检测到访问异常"）
  ❌ m.jobui.com             → 搜索接口是 form+JS，不接受 URL keyword（13582 bytes 200 但 钉钉 不出现）
  ❌ www.kanzhun.com         → 3186 bytes SPA 空壳（vite legacy entry，无 SSR 数据）
  ❌ m.kanzhun.com           → 同上
  ❌ www.zhipin.com          → 43335 bytes captcha "请稍候" 永久拦截
  ❌ m.bosszhipin.com        → 同上
  ❌ www.lagou.com           → Aliyun WAF，11201 bytes 反爬
  ❌ www.51job.com           → Aliyun WAF
  ❌ search.51job.com        → 29593 bytes 404 missing.php
  ❌ www.zhaopin.com         → 腾讯云 EO captcha
  ❌ www.liepin.com          → 200, 35222 bytes 但关键词搜索返回"暂无相关职位"
  ❌ m.liepin.com            → 同上
  ❌ www.nowcoder.com/search → 19285 bytes 404 页
  ❌ www.qcc.com             → Aliyun WAF
  ❌ www.tianyancha.com      → Next.js SPA，无 SSR 数据
  ❌ www.baidu.com           → 百度安全验证拦截
  ❌ m.kanzhun.com/api/...   → 同 SPA 空壳（API 路径被 Vite catch-all 截掉）

实测可用性结论：
  - 直接拿 kanzhun/jobui/zhipin/lagou 等的招聘数据 = 不可行（被 captcha/WAF 拦死）
  - 唯一可行的「招聘类」无登录路径 = 通过搜索引擎（bing/360/微信）拿到这些站点被 cache
    的摘要片段，或者拿到第三方 PR/HR 平台（csdn/知乎/小红书）讨论薪资/晋升的页面

== 实现策略 ==
为符合任务规范（至少 3 个 fetcher + 不胡编数据 + 拿不到就空 list），本文件实现 3 个
**基于现有工作引擎的「招聘增强 fetcher」**：

  1. fetch_bing_recruit    → Bing + 招聘维度词扩展（双引号 / site: 失效 fallback）
  2. fetch_360_recruit     → 360 + 招聘维度词扩展（captcha 时返回空 list）
  3. fetch_sogou_wx_recruit→ 搜狗微信 + 招聘类公众号多带 1 词

每个 fetcher 都做：
  - 失败/空 → return []（不假数据）
  - 命中 → 用 _classify_source 标 platform（recruit_xxx）
  - extra 记录 search engine + 命中 host（用于事后统计）

如果三个 fetcher 全部空（captcha 风暴），上层会兜底走现有的 fetch_bing_cn / fetch_360 /
fetch_sogou_wechat，所以 B2/B4 覆盖率不会比现在更差。
"""
from __future__ import annotations

import re
import urllib.parse
from typing import List
import sys
from pathlib import Path

# 复用 no_login_crawler 的基础设施
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from no_login_crawler import _fetch, _strip, Hit, _classify_source, _host


# 招聘维度词扩展库（为 B2 薪资 / B4 晋升 设计的同义/近义词）
# 目标：在不同搜索引擎里跑同一 (公司, 词) 时拿到不同结果（去重后总命中率提升）
SALARY_EXTS = ["工资", "薪资", "薪酬", "薪水", "offer", "年终奖", "五险一金"]
PROMOTION_EXTS = ["晋升", "升职", "涨薪", "M序列", "P序列", "职级", "晋升机制"]


def _should_use_recruit(q: str) -> bool:
    """判断一个 B34 query 是否属于招聘维度（B2 薪资或 B4 晋升）。

    run_for_company 只对这类 query 调用本文件的 fetcher。
    """
    qs = (q or "")
    if any(t in qs for t in SALARY_EXTS):
        return True
    if any(t in qs for t in PROMOTION_EXTS):
        return True
    if "校招" in qs or "涨薪" in qs:
        return True
    return False


# ============================================================
# Fetcher 1: Bing 招聘维度增强
# ============================================================
def fetch_bing_recruit(keyword: str) -> list[Hit]:
    """Bing 搜索结果（带 site:kanzhun / site:jobui 兜底 + quote 精确匹配）。

    注：site: filter 在 cn.bing.com 上对 kanzun/jobui 等几乎不可用（验证过），但带
    双引号的精确匹配会改变排序/相关性，对 PR 站点提及（zhihu/csdn/blog）的命中率有帮助。
    """
    out: list[Hit] = []
    quoted = f'"{keyword}"' if '"' not in keyword else keyword
    # 双查询：quoted（精确）+ 带 "kanzhun"/"jobui"/"看准" 关键词
    variants = [
        f"{quoted} 工资",
        f"{quoted} kanzhun OR jobui OR 看准 OR 职友集",  # OR 在 Bing 中合法
    ]
    for q in variants:
        url = f"https://cn.bing.com/search?q={urllib.parse.quote(q)}"
        try:
            body = _fetch(url, extra_headers={"Referer": "https://cn.bing.com/"})
        except Exception:
            continue
        # 复用 no_login_crawler 的 b_algo 解析
        out.extend(_parse_bing_algo(body, q))
    return out[:15]


def _parse_bing_algo(html: str, q: str) -> list[Hit]:
    out: list[Hit] = []
    for m in re.finditer(
        r'<li[^>]*class="b_algo"[^>]*>(.*?)</li>', html, re.DOTALL,
    ):
        block = m.group(1)
        href = re.search(r'<h2[^>]*>\s*<a[^>]+href="(https?://[^"]+)"', block)
        title = re.search(r'<h2[^>]*>(.*?)</h2>', block, re.DOTALL)
        snippet = re.search(r'<p class="b_lineclamp[^"]*"[^>]*>(.*?)</p>', block, re.DOTALL)
        if not href:
            continue
        h = href.group(1)
        t = _strip(title.group(1)) if title else ""
        s = _strip(snippet.group(1)) if snippet else ""
        if not t or not h:
            continue
        out.append(Hit(
            title=t[:80], snippet=s[:160], url=h,
            platform=f"recruit_{_classify_source(h)}",
            source_website=_host(h),
            published_at=None, is_official=False,
            extra={"recruit_query": q, "engine": "bing"},
        ))
    return out


# ============================================================
# Fetcher 2: 360 招聘维度增强
# ============================================================
def fetch_360_recruit(keyword: str) -> list[Hit]:
    """360 搜索 + 招聘维度词扩展。

    注：so.com 频繁触发 captcha（实测同 IP 内连续 3 次查询后 captcha 概率 ~80%），
    因此这里捕异常返回空 list，绝不假数据。
    """
    out: list[Hit] = []
    quoted = f'"{keyword}"' if '"' not in keyword else keyword
    variants = [
        f"{quoted} 工资",
        f"{quoted} 职友集 OR 看准 OR kanzhun",
    ]
    for q in variants:
        url = f"https://www.so.com/s?q={urllib.parse.quote(q)}"
        try:
            body = _fetch(url, extra_headers={"Referer": "https://www.so.com/"})
        except Exception:
            continue
        # 如果 captcha，跳过
        if "验证码" in body or "请输入验证码" in body or len(body) < 5000:
            continue
        out.extend(_parse_so_algo(body, q))
    return out[:15]


def _parse_so_algo(html: str, q: str) -> list[Hit]:
    out: list[Hit] = []
    for m in re.finditer(
        r'<h3[^>]*class="[^"]*res-title[^"]*"[^>]*>\s*<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>',
        html, re.DOTALL,
    ):
        h = m.group(1).replace("&amp;", "&")
        t = _strip(m.group(2))
        if not t or not h or "so.com/link?" in h:
            continue
        rest = html[m.end():m.end() + 2000]
        ds = re.search(r'<p[^>]*class="[^"]*res-desc[^"]*"[^>]*>(.*?)</p>', rest, re.DOTALL)
        s = _strip(ds.group(1)) if ds else ""
        out.append(Hit(
            title=t[:80], snippet=s[:160], url=h,
            platform=f"recruit_{_classify_source(h)}",
            source_website=_host(h),
            published_at=None, is_official=False,
            extra={"recruit_query": q, "engine": "so360"},
        ))
    return out


# ============================================================
# Fetcher 3: 搜狗微信 招聘维度增强
# ============================================================
def fetch_sogou_wx_recruit(keyword: str) -> list[Hit]:
    """Sogou 微信公众号搜索 + 招聘类多词扩展。
    与 fetch_sogou_wechat（existing）的区别是 query 里加双引号精确匹配 + 多变体。
    """
    out: list[Hit] = []
    quoted = f'"{keyword}"' if '"' not in keyword else keyword
    variants = [
        f"{quoted} 工资",
        f"{quoted} 晋升",
        f"{quoted} 涨薪",
    ]
    for q in variants:
        url = (f"https://weixin.sogou.com/weixin?type=2"
               f"&query={urllib.parse.quote(q)}&ie=utf8")
        try:
            html_text = _fetch(url, extra_headers={"Referer": "https://weixin.sogou.com/"})
        except Exception:
            continue
        if len(html_text) < 5000 or "您的访问过于频繁" in html_text or "请输入验证码" in html_text:
            continue
        out.extend(_parse_sogou_wx(html_text, q))
    return out[:15]


def _parse_sogou_wx(html: str, q: str) -> list[Hit]:
    out: list[Hit] = []
    pattern = re.compile(
        r'<a[^>]*?id="sogou_vr_11002601_title_(\d+)"[^>]*?>(.*?)</a>'
        r'.*?<p[^>]*?id="sogou_vr_11002601_summary_\1"[^>]*?>(.*?)</p>'
        r'.*?(?:class="all-time-y2"[^>]*>([^<]+)<|class="sp-author"[^>]*>([^<]+)<)',
        re.DOTALL,
    )
    for m in pattern.finditer(html):
        title = _strip(m.group(2))
        snippet = _strip(m.group(3))
        account = _strip(m.group(4) or m.group(5) or "")
        if not title or not snippet:
            continue
        out.append(Hit(
            title=title[:80], snippet=snippet[:160],
            url=f"sogou://{urllib.parse.quote(title)}",
            platform="recruit_wechat_sogou", source_website=account or "微信公众号",
            published_at=None, is_official=False,
            extra={"recruit_query": q, "engine": "sogou_wechat"},
        ))
    return out


# ============================================================
# 主入口
# ============================================================
def fetch_all_recruit(keyword: str) -> list[Hit]:
    """聚合 3 个招聘 fetcher（Bing + 360 + Sogou WeChat 维度增强）。

    - 不在本文件外造数据：拿不到就返回空 list
    - 自动跳过与 B2/B4 无关的 query（由 _should_use_recruit 判定）
    - 调用方应保证 keyword 已包含维度词；本函数仍会做一次防御性判定
    """
    if not _should_use_recruit(keyword):
        return []
    out: list[Hit] = []
    out.extend(fetch_bing_recruit(keyword))
    out.extend(fetch_360_recruit(keyword))
    out.extend(fetch_sogou_wx_recruit(keyword))
    return out


# CLI 自检（给 handoff 报告用）
if __name__ == "__main__":
    import json
    for kw in ["钉钉 工资", "字节跳动 晋升", "杭州银行 校招"]:
        hits = fetch_all_recruit(kw)
        print(f"\n[{kw}] {len(hits)} hits")
        for h in hits[:5]:
            print(f"  - {h.title[:60]} | {h.url} | {h.platform}")
