"""
Analysis orchestrator: 读 evidence → 跑 extractor → 写 facts。

每条 fact 必须挂 ≥1 evidence_id（标准 §0.4）；
每个 fact_value 写进 facts.fact_value，
对应的 evidence 行更新 fact_key 和 rating_dimension 字段。
"""
from __future__ import annotations

import json
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "xray_hangzhou.db"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from extractors import Candidate, extract_all  # noqa: E402

DIMENSION_FACT_KEY = {
    "B1.hours":     "B1.work_hours",
    "B2.salary":    "B2.salary_mention",
    "B3.culture":   "B3.culture_polarity",
    "B4.promotion": "B4.promotion_evidence",
}


def run(only_company_id: int | None = None, run_id: str | None = None) -> dict:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=ON")
    if run_id is None:
        run_id = f"ana_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    started = datetime.now().isoformat(timespec="seconds")
    n_extracted = 0
    n_facts = 0
    n_evidence_updated = 0

    try:
        # 噪音源白名单：百科/词典/360 自带链接剔除
        NOISE_HOSTS = (
            "%baike.baidu.com%", "%m.baike.com%", "%hanyuguoxue.com%",
            "%zidian.gushici.net%", "%chagushici.net%", "%shidianguji.com%",
            "%hgcha.com%", "%www.so.com%", "%so.com/link?%",
            "%www.zdic.net%", "%xueqiu.com/user%",  # 雪球个人主页
            "%blog.csdn.net%",  # CSDN 博客噪音大
            "%www.4399.com%",  # 小游戏站
            "%www.upcv.tech%", "%email.163.com%", "%doc.xiaoji.com%",
            "%campus.niuqizp.com%", "%jobs.bytedance.com%",  # 招聘页本身
            "%service.", "%limuks.com%", "%web.4399.com%",
            "%xueqiu.com/S/%", "%www.zhipin.com%",  # BOSS 招聘页噪音
        )
        sql = "SELECT id, evidence_id, excerpt, title, company_id, retrieved_at FROM evidence"
        params: tuple = ()
        where = []
        if only_company_id is not None:
            where.append("company_id = ?")
            params = (only_company_id,)
        noise_clause = " AND ".join(f"url NOT LIKE ?" for _ in NOISE_HOSTS)
        if noise_clause:
            where.append("(" + noise_clause + ")")
            params = params + NOISE_HOSTS
        if where:
            sql += " WHERE " + " AND ".join(where)
        cur = conn.execute(sql, params)
        for ev_id, ev_uuid, excerpt, title, company_id, ret_at in cur:
            if not excerpt:
                continue
            # 合并 title + excerpt 给 extractor
            text = (title or "") + " " + excerpt
            candidates = extract_all(text)
            if not candidates:
                continue
            n_extracted += 1
            evidence_ids: list[str] = []
            # 优先级：定性维度（B3.culture > B4.promotion > B1.hours > B2.salary）
            # 因为 B2 是高频抽取，但维度覆盖统计关心 B1-B4 是否都有
            QUALITATIVE_FIRST = ["B3.culture", "B4.promotion", "B1.hours", "B2.salary"]
            dominant_cand = sorted(
                candidates,
                key=lambda c: QUALITATIVE_FIRST.index(c.dimension)
                              if c.dimension in QUALITATIVE_FIRST else 99,
            )[0]
            for cand in candidates:
                fact_id = f"ft_{run_id}_{n_facts:05d}"
                evidence_ids_for_fact = [ev_uuid]
                fact_key = DIMENSION_FACT_KEY.get(cand.dimension, cand.dimension)
                status = "unknown" if cand.polarity == "neutral" else "supported"
                if cand.polarity == "mixed":
                    status = "conflicting"
                conn.execute(
                    """INSERT OR IGNORE INTO facts
                       (fact_id, company_id, job_id, fact_key, fact_value,
                        status, evidence_ids, n_sources, n_verified,
                        retrieved_at, note)
                       VALUES (?, ?, NULL, ?, ?, ?, ?, 1, 0, ?, ?)""",
                    (fact_id, company_id, fact_key, cand.value,
                     status, json.dumps(evidence_ids_for_fact, ensure_ascii=False),
                     ret_at or started, cand.text_match[:60]),
                )
                n_facts += 1
                evidence_ids.append(ev_uuid)
            conn.execute(
                """UPDATE evidence
                   SET fact_key = ?, rating_dimension = ?, rating = ?
                   WHERE id = ?""",
                (DIMENSION_FACT_KEY.get(dominant_cand.dimension),
                 dominant_cand.dimension, dominant_cand.polarity, ev_id),
            )
            n_evidence_updated += 1
        conn.commit()
        finished = datetime.now().isoformat(timespec="seconds")
        conn.execute(
            """UPDATE etl_runs SET finished_at = ?, n_facts = n_facts + ?
               WHERE run_id = (
                 SELECT run_id FROM etl_runs ORDER BY started_at DESC LIMIT 1)""",
            (finished, n_facts),
        )
        conn.commit()
        summary = {
            "run_id": run_id,
            "n_extracted": n_extracted,
            "n_facts": n_facts,
            "n_evidence_updated": n_evidence_updated,
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return summary
    finally:
        conn.close()


if __name__ == "__main__":
    cid = int(sys.argv[1]) if len(sys.argv) > 1 else None
    run(cid)
