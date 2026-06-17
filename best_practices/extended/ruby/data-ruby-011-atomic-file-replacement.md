---
id: data-ruby-011
title: Ruby file-backed durable state uses atomic replacement
domain: data
language: ruby
app-type: [any]
status: active
sources:
  - type: documentation
    title: RuboCop docs
    section: Lint/NonAtomicFileOperation
---

# data-ruby-011: Ruby file-backed durable state uses atomic replacement

## Intent
Prevent torn persisted files when Ruby code updates durable state on disk.

## Applicability
Applies to files treated as durable state, caches, or configuration. Return `unknown` when the file is temporary scratch output.

## What to inspect
`File.write`, temp files, `File.rename`, and crash-safe replacement patterns.

## Pass criteria
Code writes durable file content to a temp path and atomically replaces the destination once the write is complete.

## Fail criteria
Code rewrites the destination file in place where interruption can leave partial or empty content.

## Do not flag
Throwaway temp files or logs that are not treated as durable source-of-truth data.

## Confidence guidance
`HIGH` when in-place rewrite of a durable file is visible. `MEDIUM` when the file's durability role is inferred. `LOW` when helper behavior is hidden.

## Remediation
Write to a temp file and atomically rename into place.

## Pass example
```ruby
Tempfile.create("state") { |f| f.write(body); File.rename(f.path, path) }
```

## Fail example
```ruby
File.write(path, body)
```
