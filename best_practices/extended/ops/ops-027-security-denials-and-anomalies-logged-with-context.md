---
id: ops-027
title: Security-relevant denials and anomalies are logged with investigation context
domain: ops
language: shared
app-type: [http-service]
status: active
sources:
  - type: standard
    title: OWASP Logging Cheat Sheet
  - type: standard
    title: OWASP Proactive Controls
---

# ops-027: Security-relevant denials and anomalies are logged with investigation context

## Intent
Prevent attack attempts and denied sensitive actions from disappearing without enough evidence to investigate them later.

## Applicability
Applies when the diff adds or changes authorization failures, validation rejections, audit events, or custom security logs.

## What to inspect
Denied-access handlers, suspicious validation failures, structured log fields, actor identity, request or correlation IDs, target object, action, and outcome.

## Pass criteria
Security-relevant denials and anomalies produce structured logs or audit events with enough context to tell who acted, what happened, what object or route was involved, and whether it succeeded or failed.

## Fail criteria
The diff adds security-relevant rejection logic or custom security logs that are silent or too vague to investigate.

## Do not flag
Generic debug logs, centrally logged framework parse failures, or cases where visible shared middleware already adds the required context.

## Confidence guidance
`HIGH` when the event payload is explicit and obviously sufficient or insufficient. `MEDIUM` when some context may come from wrappers. `LOW` when downstream enrichment is external.

## Remediation
Emit a structured security log or audit event with actor, action, target, outcome, and request context.

## Pass example
```typescript
audit.warn("authz.denied", {
  actorId: user.id,
  action: "delete_invoice",
  targetId: invoice.id,
  result: "denied",
  requestId,
});
```

## Fail example
```typescript
audit.warn("forbidden request");
```
