"""
从东方财富 F10 拉法人/全称，写回 companies.aliases。
针对已有 verified 数据的 A 股 14 家。
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "xray_hangzhou.db"
sys.path.insert(0, str(DB_PATH.parent.parent))  # project root（不是 db/）
from crawl_no_login.no_login_crawler import fetch_eastmoney_f10, guess_a_code


def refresh_aliases():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")
    rows = conn.execute("""
        SELECT id, name, known_listing, aliases
        FROM companies
        WHERE id <= 120
    """).fetchall()
    n_updated = 0
    for cid, name, listing, existing_aliases in rows:
        a_code = guess_a_code(listing or "")
        if not a_code:
            continue
        hits = fetch_eastmoney_f10(a_code)
        if not hits:
            continue
        # 提取 LEGAL_PERSON / ORG_NAME
        new_aliases = []
        for h in hits:
            org = h.extra.get("org_name")
            legal = h.extra.get("legal_person")
            if org and org != name:
                new_aliases.append(org)
            if legal and legal != name:
                new_aliases.append(f"法人:{legal}")
        if not new_aliases:
            continue
        # merge with existing
        existing = json.loads(existing_aliases) if existing_aliases else []
        merged = list(dict.fromkeys(existing + new_aliases))[:6]  # 去重 + 限 6
        conn.execute(
            "UPDATE companies SET aliases = ? WHERE id = ?",
            (json.dumps(merged, ensure_ascii=False), cid),
        )
        n_updated += 1
        print(f"  [{cid:3d}] {name[:14]:14s} +{len(new_aliases)} aliases")
    conn.commit()
    print(f"\n=== Updated {n_updated} companies with EM-derived aliases ===")
    conn.close()


if __name__ == "__main__":
    refresh_aliases()
