using System.Text.Json.Serialization;

namespace OpenShrike.Core.Models;

public sealed class ScanReport
{
    [JsonPropertyName("bundle_id")]
    public required string BundleId { get; init; }

    [JsonPropertyName("policy_version")]
    public required string PolicyVersion { get; init; }

    [JsonPropertyName("repo")]
    public required RepoInfo Repo { get; init; }

    [JsonPropertyName("summary")]
    public required SummaryInfo Summary { get; init; }

    [JsonPropertyName("checks")]
    public required IReadOnlyList<CheckResult> Checks { get; init; }
}

public sealed class RepoInfo
{
    [JsonPropertyName("path")]
    public required string Path { get; init; }
}

public sealed class SummaryInfo
{
    [JsonPropertyName("total_checks")]
    public required int TotalChecks { get; init; }

    [JsonPropertyName("passed")]
    public required int Passed { get; init; }

    [JsonPropertyName("failed")]
    public required int Failed { get; init; }

    [JsonPropertyName("unknown")]
    public required int Unknown { get; init; }
}

public sealed class CheckResult
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("version")]
    public required string Version { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("confidence")]
    public required string Confidence { get; init; }

    [JsonPropertyName("evidence")]
    public required IReadOnlyList<string> Evidence { get; init; }

    [JsonPropertyName("rationale")]
    public required string Rationale { get; init; }

    [JsonPropertyName("remediation")]
    public required IReadOnlyList<string> Remediation { get; init; }
}
