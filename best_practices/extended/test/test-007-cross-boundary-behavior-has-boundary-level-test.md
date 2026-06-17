---
id: test-007
title: Cross-boundary behavior has at least one real boundary-level test
domain: test
language: shared
app-type: [any]
status: active
sources:
  - type: book
    title: Growing Object-Oriented Software, Guided by Tests
    author: Steve Freeman & Nat Pryce
  - type: book
    title: Software Engineering at Google
---

# test-007: Cross-boundary behavior has at least one real boundary-level test

## Intent
Some features only fail at real runtime boundaries such as HTTP handling, persistence, messaging, UI wiring, or process startup. Lower-level tests alone are not enough for those behaviors.

## Applicability
Applies when the diff changes behavior that crosses a visible runtime boundary and the repository already contains an acceptance, integration, or end-to-end layer for similar behavior. Return `unknown` when the repo has no such test layer.

## What to inspect
Look at changed controllers, persistence paths, message consumers, UI flows, or process wiring, then check whether the diff adds or updates a test that exercises the same boundary used at runtime.

## Pass criteria
At least one changed or added test drives the behavior through the real boundary and checks the visible outcome.

## Fail criteria
The diff changes cross-boundary behavior in a repo that already uses boundary-level tests for that area, but adds only lower-level tests or no matching boundary-level test at all.

## Do not flag
Pure domain-object changes, pure refactors, or repositories that clearly do not maintain a comparable boundary-level suite.

## Confidence guidance
`HIGH` when the boundary impact is obvious and no corresponding boundary-level test changed. `MEDIUM` when the boundary layer is inferred from repo conventions. `LOW` when test taxonomy is unclear.

## Remediation
Add or update an acceptance, integration, or end-to-end style test that exercises the changed behavior through the real boundary.

## Pass example
```java
@Test
void user_can_submit_a_bid_through_http() {
  HttpResponse<?> response = client.post("/bids", "{\"amount\":1098}");
  assertEquals(202, response.statusCode());
}
```

## Fail example
```java
@Test
void bid_service_increments_price() {
  assertEquals(1098, new BidService().nextBid(1000, 98));
}

// The diff changes the HTTP bidding flow, but adds no boundary-level test.
```
