---
id: sec-004
title: Browser output encodes or sanitizes untrusted content in the correct context
domain: sec
language: shared
app-type: [http-service, web-frontend]
status: active
sources:
  - type: book
    title: 24 Deadly Sins of Software Security
  - type: book
    title: Alice and Bob Learn Application Security
  - type: standard
    title: ASP.NET Core Security Docs
  - type: standard
    title: Brakeman Warning Documentation
  - type: standard
    title: CWE Top 25 Most Dangerous Software Weaknesses
  - type: book
    title: Designing Secure Software
    author: Loren Kohnfelder
  - type: standard
    title: OWASP ASVS 5.0
  - type: standard
    title: OWASP Cheat Sheet Series
  - type: standard
    title: OWASP NodeGoat OWASP Node.js Security Cheat Sheet
  - type: article
    title: PHP The Right Way
  - type: standard
    title: PHPStan Psalm Rule Documentation
  - type: standard
    title: Rails Security Guide
  - type: article
    title: Survive the Deep End PHP Security
---

# sec-004: Browser output encodes or sanitizes untrusted content in the correct context

## Intent
Render untrusted content as inert text or vetted sanitized markup, not executable HTML, script, or dangerous browser context.

## Applicability
Applies when the diff renders user-controlled content into HTML, templates, DOM sinks, script blocks, URL-bearing attributes, or framework escape hatches. Return `unknown` when the actual rendering sink is not visible.

## What to inspect
Template expressions, raw HTML helpers, JSON embedded in `<script>`, DOM sinks, sanitizer usage, and context-specific encoders.

## Pass criteria
The code keeps framework auto-escaping enabled or uses context-appropriate escaping or vetted sanitization for intentionally rich HTML.

## Fail criteria
Untrusted content is marked safe, interpolated into script-capable contexts without the correct encoder, or inserted through raw HTML sinks without sanitization.

## Do not flag
Plain JSON responses. Auto-escaped template expressions. Static literals. Reviewed safe-html abstractions with visible sanitizer use.

## Confidence guidance
`HIGH` when the unsafe sink and untrusted source are visible. `MEDIUM` when the sink is clear but content origin is inferred. `LOW` when rendering happens through hidden helpers.

## Remediation
Use the encoder that matches the sink. Preserve default escaping. Sanitize rich HTML with a vetted allowlist sanitizer.

## Pass example
```javascript
element.textContent = userComment
```

## Fail example
```javascript
element.innerHTML = userComment
```
