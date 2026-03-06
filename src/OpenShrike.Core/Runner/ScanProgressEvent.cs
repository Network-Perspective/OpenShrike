namespace OpenShrike.Core.Runner;

public enum ScanProgressEventType
{
    ScopeResolved,
    NoChangesInScope,
    CheckStarted,
    CheckCompleted
}

public sealed record ScanProgressEvent(
    ScanProgressEventType Type,
    string ScopeLabel,
    int ScopeFileCount,
    bool IsFullRepository,
    string? CheckId,
    string? CheckStatus,
    int PassedCount,
    int FailedCount,
    int UnknownCount,
    int CheckIndex,
    int TotalChecks);
