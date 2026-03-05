# CSHARP-SEC-003: Avoid BinaryFormatter and insecure deserialization

## Intent
`BinaryFormatter` and similar APIs are insecure and deprecated.

## Step-by-step evaluation
1. Search for `BinaryFormatter` and unsafe deserialization APIs.
2. Use safe serializers (System.Text.Json, protobuf, etc.).

## Pass example
```csharp
var json = JsonSerializer.Serialize(obj);
```

## Fail example
```csharp
var formatter = new BinaryFormatter();
var obj = formatter.Deserialize(stream);
```
