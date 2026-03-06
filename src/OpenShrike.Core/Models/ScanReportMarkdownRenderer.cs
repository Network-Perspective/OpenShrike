using System.Text;

namespace OpenShrike.Core.Models;

public static class ScanReportMarkdownRenderer
{
    public static string Render(ScanReport report)
    {
        var builder = new StringBuilder();
        builder.AppendLine("# OpenShrike Scan Report");
        builder.AppendLine();
        builder.AppendLine($"- Bundle: `{report.BundleId}`");
        builder.AppendLine($"- Policy version: `{report.PolicyVersion}`");
        builder.AppendLine($"- Repository: `{report.Repo.Path}`");
        builder.AppendLine($"- Summary: total `{report.Summary.TotalChecks}`, pass `{report.Summary.Passed}`, fail `{report.Summary.Failed}`, unknown `{report.Summary.Unknown}`");
        builder.AppendLine();
        builder.AppendLine("## Checks");
        builder.AppendLine();

        foreach (var check in report.Checks)
        {
            builder.AppendLine($"### `{check.Id}`");
            builder.AppendLine($"- Version: `{check.Version}`");
            builder.AppendLine($"- Status: `{check.Status}`");
            builder.AppendLine($"- Confidence: `{check.Confidence}`");
            builder.AppendLine($"- Rationale: {check.Rationale}");

            builder.AppendLine("- Evidence:");
            if (check.Evidence.Count == 0)
            {
                builder.AppendLine("  - none");
            }
            else
            {
                foreach (var evidence in check.Evidence)
                {
                    builder.AppendLine($"  - `{evidence}`");
                }
            }

            builder.AppendLine("- Remediation:");
            if (check.Remediation.Count == 0)
            {
                builder.AppendLine("  - none");
            }
            else
            {
                foreach (var remediation in check.Remediation)
                {
                    builder.AppendLine($"  - {remediation}");
                }
            }

            builder.AppendLine();
        }

        return builder.ToString().TrimEnd();
    }
}
