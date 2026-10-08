# Reuse manifest

All upstream inspection below is pinned. No entire upstream framework is shipped.

| Project / URL | Pinned SHA or version | Original path | Local use | Classification and rationale |
| --- | --- | --- | --- | --- |
| [MARA](https://github.com/adityamhaske/Multi-Agent-Research-Assistant) | a887720b4621b9c0b116c0b6cccbe9aee682be36 | backend/research_engine/verify_bundle.py | modules/research-agent/v2/provenance.py | **Adapted** CheckResult and evidence-integrity check, MIT. Replaced Pydantic manifest with X-Ray documents, whole-text normalization, table locators, subject and quote validation. Approval and bundle-export workflows omitted. Full license retained in v2/licenses/MARA-MIT.txt. |
| MARA | same | backend/research_engine/bundle.py; docs/getting-started/19-research-record.md | v2/store.py architecture | **Reference only** for evidence/claim/report separation. Database and IDs independently implemented for existing SQLite/Python boundaries. |
| [GPT Researcher](https://github.com/assafelovic/gpt-researcher) | 5cdad9cb434754188b78bd998df18dd8d502cf7e | multi_agents/agents/{orchestrator,editor,reviewer}.py | v2/pipeline.py design | **Evaluated/reference only**, Apache-2.0 root verified. LangGraph graph and agent dependencies not copied; existing Next/Python boundary is smaller. Pinned editor accepts review=None; reviewer may return None without enabled guidelines. X-Ray keeps unresolved when its own budget is exhausted. The handoff's exact max-revision auto-accept claim was not established from these inspected files and is not asserted. |
| [Docling](https://github.com/docling-project/docling) | 3181d9fcbb8b7568ceba14b7ed5cd21f66b221e7 | LICENSE, repository tree | none | **Evaluated, not used**. MIT root checked. Existing lightweight PDF dependencies extracted the real 304-page Chinese report and aligned tables in seconds. No model downloads, copied Docling code or claims of Docling validation. |
| [Beautiful Soup](https://www.crummy.com/software/BeautifulSoup/) | 4.14.3 | installed bs4 dependency | v2/parsers.py; v2/channels.py | **Dependency call**, MIT; DOM-scoped search cards and article/table extraction. No copied implementation. |
| [pdfplumber](https://github.com/jsvine/pdfplumber) | 0.11.9 | installed dependency | v2/parsers.py | **Dependency call**, MIT; aligned table cells and coordinates. |
| [pypdfium2](https://github.com/pypdfium2-team/pypdfium2) | 5.14.0 | installed dependency | v2/parsers.py and local page QA | **Dependency call**, BSD-3-Clause/Apache-2.0 plus bundled PDFium notices. Used for bounded text extraction and page rendering. Wheel license/notice files preserved verbatim, including bundled dependency notices. |
| [pypdf](https://github.com/py-pdf/pypdf) | 6.19.0 | installed dependency during evaluation | no production import | **Evaluated, not used**. Full extraction of the sample exceeded the 80-second experimental budget; replaced with pypdfium2. Not a required v2 dependency. |
| BettaFish | no version copied | none | none | **Not used**. Handoff's abstract channel collaboration idea only; no code, prompts, or other concrete GPL material downloaded or copied. |
| DeerFlow | not inspected | none | none | **Not used**; no need for another runtime. |

The existing Franklin vendor source is unchanged; its prior provenance remains in `modules/research-agent/vendor/README.md`. V2 does not call vendor mutation, registration, selftest, or whole-library analysis.

## Dependency notices and verification

`requirements-v2.txt` pins direct dependencies; `requirements-v2-lock.txt` pins the validated transitive set. `v2/licenses/dependency-manifest.json` lists exact installed notice paths and file hashes. `collect_v2_licenses.py` copies notices from installed distributions without changing their contents. Platform-specific wheels must preserve their own bundled notices as well.

Validation covers altered evidence hashes, missing citations, wrong company, wrong table cell, negation, scope/period differences and real PDF tables. The source verifier does not independently establish the truth of a company's disclosure.
