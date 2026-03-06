namespace OpenShrike.Core.Runner;

internal sealed class RepoMutationGuard
{
    private readonly string _repoPath;
    private readonly Dictionary<string, RepoFileState> _before;

    private RepoMutationGuard(string repoPath, Dictionary<string, RepoFileState> before)
    {
        _repoPath = repoPath;
        _before = before;
    }

    public static RepoMutationGuard Capture(string repoPath)
    {
        return new RepoMutationGuard(repoPath, Snapshot(repoPath));
    }

    public void ThrowIfMutated()
    {
        var after = Snapshot(_repoPath);
        if (_before.Count != after.Count)
        {
            throw new InvalidOperationException("Read-only guardrail violation: agent execution modified repository files.");
        }

        foreach (var (path, state) in _before)
        {
            if (!after.TryGetValue(path, out var postState))
            {
                throw new InvalidOperationException("Read-only guardrail violation: agent execution modified repository files.");
            }

            if (state.SizeBytes != postState.SizeBytes || state.LastWriteTimeUtcTicks != postState.LastWriteTimeUtcTicks)
            {
                throw new InvalidOperationException("Read-only guardrail violation: agent execution modified repository files.");
            }
        }
    }

    private static Dictionary<string, RepoFileState> Snapshot(string repoPath)
    {
        var snapshot = new Dictionary<string, RepoFileState>(StringComparer.OrdinalIgnoreCase);

        foreach (var path in Directory.EnumerateFiles(repoPath, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(repoPath, path);
            if (IsInGitDirectory(relative))
            {
                continue;
            }

            var info = new FileInfo(path);
            snapshot[relative] = new RepoFileState(info.Length, info.LastWriteTimeUtc.Ticks);
        }

        return snapshot;
    }

    private static bool IsInGitDirectory(string relativePath)
    {
        return relativePath.StartsWith(".git/", StringComparison.OrdinalIgnoreCase) ||
               relativePath.StartsWith(".git\\", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(relativePath, ".git", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record RepoFileState(long SizeBytes, long LastWriteTimeUtcTicks);
}
