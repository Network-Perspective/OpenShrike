using System.Diagnostics;
using System.Text;
using System.Text.Json;
using OpenShrike.Core.Models;

namespace OpenShrike.Core.Runner;

internal sealed class OpencodeCheckEvaluator
{
    private const string DefaultVersion = "0.1.0";

    public CheckResult Evaluate(
        string checkId,
        string checkDefinitionPath,
        string repoPath,
        string? agent,
        string? model,
        ScanScopeContext scopeContext,
        bool emulateOpencode,
        bool useDockerRuntime)
    {
        if (emulateOpencode)
        {
            return EmulateCheckResult(checkId, scopeContext);
        }

        var definition = File.ReadAllText(checkDefinitionPath);
        var prompt = BuildPrompt(checkId, definition, repoPath, scopeContext);
        var responseText = RunOpencode(prompt, repoPath, agent, model, useDockerRuntime);

        var payloadJson = ExtractJsonObject(responseText);
        var payload = JsonSerializer.Deserialize<AgentCheckPayload>(payloadJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        if (payload is null)
        {
            throw new InvalidOperationException("Agent returned empty JSON payload.");
        }

        ValidatePayload(payload, checkId);
        ValidateEvidenceScope(payload, scopeContext);

        return new CheckResult
        {
            Id = payload.Id,
            Version = string.IsNullOrWhiteSpace(payload.Version) ? DefaultVersion : payload.Version,
            Status = payload.Status,
            Confidence = payload.Confidence,
            Evidence = payload.Evidence ?? Array.Empty<string>(),
            Rationale = payload.Rationale ?? "No rationale provided.",
            Remediation = payload.Remediation ?? Array.Empty<string>()
        };
    }

    private static CheckResult EmulateCheckResult(string checkId, ScanScopeContext scopeContext)
    {
        var delayMs = Random.Shared.Next(2000, 5001);
        Task.Delay(delayMs).GetAwaiter().GetResult();

        var isPass = Random.Shared.NextDouble() < 0.9;
        var status = isPass ? "pass" : "fail";
        var evidencePath = scopeContext.IsFullRepository
            ? "README.md:1"
            : BuildScopedEvidence(scopeContext);

        return new CheckResult
        {
            Id = checkId,
            Version = DefaultVersion,
            Status = status,
            Confidence = isPass ? "MEDIUM" : "HIGH",
            Evidence = new[] { evidencePath },
            Rationale = isPass
                ? $"Mock evaluation passed after {delayMs}ms."
                : $"Mock evaluation failed after {delayMs}ms.",
            Remediation = isPass
                ? new[] { "No action required." }
                : new[] { "Inspect the check evidence and update code to satisfy policy." }
        };
    }

    private static string BuildScopedEvidence(ScanScopeContext scopeContext)
    {
        var path = scopeContext.Files.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(path))
        {
            return "README.md:1";
        }

        return path + ":1";
    }

    private static string BuildPrompt(string checkId, string checkDefinition, string repoPath, ScanScopeContext scopeContext)
    {
        var scopeText = BuildScopeSection(scopeContext);

        return
            "You are executing a single OpenShrike best-practice check against repository path: " + repoPath + "\n\n" +
            "Check id: " + checkId + "\n" +
            scopeText + "\n" +
            "Check definition markdown:\n" +
            "---\n" +
            checkDefinition + "\n" +
            "---\n\n" +
            "Follow the check definition exactly. Inspect only the allowed review scope and collect direct evidence.\n" +
            "Return ONLY one JSON object with this schema:\n" +
            "{\n" +
            "  \"id\": \"" + checkId + "\",\n" +
            "  \"version\": \"0.1.0\",\n" +
            "  \"status\": \"pass|fail|unknown\",\n" +
            "  \"confidence\": \"HIGH|MEDIUM|LOW\",\n" +
            "  \"evidence\": [\"relative/path:line\"],\n" +
            "  \"rationale\": \"short explanation grounded in evidence\",\n" +
            "  \"remediation\": [\"action 1\", \"action 2\"]\n" +
            "}\n\n" +
            "Rules:\n" +
            "- Output raw JSON only. No markdown fences.\n" +
            "- Use repo-relative evidence paths.\n" +
            "- If scope is not full repository, evidence paths MUST come from listed scoped files.\n" +
            "- status=unknown only when the check is not applicable or evidence is insufficient.\n";
    }

    private static string BuildScopeSection(ScanScopeContext scopeContext)
    {
        if (scopeContext.IsFullRepository)
        {
            return "Review scope: full repository.";
        }

        var files = scopeContext.Files
            .Take(200)
            .Select(path => "- " + path)
            .ToArray();

        var truncated = scopeContext.Files.Count > files.Length
            ? $"\n- ... ({scopeContext.Files.Count - files.Length} more files)"
            : string.Empty;

        return "Review scope: " + scopeContext.Label + ".\nScoped files:\n" +
               string.Join('\n', files) +
               truncated;
    }

    private static string RunOpencode(string prompt, string repoPath, string? agent, string? model, bool useDockerRuntime)
    {
        var runtimeMode = useDockerRuntime ? OpencodeRuntimeMode.Docker : OpencodeRuntimeMode.Local;
        var runtime = new OpencodeRuntime();
        return runtime.Run(prompt, repoPath, agent, model, runtimeMode);
    }

    private static string ExtractJsonObject(string input)
    {
        var fenceStart = input.IndexOf("```", StringComparison.Ordinal);
        if (fenceStart >= 0)
        {
            var firstBraceInFence = input.IndexOf('{', fenceStart);
            var fenceEnd = input.LastIndexOf("```", StringComparison.Ordinal);
            if (firstBraceInFence >= 0 && fenceEnd > firstBraceInFence)
            {
                var fenced = input[firstBraceInFence..fenceEnd];
                return ExtractByBraces(fenced);
            }
        }

        return ExtractByBraces(input);
    }

    private static string ExtractByBraces(string text)
    {
        for (var start = text.IndexOf('{'); start >= 0; start = text.IndexOf('{', start + 1))
        {
            var candidate = text[start..];
            var candidateBytes = Encoding.UTF8.GetBytes(candidate);
            var reader = new Utf8JsonReader(candidateBytes, isFinalBlock: true, state: default);

            try
            {
                using var doc = JsonDocument.ParseValue(ref reader);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    return Encoding.UTF8.GetString(candidateBytes, 0, (int)reader.BytesConsumed);
                }
            }
            catch (JsonException)
            {
                // Try the next '{'.
            }
        }

        throw new InvalidOperationException("Could not find complete JSON object in agent response.");
    }

    private static void ValidatePayload(AgentCheckPayload payload, string expectedCheckId)
    {
        if (!string.Equals(payload.Id, expectedCheckId, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Agent returned unexpected id '{payload.Id}', expected '{expectedCheckId}'.");
        }

        if (!IsOneOf(payload.Status, "pass", "fail", "unknown"))
        {
            throw new InvalidOperationException($"Agent returned invalid status '{payload.Status}'.");
        }

        if (!IsOneOf(payload.Confidence, "HIGH", "MEDIUM", "LOW"))
        {
            throw new InvalidOperationException($"Agent returned invalid confidence '{payload.Confidence}'.");
        }
    }

    private static void ValidateEvidenceScope(AgentCheckPayload payload, ScanScopeContext scopeContext)
    {
        if (scopeContext.IsFullRepository || payload.Evidence is null || payload.Evidence.Length == 0)
        {
            return;
        }

        var allowed = scopeContext.Files
            .Select(NormalizePath)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var evidence in payload.Evidence)
        {
            var separatorIndex = evidence.IndexOf(':', StringComparison.Ordinal);
            var evidencePath = separatorIndex >= 0 ? evidence[..separatorIndex] : evidence;
            var normalized = NormalizePath(evidencePath);
            if (!allowed.Contains(normalized))
            {
                throw new InvalidOperationException(
                    $"Agent returned evidence outside scan scope: '{evidence}'. Allowed scope: {scopeContext.Label}.");
            }
        }
    }

    private static string NormalizePath(string path)
    {
        return path.Trim().Replace('\\', '/');
    }

    private static bool IsOneOf(string? value, params string[] allowed)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return allowed.Any(candidate => string.Equals(candidate, value, StringComparison.OrdinalIgnoreCase));
    }

    private sealed class AgentCheckPayload
    {
        public string Id { get; init; } = string.Empty;

        public string Version { get; init; } = string.Empty;

        public string Status { get; init; } = string.Empty;

        public string Confidence { get; init; } = string.Empty;

        public string[]? Evidence { get; init; }

        public string? Rationale { get; init; }

        public string[]? Remediation { get; init; }
    }
}
