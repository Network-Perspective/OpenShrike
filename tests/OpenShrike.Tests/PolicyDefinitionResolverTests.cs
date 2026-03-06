using OpenShrike.Core.Runner;

namespace OpenShrike.Tests;

public class PolicyDefinitionResolverTests
{
    [Fact]
    public void Resolve_Returns_Checks_For_Csharp_Baseline()
    {
        var policy = PolicyDefinitionResolver.Resolve("csharp-baseline");

        Assert.Equal("csharp-baseline", policy.Id);
        Assert.NotEmpty(policy.Version);
        Assert.NotEmpty(policy.CheckIds);
        Assert.Contains("csharp-rel-001-cancellation-tokens", policy.CheckIds, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public void Resolve_Throws_For_Unknown_Policy()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => PolicyDefinitionResolver.Resolve("not-a-real-policy"));

        Assert.Contains("Unknown policy id", ex.Message, StringComparison.OrdinalIgnoreCase);
    }
}
