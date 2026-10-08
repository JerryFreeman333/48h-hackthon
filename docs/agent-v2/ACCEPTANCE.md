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

No inherited test failure observed. New implementation and real-source validation are still in progress; baseline success does not validate the new code.
