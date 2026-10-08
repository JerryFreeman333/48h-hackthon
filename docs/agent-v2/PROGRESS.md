# Recovery checkpoint

Status: implementation in progress; no final completion claim.

2026-10-08: Read handoff and actual call chain; fetched remote main, created isolated agent-v2 worktree at 17349766b9aee5e615437dc2745d79dc5f77e270. LFS checkout/dependency installation underway. Original main left unchanged.

Baseline complete: all eight existing checks passed, including build. LFS bytes/hash match the latest manifest. Isolated dependencies installed. Implementing evidence store, identity, safe transport and parsers. Real CNInfo example downloaded (3,303,619 bytes), parsing/subject verification pending.

2026-10-08 implementation checkpoint: standalone v2 evidence store, pinned-DNS downloader, HTML/PDF parsers, four-channel discovery, original URL resolution, subject filtering, financial table extraction, source claims, targeted follow-up, checkpoints, TS boundary validation and frozen report rendering implemented. New flags default off; isolated local .env enables v2 without model credentials.

Validation so far: 18 Python adversarial/recovery tests and 18 combined TS v2/legacy-agent/background-job tests pass; typecheck passes. Real 304-page SUPCON 2025 report downloaded and parsed; physical pages 9 and 140 visually checked against extraction. Real all-channel run obtained PDF, credit index, recruitment HTML, procurement listing and Zhihu index; direct community fetch blocked and explicitly marked. Local source DB only has Zhongkong Information, a different legal entity; standalone sample is operator-only and never inserted into that DB.

Working local preview started on http://127.0.0.1:3010. Next: browser B-to-C validation, strengthen edge cases discovered by review, whole regression/build, source/acceptance docs, staged license/sensitive-file review, commits and normal remote push. Final delivery is not yet complete.

2026-10-08 21:40 HKT checkpoint: browser selected the actual Dahua database job and generated a v2-enriched C report (8 acquired sources, including body and explicitly labelled snippets), with no JS errors or horizontal overflow at 1440/390px. PDF pages 9/140 have been visually inspected. Added failed-body retry, snippet-to-body upgrade, transitive provenance grouping, zero-network checkpoint recovery into the same report, explicit source role/city/experience metadata, risk-event stage fields, employee-count extraction and bounded financial display. 25 Python tests and 17 agent TS tests pass. Offline old/new collector comparison saved locally: repeated old rows 8→16; v2 documents 5→5, 6 aligned financial facts; no model calls. Final full regression/build, documentation, final staged review and remote SHA verification remain.
