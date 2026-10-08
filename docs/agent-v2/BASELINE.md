# Agent v2 baseline

Date: 2026-10-08 (Asia/Hong_Kong). Authorized by the user in this chat: implement the supplied handoff, iterate within an eight-hour budget, commit and normally push `agent-v2`.

- Repository: https://github.com/JerryFreeman333/48h-hackthon
- Base: `17349766b9aee5e615437dc2745d79dc5f77e270` (`origin/main`). Original local main was `3588633d0511776aad6d3795f6e1683059504288`, clean and left unchanged.
- No remote agent-v2 existed at initial fetch. Isolated worktree: `C:/Users/Sophie/Documents/Codex/agent-v2-20261008`.
- No repository AGENTS.md or CONTRIBUTING files found. Read root README, CURRENT_STATE, module READMEs, worker and report integration code. Historical module-only ownership restrictions yield to this explicitly authorized integration task.
- Node 24.20.0; Python 3.12.10; Git LFS 3.7.1. Fresh npm/Python installation and LFS checkout in progress at initial checkpoint.
- Existing workflow `.github/workflows/checks.yml` runs checks on pushes/PRs; no deployment workflow found.

## Actual call chain

`/research` -> `POST /api/integration/research` -> `research-jobs.start` -> `demo-flow.runDatabase` -> `databaseBundle` -> `enrichWithAgent` -> `runPythonTool` -> `worker.py`. Results flow through CandidateBundle, `extractNeedLeads`, C pipeline, immutable report archive, `buildSectorAnalysis`, `/flow/reports/:id`.

Public contracts remain 1.0.0. Legacy reports preserve frozen inputs. Original SQLite is opened read-only by the integration layer. Old worker copies the whole database to a work database; new v2 will use separate tables without this costly copy.

## Verified gaps

- Old worker ID includes collection timestamp and topic: reruns and cross-topic matches create separate rows.
- Text is limited to search snippets; `materials()` returns four rows per topic. PDF/raw text/page locators are absent.
- Fetch errors, blocked pages and true empty searches collapse into empty/failed. Old download wrapper only checks initial hostname, not redirects or DNS.
- Subject matcher accepts broad aliases; stock inference relies on vendor helpers.
- No key prevents any new acquisition; model orchestrates every collection. A deterministic v2 path is needed.
- `growth` means promotion/learning throughout A and C. Mental space is a separate v2 dimension mapped to culture only for existing public topics, never relabeling growth.
- Existing 360 result-boundary fix is already present; do not claim it as new work.
- Report material limit is a presentation limit; full v2 evidence must survive separately in the store and frozen provenance.

Baseline test results will be recorded in ACCEPTANCE.md. No test success is claimed by this initial checkpoint.
