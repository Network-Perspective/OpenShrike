namespace OpenShrike.Core.Runner;

public enum ScanScopeKind
{
    Uncommitted,
    Commit,
    Branch,
    PullRequest,
    Full
}

internal sealed record ScanScopeContext(
    ScanScopeKind Kind,
    string Label,
    IReadOnlyList<string> Files)
{
    public bool IsFullRepository => Kind == ScanScopeKind.Full;
}
