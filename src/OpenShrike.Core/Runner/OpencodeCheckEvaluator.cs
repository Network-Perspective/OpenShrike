using System.Diagnostics;
using System.Text;
using System.Text.Json;
using OpenShrike.Core.Models;

namespace OpenShrike.Core.Runner;

internal sealed class OpencodeCheckEvaluator
{
    private const string DefaultVersion = "0.1.0";

    public CheckResult Evaluate(string checkId, string checkDefinitionPath, string repoPath, string? agent, string? model)
    {
        var definition = File.ReadAllText(checkDefinitionPath);
        var prompt = BuildPrompt(checkId, definition, repoPath);
        var responseText = RunOpencode(prompt, repoPath, agent, model);

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

    private static string BuildPrompt(string checkId, string checkDefinition, string repoPath)
    {
        return
            "You are executing a single OpenShrike best-practice check against repository path: " + repoPath + "\n\n" +
            "Check id: " + checkId + "\n" +
            "Check definition markdown:\n" +
            "---\n" +
            checkDefinition + "\n" +
            "---\n\n" +
            "Follow the check definition exactly. Inspect the repository and collect direct evidence.\n" +
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
            "- status=unknown only when the check is not applicable or evidence is insufficient.\n";
    }

    private static string RunOpencode(string prompt, string repoPath, string? agent, string? model)
    {
        var psi = new ProcessStartInfo("opencode")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        psi.ArgumentList.Add("run");
        psi.ArgumentList.Add("--format");
        psi.ArgumentList.Add("json");
        psi.ArgumentList.Add("--dir");
        psi.ArgumentList.Add(repoPath);

        if (!string.IsNullOrWhiteSpace(agent))
        {
            psi.ArgumentList.Add("--agent");
            psi.ArgumentList.Add(agent);
        }

        if (!string.IsNullOrWhiteSpace(model))
        {
            psi.ArgumentList.Add("--model");
            psi.ArgumentList.Add(model);
        }

        psi.ArgumentList.Add(prompt);

        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start opencode process.");

        var textBuffer = new StringBuilder();
        var errorBuffer = new StringBuilder();

        var stdoutTask = Task.Run(async () =>
        {
            while (true)
            {
                var line = await process.StandardOutput.ReadLineAsync().ConfigureAwait(false);
                if (line is null)
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                try
                {
                    using var doc = JsonDocument.Parse(line);
                    if (!doc.RootElement.TryGetProperty("type", out var typeElement))
                    {
                        continue;
                    }

                    if (!string.Equals(typeElement.GetString(), "text", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    if (!doc.RootElement.TryGetProperty("part", out var partElement))
                    {
                        continue;
                    }

                    if (!partElement.TryGetProperty("text", out var textElement))
                    {
                        continue;
                    }

                    var chunk = textElement.GetString();
                    if (!string.IsNullOrWhiteSpace(chunk))
                    {
                        lock (textBuffer)
                        {
                            textBuffer.Append(chunk);
                        }
                    }
                }
                catch (JsonException)
                {
                    // Ignore malformed event lines and keep reading.
                }
            }
        });

        var stderrTask = process.StandardError.ReadToEndAsync();

        Task.WhenAll(stdoutTask, stderrTask).GetAwaiter().GetResult();

        errorBuffer.Append(stderrTask.GetAwaiter().GetResult());
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"opencode exited with code {process.ExitCode}: {errorBuffer}");
        }

        var text = textBuffer.ToString().Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("opencode returned no text response.");
        }

        return text;
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
