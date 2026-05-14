# Observability and Feedback Loop

## Objectives
- Trace every agent decision and action for audit and debugging.
- Provide measurable coverage for best-practice checks.
- Close the loop by enabling agents to iteratively fix findings.

## Observability signals
- Agent action log (commands, inputs, outputs, timestamps).
- Policy evaluation results (per-check pass/fail, evidence, confidence level).
- Resource usage (CPU, memory, wall-clock).
- Review summary metrics (risk score, unresolved findings).

## Analysis outputs
- Human-readable report (Markdown or HTML).
- Machine-readable feedback (JSON) for external consumption and internal
  resume/recheck/fix workflows.
- Optional policy gate for CI (fail on high-risk findings).
- Saved last-scan state for resume, recheck, and fix workflows.

Note: Current implementation is read-only analysis. The planned interactive fix
loop adds explicit, auditable edit sessions and automatic rechecks; the
requirements for that flow live in
`docs/requirements/08-interactive-fix-loop-and-last-scan.md`.

## Example feedback payload (conceptual)
- Check ID and version, status, confidence level (HIGH/MEDIUM/LOW), evidence paths.
- Suggested remediation steps with references.

## Sample bundle output schema (JSON)
```json
{
  "bundle_id": "security-baseline",
  "policy_version": "2026-03-04",
  "repo": {
    "url": "git@github.com:org/repo.git",
    "ref": "refs/heads/feature-branch",
    "diff": "origin/main...HEAD"
  },
  "summary": {
    "total_checks": 42,
    "passed": 36,
    "failed": 4,
    "unknown": 2,
    "risk_score": 7.5
  },
  "checks": [
    {
      "id": "BP-SEC-003",
      "version": "1.2.0",
      "status": "fail",
      "confidence": "HIGH",
      "evidence": [
        "logs/agent-commands.json",
        "reports/container-permissions.txt"
      ],
      "rationale": "Privileged container detected in review run.",
      "remediation": [
        "Run agent containers rootless.",
        "Remove privileged flags from the runtime."
      ]
    }
  ],
  "artifacts": {
    "report_md": "reports/openshrike.md",
    "logs": "logs/",
    "evidence_dir": "evidence/"
  }
}
```

## Metrics and monitoring
- Best-practice coverage over time.
- Recurrence rate of top violations.
- Agent action distribution and anomaly detection.
