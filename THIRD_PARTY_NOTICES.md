# Third-party notices for Agent v2

The existing project and module notices remain applicable. This file does not change the project's license.

Agent v2 adapts a small evidence-integrity verifier from Multi-Agent-Research-Assistant, copyright (c) 2026 Aditya Mhaske, under MIT. Its full license is retained at `modules/research-agent/v2/licenses/MARA-MIT.txt`; the modified file identifies its upstream commit and changes.

Agent v2 calls Beautiful Soup, pdfplumber and pypdfium2 as installed dependencies. Full notices from the validated direct/transitive distributions, including PDFium's bundled components, are retained under `modules/research-agent/v2/licenses/dependencies/`. The adjacent dependency manifest records versions and notice hashes. Dependency wheels also carry their own notices. Recheck platform-specific bundled licenses when changing wheels.

See `docs/agent-v2/REUSE_MANIFEST.md` for exact upstream revisions, paths, modifications and verification. GPT Researcher and Docling were evaluated; their code is not distributed here. No BettaFish or DeerFlow code is included.
