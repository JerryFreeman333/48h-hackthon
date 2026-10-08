# Acceptance record

## Baseline — 2026-10-08

All at base `17349766b9aee5e615437dc2745d79dc5f77e270`, Node 24.20.0, Python 3.12.10. Logs are local/ignored under `.data/agent-v2-validation/baseline-*.log`.

| Check | Exit | Seconds |
| --- | --- | --- |
| npm run typecheck | 0 | 21.4 |
| npm test | 0 | 12.5 |
| npm run test:b | 0 | 2.6 |
| npm run test:c | 0 | 13.2 |
| npm run test:integration | 0 | 9.4 |
| npm run build | 0 | 178.1 |
| node --import tsx --test modules/research-agent/research.test.ts packages/integration/research-jobs.test.ts | 0 | recorded in local log |
| .venv/Scripts/python.exe modules/research-agent/test_worker.py | 0 | recorded in local log |

LFS snapshot is real SQLite, 214,609,920 bytes; SHA256 `81fb91c41495c7d0f53dc549d79e16eb63c995f003ca0fc1d8371da2e118a0f4`, matching the current manifest. Root README's older byte count is stale.

No inherited test failure observed. Baseline success alone did not validate new code; final checks follow.

## Final local checks — 2026-10-08, from 21:52 HKT

All commands below exited 0. Logs remain ignored under `.data/agent-v2-validation/final-*.log`; their timestamps are preserved. Changed parser/claim rules were tested again after the full regression. Production build was followed by an actual browser run of `npm start`, not just development-mode screenshots.

| Command | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm test` | 9 passed |
| `npm run test:b` | 16 passed |
| `npm run test:c` | 240 passed |
| `npm run test:integration` | 55 passed, including background jobs and archived-report behavior |
| `npm run test:agent` | 17 passed: 9 existing MiniMax/v1 boundary tests + 8 v2 tests |
| `.venv/Scripts/python.exe -X utf8 -m unittest discover -s modules/research-agent -p 'test_v2*.py' -v` | 26 passed |
| `.venv/Scripts/python.exe -X utf8 modules/research-agent/test_worker.py` | 4 existing tests passed |
| `npm run build` | production build passed, 17 static pages generated |

Local regression totals: 337 TypeScript tests and 30 Python tests. No new failure left unresolved. Linux CI was configured for Node 24/Python 3.12; its remote execution is distinct from these local results. An existing development CSS compatibility warning (`align-items: start`) was observed; no unrelated UI style rewrite was made.

## Required behaviors

| Scenario | Verified behavior |
| --- | --- |
| Wrong company, subsidiary prefix, conflicting identity | rejects wrong subject; legal name/credit clues never confirm signing employer |
| HK 00700, SH 688777, non-code digit substrings | preserves market and width; rejects arbitrary numeric text and inconsistent market |
| Three repost URLs and transitive original links | content/URL/original lineage groups count once; repeat writes retain original collection date |
| Shared document across dimensions | recruitment source supports pay/hours/benefits/mental-space without fabricating separate sources |
| Capital/negative profit/positive cashflow | separates metrics; no job-loss, wage-arrears or available-cash assertion |
| Units, currencies, consolidation, reversed/mid-table year headers | table positions and units checked; ambiguous currency/unit does not produce values |
| 20–30 万 including bonus; unknown base salary | keeps condition, does not calculate fixed monthly salary |
| No overtime/promotion/year-end bonus; conditional bonus | preserves full negated/conditional sentence |
| Technical autonomy, navigation categories, article table of contents | does not become mental space, pay, litigation or culture evidence |
| Employee experience across time/department | marks incomparable/time/scope differences, not automatic contradiction |
| Procurement intent/award/other company's purchasing | keeps stage; no delivered or per-person benefits; other buyer explicitly cannot support target-company welfare |
| Login/captcha/timeout/empty/parse error | distinct statuses; no “no risk” fallback |
| Restart, partial failure, snippet upgrade | committed sources retained; failed body retried; full body replaces same-URL snippet in current snapshot |
| Tool timeout | current report can recover already committed evidence with zero new network/model requests |
| Invented ID, company, excerpt hash, numeric value or locator | rejected atomically; original candidate bundle preserved |
| Follow-up budget/no gain | at most 2 rounds, unresolved remains unknown |
| Summary-only source | access level explicit; no fabricated original post/comment/employee identity |
| Private IP and redirected private destination | rejected; validated public IP pinned for connection; streamed size cap enforced |
| Fixture/manual separation | synthetic materials rejected from live/manual report merge |

## Real sources: separate from fixtures and models

Final sample, rule `xray-evidence-rules-5`: 8 acquired materials, 84 stored facts/source claims, including 49 aligned financial/employee records; 20.155 seconds for this specific bounded run. It remains **partial**, with unavailable sources and unanswered job-specific questions. Runtime varies with network/cache and is not a speed benchmark.

The [CNInfo PDF](https://static.cninfo.com.cn/finalpage/2026-04-21/1225131222.PDF) was downloaded (3,303,619 bytes), verified as 中控技术股份有限公司 2025 年年度报告, and parsed through all 304 physical pages. Raw SHA256: `d53bf4d7ed31f4e81b3f383222864127f513eb4de7eb9c47d5ebfdfdc70c39f0`. Page 9's mid-table annual/year-end header change was caught during visual QA and corrected; page 140's consolidated cash row was visually checked. The example preserves distinct physical/printed page fields even when their values happen to coincide.

Final real output also passes the TypeScript schema and subject/hash/citation/table-value checks and renders through the same v2 report function. Credit indexes, recruitment HTML, procurement HTML/listings and Zhihu index were actually obtained. Direct community access remains restricted. Seven-platform status is documented in `SOURCE_CAPABILITIES.md`; no claim of all-platform direct integration.

**Model verification:** new path uses no model, actual calls 0. Real MiniMax API/key was not tested in this task. Existing provider/tool boundary tests pass; this does not certify a live model subscription or new model planning.

**Browser verification:** Chrome/Playwright completed actual A confirmation → B selection of the real Dahua embedded-software candidate → C report, first against dev, then against the production build on port 3010. Preferences were synthetic; original source database was real. At 1440px desktop and 390px phone width, document scroll width equaled viewport width and there were no page JavaScript errors. Viewport screenshots of actual interpretations and the real PDF example were inspected. The Dahua path has limited substantive claims after directory/menu filtering; retained materials and explicit gaps are the correct result, not a fabricated complete investigation. Full owner-scoped archive and browser cookies remain local/ignored.

## Same-corpus old/new comparison

Actual old/new Python collectors ran twice on the same synthetic company, unconfirmed job scope and seven topics. The old collector received all corpus hits for each mocked topic query; v2 used its channel fixture and mock article fetches. This is extraction/storage comparison, not a fair live search-ranking or network-latency benchmark.

- v1: 8 selected evidence rows across 4 distinct URLs; stored rows increased from 8 to 16 after repeat; no located body or aligned financial table representation.
- v2: 5 source documents including 4 parsed bodies and 1 summary; repeat storage stayed 5; 6 aligned financial facts; 13/13 extracted facts passed original-quote/locator validation; unknown matters remained partial.
- Both used 0 models. Do not infer a production speedup, financial cost saving or general accuracy percentage from this fixture.

Reproduce with `compare_v2_fixture.py`; submitted summary in `examples/comparison-summary.json`. Full synthetic report fixture is clearly marked. Actual public example in `examples/public-disclosure.json` includes only two short financial rows, not the complete PDF or a social post.

## Integrity and remaining limits

Source SQLite SHA256 rechecked after browser runs: `81fb91c41495c7d0f53dc549d79e16eb63c995f003ca0fc1d8371da2e118a0f4`, still manifest-identical. Original main checkout remains clean at `3588633d0511776aad6d3795f6e1683059504288`. All 31 dependency notice files were checked against Git blob bytes and their hash manifest; original line endings/whitespace preserved.

Remaining limits are explicit capabilities, not hidden successful checks: no OCR, no direct access to all named platforms, no model API validation, no production deployment, no guaranteed job/entity linkage, no comprehensive confidence calibration or paraphrase-repost detection. No unresolved local test failure. See `REVIEW_PACKET.md` for semantic review priorities.

Actually used Skill: `pdf:pdf`, for physical-page rendering and visual checks. No claim of using Docling, a model research framework or an uninvoked UI redesign skill.
