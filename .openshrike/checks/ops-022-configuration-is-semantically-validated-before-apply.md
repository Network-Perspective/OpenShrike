---
id: ops-022
title: Configuration is semantically validated before it is applied
domain: ops
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Google SRE Workbook
  - type: documentation
    title: Microsoft .NET runtime configuration & IOptions validation docs
  - type: documentation
    title: Zod / Valibot documentation
---

# ops-022: Configuration is semantically validated before it is applied

## Intent
Prevent misconfiguration outages by rejecting config that parses syntactically but is invalid semantically or structurally for the real system.

## Applicability
Applies when the diff adds or changes configuration schemas, options binding, environment parsing, external config loading, or validation hooks.

## What to inspect
Config structs or schemas, range checks, nested validation, environment parsing, and external config deserialization.

## Pass criteria
The changed configuration path validates required keys, types, nested objects, ranges, and other semantic constraints before the running system uses the config.

## Fail criteria
The diff loads config from `process.env`, files, or bound options and trusts it after syntax parsing or binding alone, with no visible semantic or nested validation.

## Do not flag
Hard-coded literals, test fixtures, or visible shared validators that already own the config contract.

## Confidence guidance
`HIGH` when the load path and missing validation are directly visible. `MEDIUM` when validation may exist in shared helpers. `LOW` when the control plane validates config outside the repo.

## Remediation
Parse config through a schema or validator that checks semantic constraints before application code consumes it.

## Pass example
```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535),
});
const env = EnvSchema.parse(process.env);
```

## Fail example
```ts
const config = {
  databaseUrl: process.env.DATABASE_URL as string,
  port: Number(process.env.PORT || 3000),
};
```
