"""
Franklin_promax 适配层：任意公司一条龙 —— 入库 → 抓取 → 抽取 → 报告。

解决的核心问题：no_login_crawler 的批量主流程只能"从 companies 表读公司列表再逐家爬"，
不支持临场报一个新公司名字进来。本适配层补上这一段：

    1. ensure_company   新公司写入 companies（已存在则复用，不重复建）
    2. suggest_code     公司名 → 股票代码（东方财富公开 suggest 接口，免登录）
    3. crawl_company    抓取：东财 F10(A股) / etnet(港股) / Bing+360+搜狗微信(+招聘增强)
                        → 写 evidence（复用 no_login_crawler._write_hits）
    4. analyze_company  跑确定性 extractors → 写 facts（复用 run_analysis.run）
    5. build_report     汇总 facts + evidence（含 evidence_ids 证据链）→ 文本 / JSON

JSON 输出的 facts 每条都带 evidence_ids，evidence 带 verification 字段，
可直接作为 C 板块 CandidateBundle 的公司事实来源。

用法：
    python3 lookup_company.py 泸州老窖                    # 只报名字，自动猜代码
    python3 lookup_company.py 中控技术 --code 688777      # 显式给 A 股代码（最稳）
    python3 lookup_company.py 腾讯控股 --hk 00700          # 港股
    python3 lookup_company.py 泸州老窖 --json             # JSON 输出（给程序用）
    python3 lookup_company.py 信雅达 --no-crawl --json    # 只读库内已有数据，不抓取
    python3 lookup_company.py 泸州老窖 --deep             # 全量维度词（同批量爬虫，约 3-5 分钟）
    python3 lookup_company.py --selftest                  # 6 能力自检（自动处理 PYTHONPATH）

环境变量 FRANKLIN_DB 可覆盖数据库路径（默认 franklin_promax/db/xray_hangzhou.db）。
重复查询同一公司会追加新证据行（run_id 不同），不做历史去重。
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from collections import Counter
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 适配层既可与 franklin_promax/ 并排放（推荐），也可以直接放进包目录内
PKG = HERE / "franklin_promax"
if not (PKG / "cli.py").exists():
    PKG = HERE
DB_PATH = Path(os.environ["FRANKLIN_DB"]) if os.environ.get("FRANKLIN_DB") else PKG / "db" / "xray_hangzhou.db"

sys.path.insert(0, str(PKG))
sys.path.insert(0, str(PKG / "crawl_no_login"))
sys.path.insert(0, str(PKG / "analysis"))

from no_login_crawler import (  # noqa: E402
    HK_CODE_RE,
    Hit,
    _write_hits,
    fetch_360,
    fetch_bing_cn,
    fetch_eastmoney_f10,
    fetch_hkex_news,
    fetch_sogou_wechat,
    guess_a_code,
    run_for_company,
)
from fetch_recruit import _should_use_recruit, fetch_all_recruit  # noqa: E402

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# quick 模式的维度词（工资/加班/晋升/文化 四维 + 公司名裸查）
QUICK_TEMPLATES = [" 工资", " 加班", " 晋升", " 文化"]

# C 板块关心的四个 B 维度 fact_key
B_DIMENSIONS = ["B1.work_hours", "B2.salary_mention", "B3.culture_polarity", "B4.promotion_evidence"]


def _is_relevant(hit: Hit, names: list[str], code: str | None) -> bool:
    """公司名相关度过滤：标题/摘要里必须出现公司名或股票代码。

    批量爬虫靠规模+事后噪音白名单；单公司查询走精确路线——
    否则"泸州老窖 加班"会命中一堆泸州市旅游文章并污染 B3 情感事实。
    """
    text = f"{hit.title or ''} {hit.snippet or ''}"
    if any(n and n in text for n in names):
        return True
    if code and code.lstrip("0") in text.replace("，", "").replace(",", ""):
        return True
    # 东财 F10/公告是精确按代码查的，直接放行
    return hit.platform in ("eastmoney", "etnet_cibrief", "etnet_news")


# ============================================================
# 1. 股票代码猜测（东方财富公开 suggest 接口，免登录无 key）
# ============================================================
def suggest_code(name: str, timeout: int = 10) -> dict | None:
    """公司名/拼音 → {code, market, name, security_type}。

    QuoteID 前缀：1=沪 0=深 116=港，其余（美股/基金等）跳过。
    精确同名优先；猜不到返回 None（此时走纯搜索路径）。
    """
    url = ("https://searchapi.eastmoney.com/api/suggest/get?"
           f"input={urllib.parse.quote(name)}&type=14"
           "&token=D43BF722C8E33BDC906FB84D85E326E8&count=10")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8", "ignore"))
    except Exception:
        return None
    rows = (data.get("QuotationCodeTable") or {}).get("Data") or []
    cands: list[dict] = []
    for r in rows:
        code = (r.get("Code") or "").strip()
        market = {"1": "SH", "0": "SZ", "116": "HK"}.get((r.get("QuoteID") or "").split(".")[0])
        if not market or not code.isdigit():
            continue
        if market in ("SH", "SZ") and len(code) != 6:
            continue
        if market == "HK" and len(code) != 5:
            continue
        cands.append({
            "code": code, "market": market, "name": r.get("Name", ""),
            "security_type": r.get("SecurityTypeName", ""),
            "exact": (r.get("Name", "") == name),
        })
    if not cands:
        return None
    exact = [c for c in cands if c["exact"]]
    chosen = (exact or cands)[0]
    return {k: v for k, v in chosen.items() if k != "exact"}


# ============================================================
# 2. 新公司入库（companies.name UNIQUE，已存在则复用）
# ============================================================
def ensure_company(conn: sqlite3.Connection, name: str, *,
                   full_name: str | None = None,
                   known_listing: str | None = None,
                   domain: str | None = None) -> tuple[int, bool]:
    row = conn.execute(
        "SELECT id, full_name, known_listing FROM companies WHERE name = ?", (name,)
    ).fetchone()
    if row:
        cid = row[0]
        # 已有公司：补全空缺字段并刷新 updated_at
        new_full = full_name or row[1]
        new_listing = known_listing or row[2]
        conn.execute(
            "UPDATE companies SET full_name=?, known_listing=?, updated_at=datetime('now') WHERE id=?",
            (new_full, new_listing, cid),
        )
        conn.commit()
        return cid, False
    cur = conn.execute(
        """INSERT INTO companies (name, full_name, known_listing, domain, status)
           VALUES (?, ?, ?, ?, 'in_progress')""",
        (name, full_name, known_listing, domain),
    )
    conn.commit()
    return cur.lastrowid, True


# ============================================================
# 3. 抓取（quick: 4 维度词×3 搜索源+F10/港股；deep: 批量爬虫全流程）
# ============================================================
def resolve_stock(company_name: str, company_row: dict | None,
                  a_code: str | None, hk_code: str | None) -> dict | None:
    """代码解析优先级：显式参数 > 库内 known_listing > suggest 猜码。"""
    if a_code:
        return {"code": a_code, "market": "A股", "name": company_name, "security_type": "手工指定"}
    if hk_code:
        return {"code": hk_code, "market": "港股", "name": company_name, "security_type": "手工指定"}
    listing = (company_row or {}).get("known_listing") or ""
    a = guess_a_code(listing)
    if a:
        return {"code": a, "market": "A股", "name": company_name, "security_type": "库内已知"}
    m = HK_CODE_RE.search(listing)
    if m:
        return {"code": m.group(1), "market": "港股", "name": company_name, "security_type": "库内已知"}
    return suggest_code(company_name)


def crawl_company(conn: sqlite3.Connection, company: dict, *,
                  stock: dict | None, deep: bool = False,
                  run_id: str | None = None) -> dict:
    name = company["name"]
    cid = company["id"]
    if run_id is None:
        run_id = f"lk_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"

    if deep:
        # 全量模式：直接复用批量爬虫的单公司主流程（含 10 个维度词 + F10/港股）
        res = run_for_company(company, run_id=run_id, conn=conn)
        n_hits, n_ev = res["n_hits"], res["n_evidence"]
        by_platform = dict.fromkeys(res["sources"], 1)  # deep 模式只记来源集合
        n_err = n_dropped = None
    else:
        queries = [name] + [f"{name}{t}" for t in QUICK_TEMPLATES]
        hits: list[Hit] = []
        for q in queries:
            for fetcher in (fetch_sogou_wechat, fetch_bing_cn, fetch_360):
                hits.extend(fetcher(q))
                time.sleep(0.4)
            if _should_use_recruit(q):
                hits.extend(fetch_all_recruit(q))
                time.sleep(0.4)
        # suggest 返回的市场标识是 SH/SZ/HK；resolve_stock 库内解析返回 A股/港股
        mkt = (stock or {}).get("market", "")
        if mkt in ("A股", "SH", "SZ"):
            hits.extend(fetch_eastmoney_f10(stock["code"]))
            time.sleep(0.4)
        elif mkt in ("港股", "HK"):
            hits.extend(fetch_hkex_news(stock["code"]))
            time.sleep(0.4)
        n_err = sum(1 for h in hits if not h.title or h.title == "(fetch-failed)")
        # URL 去重（主渠道与 recruit 渠道、多引擎常命中同一页面）
        seen_urls: set[str] = set()
        names = [name] + [n for n in [(company.get("full_name") or ""),
                                      (stock or {}).get("name", "")] if n]
        code = (stock or {}).get("code")
        good: list[Hit] = []
        for h in hits:
            if not h.title or h.title == "(fetch-failed)":
                continue
            if h.url and h.url in seen_urls:
                continue
            if not _is_relevant(h, names, code):
                continue
            if h.url:
                seen_urls.add(h.url)
            good.append(h)
        n_dropped = len(hits) - n_err - len(good)
        n_hits, n_ev = len(good), _write_hits(conn, cid, good, run_id)
        by_platform = dict(Counter(h.platform for h in good))

    conn.execute(
        """INSERT INTO etl_runs (run_id, started_at, finished_at, source, n_companies, n_evidence)
           VALUES (?, datetime('now'), datetime('now'), 'lookup_company', 1, ?)""",
        (run_id, n_ev),
    )
    if n_ev > 0:
        conn.execute(
            "UPDATE companies SET status='partial', updated_at=datetime('now') WHERE id=? AND status != 'complete'",
            (cid,),
        )
    conn.commit()
    return {"run_id": run_id, "n_hits": n_hits, "n_evidence": n_ev, "by_platform": by_platform,
            "n_fetch_failed": n_err, "n_dropped_irrelevant": n_dropped}


# ============================================================
# 4. 确定性抽取（extractors → facts）
# ============================================================
def analyze_company(cid: int, run_id: str | None = None) -> dict:
    import run_analysis as ra

    ra.DB_PATH = DB_PATH  # 支持 FRANKLIN_DB 覆盖（run() 运行时读模块全局）
    buf = io.StringIO()
    with redirect_stdout(buf):  # run() 自己会 print JSON，捕获掉保证输出干净
        summary = ra.run(only_company_id=cid, run_id=run_id)
    return summary


# ============================================================
# 5. 报告
# ============================================================
def build_report(conn: sqlite3.Connection, cid: int, n_samples: int = 8) -> dict:
    r = conn.execute(
        "SELECT id, name, full_name, known_listing, domain, status, aliases FROM companies WHERE id=?",
        (cid,),
    ).fetchone()
    try:
        aliases = json.loads(r[6]) if r[6] else []
    except Exception:
        aliases = []
    company = {"id": r[0], "name": r[1], "full_name": r[2], "known_listing": r[3],
               "domain": r[4], "status": r[5], "aliases": aliases}

    n_total, n_ver, n_unver = conn.execute(
        "SELECT COUNT(*), SUM(verification='verified'), SUM(verification='unverified') "
        "FROM evidence WHERE company_id=?", (cid,)
    ).fetchone()
    by_platform = dict(conn.execute(
        "SELECT platform, COUNT(*) FROM evidence WHERE company_id=? "
        "GROUP BY platform ORDER BY 2 DESC LIMIT 8", (cid,)).fetchall())

    grouped: dict[str, list] = {}
    for fk, fv, st, eids, ns, note in conn.execute(
        "SELECT fact_key, fact_value, status, evidence_ids, n_sources, note "
        "FROM facts WHERE company_id=? ORDER BY fact_key, id", (cid,)
    ):
        try:
            evidence_ids = json.loads(eids) if eids else []
        except Exception:
            evidence_ids = []
        grouped.setdefault(fk, []).append(
            {"value": fv, "status": st, "evidence_ids": evidence_ids, "note": (note or "")[:60]})

    samples = [
        {"title": t, "platform": p, "verification": v, "published_at": d, "url": u}
        for t, p, v, d, u in conn.execute(
            "SELECT title, platform, verification, published_at, url FROM evidence "
            "WHERE company_id=? ORDER BY (verification='verified') DESC, id DESC LIMIT ?",
            (cid, n_samples))
    ]
    gaps = [k for k in B_DIMENSIONS if not grouped.get(k)]
    return {
        "company": company,
        "evidence": {"total": n_total or 0, "verified": n_ver or 0, "unverified": n_unver or 0,
                     "by_platform": by_platform},
        "facts_by_dimension": grouped,
        "evidence_samples": samples,
        "gaps": gaps,
    }


def print_report(rep: dict, stock: dict | None) -> None:
    co = rep["company"]
    ev = rep["evidence"]
    print(f"\n{'=' * 62}")
    print(f"  公司报告：{co['name']}  (id={co['id']}, 状态={co['status']})")
    print(f"{'=' * 62}")
    meta = [f"全称: {co['full_name'] or '未知'}"]
    if co["known_listing"]:
        meta.append(f"上市: {co['known_listing']}")
    if stock:
        meta.append(f"代码: {stock['code']} ({stock['market']}/{stock.get('security_type', '')})")
    print("  " + " | ".join(meta))
    print(f"  证据: {ev['total']} 条 (verified {ev['verified']} / unverified {ev['unverified']})")
    if ev["by_platform"]:
        srcs = ", ".join(f"{k} {v}" for k, v in ev["by_platform"].items())
        print(f"  来源: {srcs}")

    print("\n[事实]")
    if not rep["facts_by_dimension"]:
        print("  （无 —— 证据里未抽出任何 B1-B4 事实，可能是刚入库或信息太少）")
    for fk in sorted(rep["facts_by_dimension"]):
        rows = rep["facts_by_dimension"][fk]
        print(f"  {fk}  ({len(rows)} 条)")
        for item in rows[:6]:
            eid = item["evidence_ids"][0] if item["evidence_ids"] else "-"
            note = f"  ‹{item['note']}›" if item["note"] else ""
            print(f"    - {item['value']}  [{item['status']}]  ev={eid}{note}")

    print("\n[证据样例]  (verified 优先)")
    if not rep["evidence_samples"]:
        print("  （无证据）")
    for s in rep["evidence_samples"]:
        print(f"  [{s['verification']:10s}] {s['platform']:18s} {(s['title'] or '')[:44]}")
        if s["url"]:
            print(f"               {s['url'][:76]}")

    if rep["gaps"]:
        print(f"\n[缺口] {', '.join(rep['gaps'])}")
        print("  → 以上维度无事实：上市公司可加 --deep 补抓，未上市建议人工访谈补齐")
    print()


# ============================================================
# 自检 & 入口
# ============================================================
def _ensure_parent_db_link() -> None:
    """tests/test_6_capabilities.py 用 '../db/xray_hangzhou.db' 找库。
    压缩包传输可能丢掉 db 软链，这里自动补（软链 → Windows junction → 复制）。"""
    parent = PKG.parent
    link = parent / "db"
    if link.exists():
        return
    src = str((PKG / "db").resolve())
    try:
        os.symlink(os.path.relpath(src, parent), link)
        return
    except OSError:
        pass
    if sys.platform == "win32":
        try:
            subprocess.run(["cmd", "/c", "mklink", "/J", str(link), src],
                           capture_output=True, check=True)
            return
        except Exception:
            pass
    link.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PKG / "db" / "xray_hangzhou.db", link / "xray_hangzhou.db")


def run_selftest() -> int:
    if not DB_PATH.exists():
        print(f"✗ 未找到数据库: {DB_PATH}\n"
              "  本包不含数据库,请把单独分发的 xray_hangzhou.db 放到上面这个路径\n"
              "  (即 franklin_promax/db/ 目录下,文件名保持原样)后重跑 --selftest",
              file=sys.stderr)
        return 1
    _ensure_parent_db_link()
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join([str(PKG / "crawl_no_login")] +
                                        env.get("PYTHONPATH", "").split(os.pathsep))
    env["PYTHONIOENCODING"] = "utf-8"
    print(f"使用数据库: {DB_PATH}\n")
    proc = subprocess.run(
        [sys.executable, str(PKG / "tests" / "test_6_capabilities.py")],
        cwd=str(PKG), env=env,
    )
    return proc.returncode


def lookup_company(name: str, *, a_code: str | None = None, hk_code: str | None = None,
                   crawl: bool = True, analyze: bool = True,
                   deep: bool = False) -> dict:
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"未找到数据库: {DB_PATH}\n"
            "请把单独分发的 xray_hangzhou.db 放到 franklin_promax/db/ 目录下(文件名保持原样)")
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        row = conn.execute(
            "SELECT id, name, full_name, known_listing FROM companies WHERE name=?", (name,)
        ).fetchone()
        company_row = dict(zip(["id", "name", "full_name", "known_listing"], row)) if row else None

        stock = resolve_stock(name, company_row, a_code, hk_code)
        listing_tag = None
        if stock:
            listing_tag = ("H 股 " if stock["market"] == "港股" else "A 股 ") + stock["code"]
        elif company_row and not company_row["known_listing"]:
            listing_tag = "未上市"

        cid, created = ensure_company(
            conn, name,
            full_name=(stock or {}).get("name"),
            known_listing=listing_tag,
        )

        crawl_stats = analyze_summary = None
        if crawl:
            crawl_stats = crawl_company(conn, {"id": cid, "name": name, "full_name": None,
                                               "known_listing": listing_tag,
                                               "search_keywords": "[]", "search_aliases": []},
                                        stock=stock, deep=deep)
            if analyze:
                analyze_summary = analyze_company(cid, run_id="ana_" + crawl_stats["run_id"][3:])
        rep = build_report(conn, cid)
        rep["stock"] = stock
        return {"created": created, "crawl": crawl_stats,
                "analysis": analyze_summary, **rep}
    finally:
        conn.close()


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Franklin_promax 适配层：任意公司 → 入库→抓取→抽取→报告")
    ap.add_argument("name", nargs="?", help="公司名（简称即可，与东财搜到的同名优先）")
    ap.add_argument("--code", help="A 股 6 位代码（显式指定最稳，跳过猜码）")
    ap.add_argument("--hk", help="港股 5 位代码")
    ap.add_argument("--deep", action="store_true", help="全量维度词抓取（同批量爬虫，约 3-5 分钟）")
    ap.add_argument("--no-crawl", action="store_true", help="不抓取（只读库内已有数据出报告）")
    ap.add_argument("--no-analyze", action="store_true", help="抓取但不跑事实抽取")
    ap.add_argument("--json", action="store_true", help="JSON 输出（facts 带 evidence_ids，可直接给 C 板块）")
    ap.add_argument("--db", help="覆盖数据库路径（等同环境变量 FRANKLIN_DB）")
    ap.add_argument("--selftest", action="store_true", help="运行 6 能力自检")
    args = ap.parse_args(argv)

    if args.selftest:
        return run_selftest()
    if args.db:
        global DB_PATH
        DB_PATH = Path(args.db).expanduser().resolve()
    if not args.name:
        ap.print_help()
        return 2

    result = lookup_company(
        args.name,
        a_code=args.code, hk_code=args.hk,
        crawl=not args.no_crawl, analyze=not args.no_analyze, deep=args.deep,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        tag = "新公司已入库" if result["created"] else "复用库内已有记录"
        print(f"\n[{tag}] {args.name} -> company_id={result['company']['id']}")
        if result["crawl"]:
            cs = result["crawl"]
            plat = ", ".join(f"{k}×{v}" for k, v in cs["by_platform"].items())
            extra = ""
            if cs.get("n_fetch_failed") is not None:
                extra = (f"  [抓取失败 {cs['n_fetch_failed']} 源次, "
                         f"无关结果过滤掉 {cs['n_dropped_irrelevant']} 条]")
            print(f"[抓取] hits={cs['n_hits']} → evidence +{cs['n_evidence']}  ({plat or '无来源'}){extra}")
        if result["analysis"]:
            an = result["analysis"]
            print(f"[抽取] facts +{an['n_facts']} (来自 {an['n_extracted']} 条证据)")
        print_report(result, result.get("stock"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
