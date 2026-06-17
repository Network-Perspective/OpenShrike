---
id: perf-cpp-001
title: Release queue locks before processing dequeued work
domain: perf
language: cpp
app-type: [any]
status: active
sources:
  - type: book
    title: A Tour of C++, 2nd ed.
    author: Bjarne Stroustrup
    year: 2018
---

# perf-cpp-001: Release queue locks before processing dequeued work

## Intent

Prevent unnecessary contention and queue stalls in producer-consumer code.

## Applicability

Applies when the diff changes queue consumers protected by a mutex or similar
lock and then performs non-trivial work on the dequeued item. Return `unknown`
if the code only pops trivial state or the queue is not shared concurrently.

## What to inspect

Queue-pop logic, the scope of the queue lock, the work performed after dequeue,
and whether producers or other consumers need the same lock.

## Pass criteria

The consumer removes the item while holding the queue lock, releases the lock,
and only then performs the item-specific processing.

## Fail criteria

The diff keeps the queue mutex held while processing the dequeued item or
otherwise performs prolonged work under the queue lock.

## Do not flag

Do not flag trivial constant-time bookkeeping under the lock, single-threaded
queues, or code where correctness requires holding the lock across the small
critical section visible in the repo.

## Confidence guidance

`HIGH` when the dequeue, long-running work, and lock scope are directly
visible. `MEDIUM` when helper calls likely do non-trivial work. `LOW` when
concurrency ownership is unclear.

## Remediation

Move the item out of the shared queue while holding the lock, then release the
lock before processing it.

## Pass example

```cpp
std::string next;
{
    std::lock_guard<std::mutex> lock(queue_mutex);
    next = std::move(queue.front());
    queue.pop();
}
process(next);
```

## Fail example

```cpp
std::lock_guard<std::mutex> lock(queue_mutex);
auto next = std::move(queue.front());
queue.pop();
process(next);
```
