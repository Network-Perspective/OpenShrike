# CSHARP-SEC-001: Outbound HTTP clients use centralized lifetime management

## Intent

Outbound HTTP behavior should be configured centrally so connection reuse,
timeouts, headers, and resilience policies are deliberate. Ad hoc
`new HttpClient()` usage often leads to socket churn and inconsistent security
controls.

## Applicability

Applies when application code makes repeated outbound HTTP calls.

Return `unknown` when:

- the code is a tiny one-shot utility with a single request, or
- the repository intentionally owns a singleton/static `HttpClient` in a small
  SDK wrapper and the lifetime strategy is clear.

## Strategy

`static`

## What to inspect

1. Search for `new HttpClient()` in production code.
2. Check whether outbound clients are created through `IHttpClientFactory`,
   typed clients, or a clearly intentional shared handler/client.

## Pass criteria

- App or service code uses named or typed clients, or
- an explicitly shared `HttpClient`/handler lifetime strategy is visible.

## Fail criteria

- A service, handler, or per-request path creates its own `HttpClient`.
- Multiple call sites instantiate ad hoc clients with duplicated config.
- Security-critical outbound behavior bypasses central configuration.

## Do not flag

- Test code.
- Single-purpose console tools making one request.
- A library that intentionally owns one long-lived client instance.

## Evidence to collect

- The `new HttpClient()` call site.
- The surrounding production path showing repeated or central usage.

## Confidence guidance

- `HIGH`: ad hoc production `HttpClient` creation is directly visible.
- `MEDIUM`: client lifetime looks fragmented, but not all creation sites are in
  scope.
- `LOW`: prefer `unknown` when the code may be a one-off utility.

## Remediation

- Register a named or typed client through `IHttpClientFactory`.
- Centralize auth headers, timeouts, and policies.
- Keep one deliberate long-lived client only when the ownership model is clear.

## Pass example

```csharp
builder.Services.AddHttpClient<PaymentsClient>(client =>
{
    client.BaseAddress = new Uri("https://payments.internal");
});
```

## Fail example

```csharp
public sealed class PaymentsClient
{
    public async Task<string> GetAsync(string path)
    {
        using var client = new HttpClient();
        return await client.GetStringAsync(path);
    }
}
```
