#!/usr/bin/env python3
"""C-only documentation/fixed-fixture audit, not a runtime schema or match engine.

Uses Python 3 standard library. Does not access network, model, database or other
modules. Negative cases mutate the fixed demo input; they are not application
regressions or a claim that a production validator exists.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/C_DOCUMENT_VERIFICATION_2026-10-02.json"
RECEIPT = ROOT / "docs/C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json"
SOURCE = ROOT / "docs/source/C_Matching_Report.original.md"
FIXTURE_NAMES = (
    "user-profile.demo.v1.json",
    "search-intent.demo.v1.json",
    "candidate-bundle.demo.v1.json",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fixed_input_checks(profile: dict, intent: dict, bundle: dict) -> dict[str, bool]:
    """Only the 15 documented fixed-fixture invariants, NOT full schema parsing."""
    evidence = {item["evidenceId"]: item for item in bundle["evidence"]}
    jobs = {item["jobId"]: item for item in bundle["jobs"]}
    companies = {item["companyId"]: item for item in bundle["companies"]}
    facts = bundle["facts"]
    return {
        "schema_version_all_1_0_0": all(obj["schemaVersion"] == "1.0.0" for obj in (profile, intent, bundle)),
        "project_ids_match": profile["projectId"] == intent["projectId"] == bundle["projectId"],
        "modes_match_demo": profile["mode"] == intent["mode"] == bundle["mode"] == "demo",
        "profile_confirmed": bool(profile["confirmedAt"]) and profile["assessment"]["status"] == "confirmed",
        "profile_intent_link": profile["profileId"] == intent["profileId"] and profile["revision"] == intent["profileRevision"],
        "bundle_intent_link": bundle["intentId"] == intent["intentId"] and bundle["intentRevision"] == intent["revision"],
        "fact_evidence_refs_exist": all(fact["evidenceIds"] and all(eid in evidence for eid in fact["evidenceIds"]) for fact in facts),
        "fact_job_company_scopes_match": all(
            fact["jobId"] in jobs and fact["companyId"] in companies
            and jobs[fact["jobId"]]["companyId"] == fact["companyId"]
            and all(eid in evidence and evidence[eid]["companyId"] == fact["companyId"]
                    and evidence[eid]["jobId"] == fact["jobId"]
                    and evidence[eid]["scope"] == "job" for eid in fact["evidenceIds"])
            for fact in facts
        ),
        "job_company_refs_exist": all(job["companyId"] in companies for job in bundle["jobs"]),
        "evidence_mode_consistent": all(item["mode"] == bundle["mode"] for item in bundle["evidence"]),
        "confirmed_hard_sales_constraint": any(
            item["key"] == "accept_sales_kpi" and item["value"] is False
            and item["strength"] == "hard" and item["confirmed"] is True
            for item in profile["preferences"]
        ),
        "supported_sales_kpi": any(item["key"] == "job.sales_kpi" and item["value"] is True and item["status"] == "supported" for item in facts),
        "salary_total_not_fixed": jobs["job-demo-1"]["salary"]["basis"] == "total",
        "vacancy_unknown": jobs["job-demo-1"]["vacancyStatus"] == "unknown",
        "financials_not_connected": any(item["topic"] == "business_financials" and item["status"] == "not_connected" for item in bundle["coverage"]),
    }


def negative_checks(inputs: list[dict]) -> dict[str, bool]:
    cases = (
        ("unconfirmed_profile", "profile_confirmed", 0, ("confirmedAt",), None),
        ("different_profile_same_revision", "profile_intent_link", 1, ("profileId",), "profile-other"),
        ("stale_intent_revision", "bundle_intent_link", 2, ("intentRevision",), 2),
        ("mixed_evidence_mode", "evidence_mode_consistent", 2, ("evidence", 0, "mode"), "live"),
        ("missing_evidence_reference", "fact_evidence_refs_exist", 2, ("facts", 0, "evidenceIds"), ["missing-evidence"]),
        ("wrong_fact_subject", "fact_job_company_scopes_match", 2, ("facts", 0, "companyId"), "company-other"),
        ("dangling_job_company", "job_company_refs_exist", 2, ("jobs", 0, "companyId"), "missing-company"),
        ("fixture_salary_changed_to_fixed", "salary_total_not_fixed", 2, ("jobs", 0, "salary", "basis"), "fixed"),
    )
    results = {}
    for name, target_check, index, path, value in cases:
        modified = copy.deepcopy(inputs)
        cursor = modified[index]
        for component in path[:-1]:
            cursor = cursor[component]
        cursor[path[-1]] = value
        results[name] = fixed_input_checks(*modified)[target_check] is False
    return results


def audit() -> dict:
    errors = []
    old_audit = json.loads((ROOT / "docs/contract-audit-2026-10-02.json").read_text())
    source = SOURCE.read_text()
    source_blocks = [json.loads(block) for block in re.findall(r"```json\s*\n(.*?)\n```", source, re.S)]
    inputs = [json.loads((ROOT / "fixtures" / name).read_text()) for name in FIXTURE_NAMES]
    originals_identical = len(source_blocks) == 3 and source_blocks == inputs
    source_unchanged = sha256(SOURCE) == old_audit["sourceFiles"]["C"]["sha256"]
    if not originals_identical:
        errors.append("fixtures differ from the three original public JSON objects")
    if not source_unchanged:
        errors.append("C source copy differs from the recorded original attachment SHA256")
    checks = fixed_input_checks(*inputs)
    negative = negative_checks(inputs)
    if checks != old_audit["inputConsistencyChecks"]:
        errors.append("15 fixed-input checks differ from the historical audit")
    errors.extend("fixed input check failed: " + key for key, passed in checks.items() if not passed)
    errors.extend("negative fixture mutation not detected: " + key for key, passed in negative.items() if not passed)

    expected = json.loads((ROOT / "fixtures/C_EXPECTED_BEHAVIOR.demo.v1.json").read_text())
    if expected.get("artifactType") != "c_expected_behavior_not_match_report" or expected.get("expectationStatus") != "manual_review_expectation_not_executed_by_application":
        errors.append("expected behavior fixture is not clearly labelled as unexecuted manual expectation")
    if expected.get("expectedRecommendation") != "deprioritize":
        errors.append("manual expectation differs from the documented public fixture")
    if set(expected.get("requiredDimensionKeys", [])) != {"identity_credit", "business", "role_clarity", "career_value", "personal_fit"}:
        errors.append("expected dimension key list differs from public contract")

    markdown_paths = sorted(ROOT.rglob("*.md"))
    checked_links = 0
    for path in markdown_paths:
        text = path.read_text()
        if sum(line.startswith("```") for line in text.splitlines()) % 2:
            errors.append(str(path.relative_to(ROOT)) + ": unmatched Markdown fences")
        for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", text):
            if target.startswith(("https://", "http://", "mailto:", "#")):
                continue
            relative = target.split("#", 1)[0]
            destination = (path.parent / relative).resolve()
            if destination == REPORT and not REPORT.exists():
                continue  # this audit generates its own record when --write-report is supplied
            checked_links += 1
            if not destination.exists():
                errors.append(str(path.relative_to(ROOT)) + ": unresolved local link " + target)

    required = [
        "README.md", "docs/C_DEVELOPMENT_SPEC_V1.1_2026-10-02.md",
        "docs/C_REMEDIATION_REGISTER_2026-10-02.md", "docs/C_MIGRATION_HANDOVER_2026-10-02.md",
        "docs/source/C_Matching_Report.original.md", "docs/C_REMOTE_DELIVERY_RECEIPT_2026-10-02.json",
    ]
    for name in required:
        if not (ROOT / name).exists():
            errors.append("required document missing: " + name)
    hashes = {
        str(path.relative_to(ROOT)): sha256(path)
        for path in sorted(ROOT.rglob("*"))
        if path.is_file() and path not in (REPORT, RECEIPT)
    }
    return {
        "module": "C",
        "documentVersion": "1.1",
        "publicSchemaVersion": "1.0.0",
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "verificationType": "documentation_and_fixed_fixture_integrity_only",
        "originalSourceSha256Matches": source_unchanged,
        "threePublicFixtureValuesIdenticalToSource": originals_identical,
        "fixedInputCheckCount": len(checks),
        "fixedInputChecks": checks,
        "negativeFixtureMutationCheckCount": len(negative),
        "negativeFixtureMutationChecks": negative,
        "markdownFileCount": len(markdown_paths),
        "localLinkCount": checked_links,
        "applicationTestsRun": False,
        "fullRuntimeSchemaValidationRun": False,
        "matchEngineRun": False,
        "realBusinessProviderApiCallsMade": False,
        "fileSha256ExcludingGeneratedReports": hashes,
        "errors": errors,
        "passed": not errors,
        "limits": [
            "Only fixed demo input and documentation are checked.",
            "Negative mutations exercise this audit, not an application validator.",
            "No MatchReport is generated and no semantic quality or real company truth is established.",
            "No A/B, root files, shared schema or runtime are modified.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write-report", action="store_true", help="Write the C-only documentation audit JSON.")
    args = parser.parse_args()
    try:
        result = audit()
    except (KeyError, ValueError, OSError, TypeError) as error:
        print("C documentation audit FAILED: " + str(error))
        return 1
    if args.write_report:
        REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    passed_input = sum(result["fixedInputChecks"].values())
    passed_negative = sum(result["negativeFixtureMutationChecks"].values())
    print(f"C documentation audit: fixed inputs {passed_input}/{result['fixedInputCheckCount']}; "
          f"negative fixture mutations {passed_negative}/{result['negativeFixtureMutationCheckCount']}.")
    print(f"Markdown files {result['markdownFileCount']}; local links {result['localLinkCount']}; errors {len(result['errors'])}.")
    print("Application tests, full runtime schema validation, match engine and business provider APIs: NOT RUN.")
    for error in result["errors"]:
        print("ERROR: " + error)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
