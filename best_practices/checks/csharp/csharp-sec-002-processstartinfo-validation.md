# CSHARP-SEC-002: Validate input for ProcessStartInfo

## Intent
Untrusted input in process execution can lead to command injection.

## Step-by-step evaluation
1. Locate `ProcessStartInfo` usage.
2. Ensure arguments are validated/whitelisted before use.

## Pass example
```csharp
var args = ValidateArgs(userInput);
var psi = new ProcessStartInfo("git", args) { UseShellExecute = false };
```

## Fail example
```csharp
var psi = new ProcessStartInfo("git", userInput); // untrusted input
```
