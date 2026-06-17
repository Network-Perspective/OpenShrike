---
id: perf-php-001
title: Strip loaded Eloquent relations before queue serialization
domain: perf
language: php
app-type: [any]
status: active
sources:
  - type: documentation
    title: "Laravel Official Documentation: Queues"
    section: Queued Relationships
---

# perf-php-001: Strip loaded Eloquent relations before queue serialization

## Intent
Prevent oversized job payloads and surprising reloading of unconstrained model relationships during job execution.

## Applicability
Applies when a queued job stores Eloquent models on the job payload and the surrounding code shows loaded relations or model instances being passed directly into the job constructor. Return `unknown` if the job only stores scalar identifiers or no relation loading is visible.

## What to inspect
Job constructors, promoted properties, `Queueable` jobs, model arguments, relation loading near dispatch sites, and uses of `withoutRelations()` or `#[WithoutRelations]`.

## Pass criteria
Queued models are stripped with `withoutRelations()` before assignment, or the job or class is annotated with `#[WithoutRelations]`.

## Fail criteria
The diff queues a model with loaded relations intact and does not strip them before serialization.

## Do not flag
Do not flag jobs that only pass model IDs, jobs that intentionally require a small fixed relation set and document it clearly, or collections whose relations are not restored by Laravel anyway.

## Confidence guidance
`HIGH` when the dispatch site eagerly loads relations and the job stores the model directly without `withoutRelations()`. `MEDIUM` when the model may already carry loaded relations from earlier code paths. `LOW` when relation-loading state is not visible.

## Remediation
Pass a model ID instead of the model, or strip loaded relations with `withoutRelations()` or `#[WithoutRelations]`.

## Pass example
```php
class ProcessPodcast implements ShouldQueue
{
    public function __construct(Podcast $podcast)
    {
        $this->podcast = $podcast->withoutRelations();
    }
}
```

## Fail example
```php
$podcast->load('episodes', 'hosts');
ProcessPodcast::dispatch($podcast);
```
