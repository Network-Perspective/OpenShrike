using OpenShrike.Core.Models;

namespace OpenShrike.Core.Runner;

public static class ScanRunner
{
    public static ScanReport Run(
        string checkId,
        string repoPath,
        string? agent,
        string? model,
        ScanScopeKind scopeKind = ScanScopeKind.Uncommitted,
        string? scopeTarget = null,
        bool emulateOpencode = false,
        Action<ScanProgressEvent>? onProgress = null,
        bool useDockerRuntime = true)
    {
        return RunChecks(
            new[] { checkId },
            checkId,
            DateTime.UtcNow.ToString("yyyy-MM-dd"),
            repoPath,
            agent,
            model,
            scopeKind,
            scopeTarget,
            emulateOpencode,
            onProgress,
            useDockerRuntime);
    }

    public static ScanReport RunPolicy(
        string policyId,
        string repoPath,
        string? agent,
        string? model,
        ScanScopeKind scopeKind = ScanScopeKind.Uncommitted,
        string? scopeTarget = null,
        bool emulateOpencode = false,
        Action<ScanProgressEvent>? onProgress = null,
        bool useDockerRuntime = true)
    {
        var policy = PolicyDefinitionResolver.Resolve(policyId);
        return RunChecks(policy.CheckIds, policy.Id, policy.Version, repoPath, agent, model, scopeKind, scopeTarget, emulateOpencode, onProgress, useDockerRuntime);
    }

    private static ScanReport RunChecks(
        IReadOnlyList<string> checkIds,
        string bundleId,
        string policyVersion,
        string repoPath,
        string? agent,
        string? model,
        ScanScopeKind scopeKind,
        string? scopeTarget,
        bool emulateOpencode,
        Action<ScanProgressEvent>? onProgress,
        bool useDockerRuntime)
    {
        var repoFullPath = Path.GetFullPath(repoPath);
        if (!Directory.Exists(repoFullPath))
        {
            throw new DirectoryNotFoundException($"Repository path not found: {repoFullPath}");
        }

        var scopeContext = ScanScopeResolver.Resolve(repoFullPath, scopeKind, scopeTarget);
        onProgress?.Invoke(new ScanProgressEvent(
            ScanProgressEventType.ScopeResolved,
            scopeContext.Label,
            scopeContext.Files.Count,
            scopeContext.IsFullRepository,
            CheckId: null,
            CheckStatus: null,
            PassedCount: 0,
            FailedCount: 0,
            UnknownCount: 0,
            CheckIndex: 0,
            TotalChecks: checkIds.Count));

        if (!scopeContext.IsFullRepository && scopeContext.Files.Count == 0)
        {
            onProgress?.Invoke(new ScanProgressEvent(
                ScanProgressEventType.NoChangesInScope,
                scopeContext.Label,
                scopeContext.Files.Count,
                scopeContext.IsFullRepository,
                CheckId: null,
                CheckStatus: null,
                PassedCount: 0,
                FailedCount: 0,
                UnknownCount: checkIds.Count,
                CheckIndex: 0,
                TotalChecks: checkIds.Count));

            var noChangesChecks = checkIds.Select(CreateNoChangesResult).ToArray();
            return new ScanReport
            {
                BundleId = bundleId,
                PolicyVersion = policyVersion,
                Repo = new RepoInfo { Path = repoFullPath },
                Summary = new SummaryInfo
                {
                    TotalChecks = noChangesChecks.Length,
                    Passed = 0,
                    Failed = 0,
                    Unknown = noChangesChecks.Length
                },
                Checks = noChangesChecks
            };
        }

        var evaluator = new OpencodeCheckEvaluator();
        var checks = new List<CheckResult>(checkIds.Count);
        for (var index = 0; index < checkIds.Count; index++)
        {
            var checkId = checkIds[index];
            onProgress?.Invoke(new ScanProgressEvent(
                ScanProgressEventType.CheckStarted,
                scopeContext.Label,
                scopeContext.Files.Count,
                scopeContext.IsFullRepository,
                CheckId: checkId,
                CheckStatus: null,
                PassedCount: checks.Count(c => string.Equals(c.Status, "pass", StringComparison.OrdinalIgnoreCase)),
                FailedCount: checks.Count(c => string.Equals(c.Status, "fail", StringComparison.OrdinalIgnoreCase)),
                UnknownCount: checks.Count(c => string.Equals(c.Status, "unknown", StringComparison.OrdinalIgnoreCase)),
                CheckIndex: index + 1,
                TotalChecks: checkIds.Count));

            var checkDefinitionPath = CheckDefinitionResolver.ResolvePath(checkId);
            var guard = RepoMutationGuard.Capture(repoFullPath);
            var result = evaluator.Evaluate(checkId, checkDefinitionPath, repoFullPath, agent, model, scopeContext, emulateOpencode, useDockerRuntime);
            guard.ThrowIfMutated();
            checks.Add(result);

            onProgress?.Invoke(new ScanProgressEvent(
                ScanProgressEventType.CheckCompleted,
                scopeContext.Label,
                scopeContext.Files.Count,
                scopeContext.IsFullRepository,
                CheckId: checkId,
                CheckStatus: result.Status,
                PassedCount: checks.Count(c => string.Equals(c.Status, "pass", StringComparison.OrdinalIgnoreCase)),
                FailedCount: checks.Count(c => string.Equals(c.Status, "fail", StringComparison.OrdinalIgnoreCase)),
                UnknownCount: checks.Count(c => string.Equals(c.Status, "unknown", StringComparison.OrdinalIgnoreCase)),
                CheckIndex: index + 1,
                TotalChecks: checkIds.Count));
        }

        return new ScanReport
        {
            BundleId = bundleId,
            PolicyVersion = policyVersion,
            Repo = new RepoInfo { Path = repoFullPath },
            Summary = new SummaryInfo
            {
                TotalChecks = checks.Count,
                Passed = checks.Count(c => string.Equals(c.Status, "pass", StringComparison.OrdinalIgnoreCase)),
                Failed = checks.Count(c => string.Equals(c.Status, "fail", StringComparison.OrdinalIgnoreCase)),
                Unknown = checks.Count(c => string.Equals(c.Status, "unknown", StringComparison.OrdinalIgnoreCase))
            },
            Checks = checks
        };
    }

    private static CheckResult CreateNoChangesResult(string checkId)
    {
        return new CheckResult
        {
            Id = checkId,
            Version = "0.1.0",
            Status = "unknown",
            Confidence = "LOW",
            Evidence = Array.Empty<string>(),
            Rationale = "No files matched the selected scan scope.",
            Remediation =
            [
                "Choose a scope that includes changed files.",
                "Use '--scan-scope full' to evaluate the full repository."
            ]
        };
    }
}
