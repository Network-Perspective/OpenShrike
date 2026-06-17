---
id: python-rel-001
title: Outbound HTTP calls set explicit timeouts
domain: rel
language: python
app-type: [any]
status: active
sources:
  - type: documentation
    title: Requests, urllib3, and HTTPX timeout documentation
  - type: documentation
    title: 'Bandit B113: request_without_timeout'
---

# python-rel-001: Outbound HTTP calls set explicit timeouts

## Intent
Prevent Python HTTP clients from hanging indefinitely on slow or dead upstreams.

## Applicability
Applies to `requests`, `urllib3`, `httpx`, `aiohttp`, and similar clients.

## What to inspect
Call sites and shared client construction for explicit timeout configuration.

## Pass criteria
The changed outbound HTTP path has an explicit timeout and does not disable the client's timeout protection.

## Fail criteria
The diff adds an outbound HTTP call without a timeout or explicitly sets an unbounded timeout like `None`.

## Do not flag
Tests and clearly one-off offline scripts.

## Confidence guidance
`HIGH` when a timeout-free call is directly visible. `MEDIUM` when timeout policy may be in a wrapper. `LOW` when the request path is incomplete.

## Remediation
Set explicit timeouts on the shared client or every changed call site.

## Pass example
```python
requests.get(url, timeout=5)
```

## Fail example
```python
requests.get(url)
```
