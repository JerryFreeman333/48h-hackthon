# Third-party notices

## SurveyJS Form Library

survey-core and survey-js-ui 3.1.2 are used directly under MIT. Source: https://github.com/surveyjs/survey-library . Installed package license headers are retained; package-lock.json pins exact versions and integrity. No proprietary Survey Creator/Dashboard/PDF Generator is included.

MIT License

Copyright (c) 2015-2025 Devsoft Baltic OÜ - http://surveyjs.io/

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## O*NET Mini-IP

O*NET® Career Exploration Tools by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). O*NET® is a trademark of USDOL/ETA. The official 2016 English Mini-IP item text is reproduced without translation or rewriting under CC BY-ND 4.0. The item JSON is not licensed under any blanket repository code license.

Original report: https://www.onetcenter.org/dl_files/Mini-IP.pdf

License and attribution requirements: https://www.onetcenter.org/license_tools.html

CC BY-ND 4.0: https://creativecommons.org/licenses/by-nd/4.0/

Software-only public integration; USDOL/ETA has not approved, endorsed, or tested this product. No translated/adapted O*NET item text is distributed in this public repository. v0.5 supports explicit private local translation review using a separate Git-ignored file under CC BY-ND section 2(a)(1)(B); it is not a public translated release. Public content adaptation must separately satisfy the applicable developer license and validation requirements.

## Architectural references

Career DNA V2 reference: https://github.com/thphuc06/agentic-career-recommendation-system/tree/87844ee3e19717875f59f727b5a313b231f5a81e . No license was found in that fixed tree; repository metadata reports license=null. No protected source code or Vietnamese question/narrative text was copied. Independent replacements and limits are recorded in docs/PORT_MAP.md.

riasec-co (MIT): https://github.com/affromero/riasec-co ; psyche-public (original code MIT with separate third-party instrument terms): https://github.com/AshitaOrbis/psyche-public . Referenced for module separation and instrument/license registry design only. No source blocks, psychometric questions, Bayesian inference, or LLM synthesis were copied from those projects.

## IPIP Mini-IPIP

The complete English 20-item scoring key was extracted from https://ipip.ori.org/MiniIPIPKey.htm . IPIP items and scales are public domain; permission: https://ipip.ori.org/newPermission.htm . Scoring anchors and sum/reversal instructions: https://ipip.ori.org/newScoringInstructions.htm . Original research: Donnellan, Oswald, Baird, and Lucas (2006), *The Mini-IPIP scales: Tiny-yet-effective measures of the Big Five factors of personality*, https://doi.org/10.1037/1040-3590.18.2.192 . Original research does not establish Chinese validation of this implementation. Official scoring-key row order is recorded explicitly; v0.4 adds a faithful Chinese draft with the English originals retained, under the IPIP public-domain permission. It has not undergone independent bilingual review, back-translation, cognitive interviews, or psychometric validation; it is not an official validated Chinese version.

## O*NET Database 31.0

This product uses the O*NET® 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), available at https://www.onetcenter.org/database.html under CC BY 4.0: https://www.onetcenter.org/license_db.html . Data files were selected, filtered to complete OI six-dimensional profiles, and reorganized into JSON; Chinese browsing aliases were added by this project and are not official O*NET translations. Original title, description, raw ratings, scale/element IDs, data date, domain source, source URLs, and hashes are retained. USDOL/ETA has not approved, endorsed, or tested this product. O*NET® is a trademark of USDOL/ETA. Database licensing is separate from Career Exploration Tools licensing.

## Retired local parsing dependencies and active validation dependency

- pdf-parse 2.4.5, Apache-2.0: https://github.com/mehmet-kozan/pdf-parse
- mammoth 1.13.0, BSD-2-Clause: https://github.com/mwilliamson/mammoth.js
- Tesseract.js 7.0.0, Apache-2.0: https://github.com/naptha/tesseract.js
- Zod 4.6.5, MIT: https://github.com/colinhacks/zod
- Optional tessdata_fast English / simplified Chinese models, Apache-2.0: https://github.com/tesseract-ocr/tessdata_fast/tree/65727574dfcd264acbb0c3e07860e4e9e9b22185 . Downloaded models remain local and Git-ignored; installer checks official Git blob hashes and records SHA256.

Dependency licenses are retained in installed npm packages; package-lock.json pins versions and integrity. Parsing runs on the local server and does not send personal files to those projects.


v0.4 retirement: pdf-parse, mammoth, Tesseract.js and the optional OCR installer are no longer active dependencies or runtime code. Their notices are retained for the historical archive. Zod remains active. O*NET Chinese draft is private local adaptation under CC BY-ND section 2(a)(1)(B), not distributed or enabled; modified public versions require the Developer License validation study and notices: https://www.onetcenter.org/license_toolsdev.html . This is an implementation release restriction, not compliance by disclaimer.

v0.5 local review: `npm start` continues to disable private O*NET translation. `npm run start:review` explicitly reads the user's own private draft for loopback-only authenticated review. Chinese O*NET items, user state and review snapshots are excluded from Git publication; no validation study or public-release permission beyond the stated licenses is claimed. A runtime flag or disclaimer does not itself satisfy Developer License validation requirements.
