import importlib.util
import sqlite3
import sys
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'vendor/franklin_promax/crawl_no_login'))
import no_login_crawler as crawler
spec=importlib.util.spec_from_file_location('worker',HERE/'worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class SourceBoundaries(unittest.TestCase):
    def test_search_description_cannot_cross_result_boundary(self):
        original=crawler._fetch
        crawler._fetch=lambda *a,**k: '<h3 class="res-title"><a href="https://example.com/first">遥望裁员</a></h3><h3 class="res-title"><a href="https://example.com/second">遥望招聘</a></h3><p class="res-desc">遥望招聘运营</p>'
        try:
            hits=crawler.fetch_360('遥望')
            self.assertEqual(hits[0].snippet,'')
            self.assertEqual(hits[1].snippet,'遥望招聘运营')
        finally:
            crawler._fetch=original

    def test_unknown_tools_and_original_database_destination_rejected(self):
        with self.assertRaises(ValueError):
            worker.handle({'action':'execute_sql','topics':['benefits'],'company_id':450})
        source=worker.ROOT/'.data/company-database/xray-v3-20261003.sqlite'
        with self.assertRaises(ValueError):
            worker.working_database(source,source)

    def test_old_collected_material_cannot_be_presented_as_fresh(self):
        conn=sqlite3.connect(':memory:');conn.row_factory=sqlite3.Row
        conn.execute('CREATE TABLE agent_evidence (id TEXT,company_id INTEGER,topic TEXT,collected_at TEXT)')
        conn.execute('CREATE TABLE agent_facts (id TEXT,evidence_id TEXT)')
        conn.execute("INSERT INTO agent_evidence VALUES ('franklin2-old',450,'benefits','2000-01-01T00:00:00+00:00')")
        self.assertEqual(worker.materials(conn,450,['benefits'])['evidence'],[])

if __name__=='__main__':unittest.main()
