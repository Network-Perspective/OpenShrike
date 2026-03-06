using OpenShrike.Core.Models;

namespace OpenShrike.Core.Runner;

public static class ScanRunner
{
    public static ScanReport Run(string checkId, string repoPath, string? agent, string? model)
    {
        var repoFullPath = Path.GetFullPath(repoPath);
        if (!Directory.Exists(repoFullPath))
        {
            throw new DirectoryNotFoundException($"Repository path not found: {repoFullPath}");
        }

        var checkDefinitionPath = CheckDefinitionResolver.ResolvePath(checkId);
        var evaluator = new OpencodeCheckEvaluator();
        var result = evaluator.Evaluate(checkId, checkDefinitionPath, repoFullPath, agent, model);

        var checks = new[] { result };

        return new ScanReport
        {
            BundleId = checkId,
            PolicyVersion = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Repo = new RepoInfo { Path = repoFullPath },
            Summary = new SummaryInfo
            {
                TotalChecks = checks.Length,
                Passed = checks.Count(c => string.Equals(c.Status, "pass", StringComparison.OrdinalIgnoreCase)),
                Failed = checks.Count(c => string.Equals(c.Status, "fail", StringComparison.OrdinalIgnoreCase)),
                Unknown = checks.Count(c => string.Equals(c.Status, "unknown", StringComparison.OrdinalIgnoreCase))
            },
            Checks = checks
        };
    }
}
