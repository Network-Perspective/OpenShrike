using System.Diagnostics;
namespace OpenShrike.Core.Runner;

public static class ScanScopeResolver
{
    public static bool TryParseKind(string value, out ScanScopeKind kind)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            kind = default;
            return false;
        }

        kind = value.Trim().ToLowerInvariant() switch
        {
            "uncommitted" => ScanScopeKind.Uncommitted,
            "commit" => ScanScopeKind.Commit,
            "branch" => ScanScopeKind.Branch,
            "pr" => ScanScopeKind.PullRequest,
            "full" => ScanScopeKind.Full,
            _ => default
        };

        return value.Equals("uncommitted", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("commit", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("branch", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("pr", StringComparison.OrdinalIgnoreCase) ||
               value.Equals("full", StringComparison.OrdinalIgnoreCase);
    }

    internal static ScanScopeContext Resolve(string repoPath, ScanScopeKind kind, string? target)
    {
        EnsureGitRepo(repoPath);

        return kind switch
        {
            ScanScopeKind.Uncommitted => ResolveUncommitted(repoPath),
            ScanScopeKind.Commit => ResolveCommit(repoPath, target),
            ScanScopeKind.Branch => ResolveBranch(repoPath, target),
            ScanScopeKind.PullRequest => ResolvePullRequest(repoPath, target),
            ScanScopeKind.Full => new ScanScopeContext(ScanScopeKind.Full, "full repository", Array.Empty<string>()),
            _ => throw new InvalidOperationException($"Unsupported scan scope: {kind}.")
        };
    }

    private static ScanScopeContext ResolveUncommitted(string repoPath)
    {
        var output = RunGit(repoPath, "status", "--porcelain");
        var files = output
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(ParseStatusLinePath)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Select(NormalizePath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new ScanScopeContext(ScanScopeKind.Uncommitted, "uncommitted changes", files);
    }

    private static ScanScopeContext ResolveCommit(string repoPath, string? target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            throw new InvalidOperationException("Scan scope 'commit' requires '--scan-target <COMMIT_OR_RANGE>'.");
        }

        var files = target.Contains("..", StringComparison.Ordinal)
            ? ResolveFilesFromDiff(repoPath, target)
            : ResolveFilesFromShow(repoPath, target);

        return new ScanScopeContext(ScanScopeKind.Commit, $"commit {target}", files);
    }

    private static ScanScopeContext ResolveBranch(string repoPath, string? target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            throw new InvalidOperationException("Scan scope 'branch' requires '--scan-target <BASE_BRANCH>'.");
        }

        var diffSpec = $"{target}...HEAD";
        var files = ResolveFilesFromDiff(repoPath, diffSpec);
        return new ScanScopeContext(ScanScopeKind.Branch, $"branch diff {diffSpec}", files);
    }

    private static ScanScopeContext ResolvePullRequest(string repoPath, string? target)
    {
        var diffSpec = string.IsNullOrWhiteSpace(target) ? "origin/main...HEAD" : target;
        var files = ResolveFilesFromDiff(repoPath, diffSpec);
        return new ScanScopeContext(ScanScopeKind.PullRequest, $"pull request diff {diffSpec}", files);
    }

    private static string[] ResolveFilesFromDiff(string repoPath, string diffSpec)
    {
        var output = RunGit(repoPath, "diff", "--name-only", diffSpec);
        return ParseNameOnlyOutput(output);
    }

    private static string[] ResolveFilesFromShow(string repoPath, string commitRef)
    {
        var output = RunGit(repoPath, "show", "--pretty=format:", "--name-only", commitRef);
        return ParseNameOnlyOutput(output);
    }

    private static string[] ParseNameOnlyOutput(string output)
    {
        return output
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizePath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ParseStatusLinePath(string line)
    {
        if (line.Length < 4)
        {
            return string.Empty;
        }

        var pathPart = line[3..];
        var renameSeparator = pathPart.IndexOf(" -> ", StringComparison.Ordinal);
        if (renameSeparator >= 0)
        {
            return UnquotePath(pathPart[(renameSeparator + 4)..].Trim());
        }

        return UnquotePath(pathPart.Trim());
    }

    private static string NormalizePath(string path)
    {
        return path.Replace('\\', '/');
    }

    private static string UnquotePath(string path)
    {
        if (path.Length >= 2 && path.StartsWith('"') && path.EndsWith('"'))
        {
            return path[1..^1].Replace("\\\"", "\"", StringComparison.Ordinal);
        }

        return path;
    }

    private static void EnsureGitRepo(string repoPath)
    {
        try
        {
            _ = RunGit(repoPath, "rev-parse", "--is-inside-work-tree");
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Repository path is not a valid git repository: {repoPath}", ex);
        }
    }

    private static string RunGit(string repoPath, params string[] args)
    {
        var psi = new ProcessStartInfo("git")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            WorkingDirectory = repoPath
        };

        psi.ArgumentList.Add("-C");
        psi.ArgumentList.Add(repoPath);
        foreach (var arg in args)
        {
            psi.ArgumentList.Add(arg);
        }

        using var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start git process.");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            var argDisplay = string.Join(" ", args);
            throw new InvalidOperationException($"git command failed (git {argDisplay}): {stderr.Trim()}");
        }

        return stdout;
    }
}
