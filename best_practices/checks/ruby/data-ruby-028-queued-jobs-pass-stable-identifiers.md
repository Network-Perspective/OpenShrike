---
id: data-ruby-028
title: Queued jobs pass stable identifiers instead of mutable record state
domain: data
language: ruby
app-type: [any]
status: active
sources:
  - type: wiki
    title: Sidekiq Best Practices Wiki
---

# data-ruby-028: Queued jobs pass stable identifiers instead of mutable record state

## Intent
Keep delayed Ruby jobs from acting on stale snapshots captured at enqueue time.

## Applicability
Applies to Sidekiq and similar delayed jobs. Return `unknown` when serialization is hidden by a wrapper.

## What to inspect
Job arguments, serialized records, hashes of mutable attributes, and record lookup inside `perform`.

## Pass criteria
Jobs enqueue stable identifiers and reload current record state during execution.

## Fail criteria
Jobs serialize full records or mutable business data snapshots as arguments.

## Do not flag
Truly immutable value objects whose contents are the intended stable contract.

## Confidence guidance
`HIGH` when AR objects or mutable hashes are passed to jobs. `MEDIUM` when serialization wrappers may normalize arguments. `LOW` when only caller code is visible.

## Remediation
Pass ids or other stable lookup keys and load current state inside the job.

## Pass example
```ruby
ReportJob.perform_async(report.id)
```

## Fail example
```ruby
ReportJob.perform_async(report.attributes)
```
