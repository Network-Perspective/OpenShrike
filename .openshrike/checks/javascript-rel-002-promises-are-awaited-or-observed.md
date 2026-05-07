# JAVASCRIPT-REL-002: Promises are awaited, returned, or intentionally observed

## Intent

Dropped promises turn real failures into unhandled rejections or silent data
loss. Async work should be awaited, returned to the caller, or explicitly
tracked with deliberate error handling.

## Applicability

Applies to asynchronous JavaScript and TypeScript code using promises.

Return `unknown` when a framework or utility may intentionally own the promise
lifecycle outside visible scope.

## Strategy

`heuristic`

## What to inspect

1. Review async functions and promise-producing calls in the diff.
2. Check whether promises are awaited, returned, or detached intentionally with
   explicit observation.

## Pass criteria

- Async work is awaited or returned.
- Detached background work is clearly intentional and has explicit error
  handling or lifecycle ownership.

## Fail criteria

- Promise-returning calls are started and ignored.
- Async callbacks are passed where return values are dropped and errors go
  unobserved.

## Do not flag

- Explicit `void someAsyncTask().catch(...)` or equivalent deliberate
  fire-and-observe patterns.
- Framework startup code where lifecycle ownership is obvious.

## Evidence to collect

- The promise-producing call.
- The missing await/return/observation.

## Confidence guidance

- `HIGH`: a dropped promise is directly visible.
- `MEDIUM`: the framework may own the lifecycle, but it is not obvious.
- `LOW`: prefer `unknown` if ownership is unclear.

## Remediation

- Await or return the promise.
- If detaching intentionally, attach explicit error handling and lifecycle
  ownership.
