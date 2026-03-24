using OpenShrike.Core.Models;

namespace OpenShrike.Tests;

public class ScanReportMarkdownRendererTests
{
    [Fact]
    public void Render_Includes_Bundle_Summary_And_Check_Details()
    {
        var report = new ScanReport
        {
            BundleId = "csharp-baseline",
            PolicyVersion = "2026-03-06",
            Repo = new RepoInfo
            {
                Path = "/tmp/repo"
            },
            Summary = new SummaryInfo
            {
                TotalChecks = 1,
                Passed = 0,
                Failed = 1,
                Unknown = 0
            },
            Checks = new[]
            {
                new CheckResult
                {
                    Id = "csharp-rel-001-cancellation-tokens",
                    Version = "0.1.0",
                    Status = "fail",
                    Confidence = "HIGH",
                    Evidence = new[] { "src/Foo.cs:10" },
                    Rationale = "CancellationToken not passed.",
                    Remediation = new[] { "Thread the token through async methods." }
                }
            }
        };

        var markdown = ScanReportMarkdownRenderer.Render(report);

        Assert.Contains("OpenShrike Scan Report", markdown, StringComparison.Ordinal);
        Assert.Contains("csharp-baseline", markdown, StringComparison.Ordinal);
        Assert.Contains("csharp-rel-001-cancellation-tokens", markdown, StringComparison.Ordinal);
        Assert.Contains("Thread the token through async methods.", markdown, StringComparison.Ordinal);
    }
}
