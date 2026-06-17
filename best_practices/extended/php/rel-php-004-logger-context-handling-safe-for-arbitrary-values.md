---
id: rel-php-004
title: Logger context handling is safe for arbitrary values
domain: rel
language: php
app-type: [any]
status: active
sources:
  - type: documentation
    title: PSR-3 Logger Interface
    author: PHP-FIG
    section: "1.3 Context"
---

# rel-php-004: Logger context handling is safe for arbitrary values

## Intent
Prevent logging code from throwing its own warnings or exceptions while handling the original failure.

## Applicability
Applies to PHP logging adapters and code that normalizes logger context arrays.

## What to inspect
Interpolation logic, `__toString()` assumptions, and context normalization for arbitrary values.

## Pass criteria
Logger context handling tolerates arbitrary values without raising new failures.

## Fail criteria
The diff assumes every context value is directly stringable or otherwise safe in logger interpolation.

## Do not flag
Context built entirely from literals and already normalized scalar values.

## Confidence guidance
`HIGH` when unsafe normalization is directly visible. `MEDIUM` when helper behavior is inferred. `LOW` when logger ownership is incomplete.

## Remediation
Normalize context defensively and avoid assuming arbitrary objects or arrays can be rendered directly.

## Pass example
```php
$logger->error('failed', ['payload' => json_encode($payload, JSON_PARTIAL_OUTPUT_ON_ERROR)]);
```

## Fail example
```php
$logger->error('failed ' . $payload);
```
