"""
CLI entrypoint: 一键 ETL + 分析 + 报告

Usage:
    python cli.py init                 # reset DB + seed 120 companies
    python cli.py etl <crawler_dir>    # ingest MediaCrawler outputs
    python cli.py analyze              # run deterministic extractors
    python cli.py summary              # print DB summary
    python cli.py report <company_id>  # per-company report
    python cli.py coverage              # 120-company coverage matrix
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parent
DB_PATH = PKG / "db" / "xray_hangzhou.db"


def cmd_init(_args: list[str]) -> int:
    return subprocess.call([sys.executable, str(PKG / "db" / "init_db.py")], cwd=str(PKG))


def cmd_etl(args: list[str]) -> int:
    if not args:
        print("Usage: cli.py etl <crawler_output_dir>", file=sys.stderr)
        return 2
    import uuid
    run_id = f"cli_{uuid.uuid4().hex[:8]}"
    return subprocess.call(
        [sys.executable, str(PKG / "etl" / "ingest_crawler.py"), str(Path(args[0]).resolve()), run_id],
        cwd=str(PKG),
    )


def cmd_analyze(_args: list[str]) -> int:
    sys.path.insert(0, str(PKG / "analysis"))
    from run_analysis import run
    run()
    return 0


def cmd_summary(_args: list[str]) -> int:
    conn = sqlite3.connect(DB_PATH)
    try:
        for label, sql in [
            ("companies",
             "SELECT COUNT(*), SUM(status='complete') FROM companies"),
            ("evidence total",
             "SELECT COUNT(*), SUM(verification='verified'), SUM(verification='unverified') FROM evidence"),
            ("evidence by platform (top 10)",
             "SELECT platform, COUNT(*) FROM evidence GROUP BY platform ORDER BY 2 DESC LIMIT 10"),
            ("facts by dimension",
             "SELECT fact_key, status, COUNT(*) FROM facts GROUP BY fact_key, status ORDER BY fact_key"),
            ("coverage (facts 维度)",
             "SELECT "
             "  SUM(B1_n > 0) AS B1, SUM(B2_n > 0) AS B2, "
             "  SUM(B3_n > 0) AS B3, SUM(B4_n > 0) AS B4 "
             "FROM v_dimension_coverage"),
            ("etl_runs",
             "SELECT source, COUNT(*) FROM etl_runs GROUP BY source"),
        ]:
            print(f"\n=== {label} ===")
            rows = conn.execute(sql).fetchall()
            if len(rows) == 1 and len(rows[0]) == 1:
                print(f"  count: {rows[0][0]}")
            else:
                for row in rows:
                    print(f"  {row}")
    finally:
        conn.close()
    return 0


def cmd_report(args: list[str]) -> int:
    if not args:
        print("Usage: cli.py report <company_id|name>", file=sys.stderr)
        return 2
    target = args[0]
    conn = sqlite3.connect(DB_PATH)
    try:
        if target.isdigit():
            cid = int(target)
        else:
            row = conn.execute("SELECT id FROM companies WHERE name = ?", (target,)).fetchone()
            if not row:
                print(f"company not found: {target}", file=sys.stderr)
                return 1
            cid = row[0]
        c = conn.execute("SELECT id, name, domain, status FROM companies WHERE id = ?", (cid,)).fetchone()
        if not c:
            print(f"id {cid} not found", file=sys.stderr)
            return 1
        print(f"\n{'='*60}")
        print(f"  {c[1]}  ({c[2]})  status={c[3]}")
        print(f"{'='*60}")
        # 工商
        b = conn.execute("SELECT * FROM company_business WHERE company_id = ?", (cid,)).fetchone()
        if b:
            print(f"\n[工商]")
            cols = [d[0] for d in conn.execute("SELECT * FROM company_business WHERE company_id = ?", (cid,)).description]
            for col, val in zip(cols, b):
                if col != "id" and val is not None:
                    print(f"  {col}: {val}")
        # 社保
        s = conn.execute("SELECT * FROM company_social_security WHERE company_id = ?", (cid,)).fetchone()
        if s:
            print(f"\n[社保]")
            print(f"  参保人数: {s[2]}  (as of {s[3]})")
            print(f"  覆盖档位: {s[6]}")
        # Facts by dimension
        facts = list(conn.execute(
            "SELECT fact_key, fact_value, status, n_sources FROM facts WHERE company_id = ? ORDER BY fact_key",
            (cid,),
        ))
        if facts:
            print(f"\n[事实] ({len(facts)} 条)")
            by_key: dict[str, list] = {}
            for fk, fv, st, ns in facts:
                by_key.setdefault(fk, []).append((fv, st, ns))
            for fk in sorted(by_key):
                print(f"\n  {fk}:")
                for fv, st, ns in by_key[fk][:5]:
                    print(f"    - {fv}  [{st}]  n_sources={ns}")
        # Evidence count
        ec = conn.execute("SELECT COUNT(*), SUM(verification='verified') FROM evidence WHERE company_id = ?",
                          (cid,)).fetchone()
        print(f"\n[证据] {ec[0]} 条 (verified: {ec[1]})")
        # Coverage
        cov = list(conn.execute("SELECT topic, status, reason FROM coverage WHERE company_id = ?", (cid,)))
        gaps = [c for c in cov if c[1] != "available"]
        if gaps:
            print(f"\n[缺口] {len(gaps)} 项")
            for t, s, r in gaps:
                print(f"  - {t}: {s} ({r})")
    finally:
        conn.close()
    return 0


def cmd_coverage(_args: list[str]) -> int:
    """120家 × 8 topic 的覆盖矩阵。"""
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = list(conn.execute("""
            SELECT c.id, c.name, c.domain,
                   SUM(CASE WHEN cov.topic='A1.insured_count'    AND cov.status='available' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN cov.topic='B1.work_hours'        AND cov.status='available' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN cov.topic='B2.salary'           AND cov.status='available' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN cov.topic='B3.culture'          AND cov.status='available' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN cov.topic='B4.promotion'        AND cov.status='available' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN cov.topic='identity_status'     AND cov.status='available' THEN 1 ELSE 0 END)
            FROM companies c
            LEFT JOIN coverage cov ON cov.company_id = c.id
            GROUP BY c.id
            ORDER BY c.id
        """))
        print(f"\n{'ID':4s} {'公司':16s} {'行业':14s} {'A1':3s} {'B1':3s} {'B2':3s} {'B3':3s} {'B4':3s} {'IDN':3s}")
        print("-" * 70)
        n_complete = 0
        for r in rows:
            cid, name, dom, a1, b1, b2, b3, b4, idn = r
            print(f"{cid:4d} {name[:14]:16s} {dom[:12]:14s} "
                  f"{'✓' if a1 else '·':3s} "
                  f"{'✓' if b1 else '·':3s} "
                  f"{'✓' if b2 else '·':3s} "
                  f"{'✓' if b3 else '·':3s} "
                  f"{'✓' if b4 else '·':3s} "
                  f"{'✓' if idn else '·':3s}")
            if a1 and b1 and b2 and b3 and b4 and idn:
                n_complete += 1
        print("-" * 70)
        print(f"Complete (all 6 topics available): {n_complete} / {len(rows)}")
    finally:
        conn.close()
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    handlers = {
        "init": cmd_init,
        "etl": cmd_etl,
        "analyze": cmd_analyze,
        "summary": cmd_summary,
        "report": cmd_report,
        "coverage": cmd_coverage,
    }
    handler = handlers.get(cmd)
    if not handler:
        print(f"unknown command: {cmd}", file=sys.stderr)
        print(f"available: {', '.join(sorted(handlers.keys()))}", file=sys.stderr)
        return 2
    return handler(sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())
