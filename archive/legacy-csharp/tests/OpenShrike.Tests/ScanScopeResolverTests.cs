using OpenShrike.Core.Runner;

namespace OpenShrike.Tests;

public class ScanScopeResolverTests
{
    [Theory]
    [InlineData("uncommitted", ScanScopeKind.Uncommitted)]
    [InlineData("commit", ScanScopeKind.Commit)]
    [InlineData("branch", ScanScopeKind.Branch)]
    [InlineData("pr", ScanScopeKind.PullRequest)]
    [InlineData("full", ScanScopeKind.Full)]
    public void TryParseKind_Parses_Known_Values(string input, ScanScopeKind expected)
    {
        var success = ScanScopeResolver.TryParseKind(input, out var actual);

        Assert.True(success);
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void TryParseKind_Returns_False_For_Unknown_Value()
    {
        var success = ScanScopeResolver.TryParseKind("unknown", out _);

        Assert.False(success);
    }
}
