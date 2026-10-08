"""Idempotent evidence with separate source attempts and resumable stage snapshots."""
from __future__ import annotations
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def stable_id(prefix: str, *parts) -> str:
    encoded = json.dumps(parts, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return prefix + '-' + hashlib.sha256(encoded.encode('utf-8')).hexdigest()[:32]


class EvidenceStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS v2_schema(version INTEGER PRIMARY KEY);
            INSERT OR IGNORE INTO v2_schema VALUES (1);
            CREATE TABLE IF NOT EXISTS v2_documents(id TEXT PRIMARY KEY, company_id INTEGER NOT NULL, content_hash TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS v2_facts(id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES v2_documents(id), payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS v2_runs(id TEXT PRIMARY KEY, company_id INTEGER NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS v2_run_documents(run_id TEXT NOT NULL REFERENCES v2_runs(id), evidence_id TEXT NOT NULL REFERENCES v2_documents(id), PRIMARY KEY(run_id,evidence_id));
            CREATE TABLE IF NOT EXISTS v2_attempts(id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES v2_runs(id), payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS v2_checkpoints(run_id TEXT NOT NULL REFERENCES v2_runs(id), stage TEXT NOT NULL, saved_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(run_id,stage));
            CREATE INDEX IF NOT EXISTS v2_document_company ON v2_documents(company_id);
        ''')
        self.db.commit()

    def close(self):
        self.db.close()

    def start(self, run_id, identity):
        now = utcnow()
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO v2_runs VALUES(?,?,?,?,?,?)', (run_id, identity['company_id'], now, now, 'running', json.dumps(identity, ensure_ascii=False)))
            self.db.execute('UPDATE v2_runs SET status=?,updated_at=? WHERE id=?',('running',now,run_id))

    def finish(self, run_id, status):
        with self.db:
            self.db.execute('UPDATE v2_runs SET status=?,updated_at=? WHERE id=?', (status, utcnow(), run_id))

    def save_document(self, run_id, document):
        with self.db:
            existing = self.db.execute('SELECT payload FROM v2_documents WHERE id=?', (document['id'],)).fetchone()
            if existing:
                saved = json.loads(existing['payload'])
                old = {**document,'collected_at':saved['collected_at']}
                # Material identity and first collection date are immutable. Add discovery lineage only.
                old['discovered_urls'] = sorted(set(saved.get('discovered_urls', []) + document.get('discovered_urls', [])))
                old['channels'] = sorted(set(saved.get('channels', []) + document.get('channels', [])))
                self.db.execute('UPDATE v2_documents SET payload=? WHERE id=?', (json.dumps(old, ensure_ascii=False), old['id']))
                document = old
            else:
                self.db.execute('INSERT INTO v2_documents VALUES(?,?,?,?)', (document['id'], document['company_id'], document['content_hash'], json.dumps(document, ensure_ascii=False)))
            self.db.execute('INSERT OR IGNORE INTO v2_run_documents VALUES(?,?)', (run_id, document['id']))
        return document

    def save_facts(self, facts):
        with self.db:
            for fact in facts:
                self.db.execute('INSERT OR IGNORE INTO v2_facts VALUES(?,?,?)', (fact['id'], fact['evidence_id'], json.dumps(fact, ensure_ascii=False)))

    def attempt(self, run_id, attempt):
        with self.db:
            self.db.execute('INSERT INTO v2_attempts(run_id,payload) VALUES(?,?)', (run_id, json.dumps(attempt, ensure_ascii=False)))

    def checkpoint(self, run_id, stage, value):
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO v2_checkpoints VALUES(?,?,?,?)', (run_id, stage, utcnow(), json.dumps(value, ensure_ascii=False)))

    def load_checkpoint(self, run_id, stage, ttl_seconds=86400):
        row = self.db.execute('SELECT * FROM v2_checkpoints WHERE run_id=? AND stage=?', (run_id, stage)).fetchone()
        if not row:
            return None
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(row['saved_at'])).total_seconds()
        if not 0 <= age < ttl_seconds:
            return None
        return json.loads(row['payload'])

    def snapshot(self, run_id):
        docs = [json.loads(r[0]) for r in self.db.execute('SELECT d.payload FROM v2_documents d JOIN v2_run_documents r ON d.id=r.evidence_id WHERE r.run_id=? ORDER BY d.id', (run_id,))]
        facts = [json.loads(r[0]) for r in self.db.execute('SELECT f.payload FROM v2_facts f JOIN v2_run_documents r ON f.evidence_id=r.evidence_id WHERE r.run_id=? ORDER BY f.id', (run_id,))]
        attempts = [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM v2_attempts WHERE run_id=? ORDER BY id', (run_id,))]
        return {'documents': docs, 'facts': facts, 'attempts': attempts}
