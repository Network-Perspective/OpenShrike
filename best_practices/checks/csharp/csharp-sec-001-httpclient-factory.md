# CSHARP-SEC-001: HttpClient managed by IHttpClientFactory

## Intent
Use `IHttpClientFactory` to avoid socket exhaustion and centralize policies.

## Strategy
`static` — resolvable by searching for `new HttpClient()` in application code.

## Step-by-step evaluation
1. Search for `new HttpClient()` usage in app code.
2. Prefer clients created via `IHttpClientFactory` or typed clients.

## Pass example
```csharp
builder.Services.AddHttpClient<PaymentClient>();

public class PaymentClient
{
    public PaymentClient(HttpClient http) { }
}
```

## Fail example
```csharp
public class PaymentClient
{
    private readonly HttpClient _http = new HttpClient();
}
```

## Confidence guidance
- **HIGH**: Found `new HttpClient()` in application code (not test code).
- **MEDIUM**: Found `HttpClient` field/variable without clear factory usage,
  but no explicit `new HttpClient()`.
- **LOW**: Could not determine HttpClient creation pattern from the diff alone.
