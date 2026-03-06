using OpenShrike.Core.Runner;

namespace OpenShrike.Tests;

public class ScanRunnerGuardTests
{
    [Fact]
    public void Run_Throws_When_Repository_Path_Does_Not_Exist()
    {
        var missingPath = Path.Combine(Path.GetTempPath(), "openshrike-missing-" + Guid.NewGuid());

        var ex = Assert.Throws<DirectoryNotFoundException>(() =>
            ScanRunner.Run("csharp-rel-001-cancellation-tokens", missingPath, agent: null, model: null));

        Assert.Contains("Repository path not found", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Run_Throws_When_Check_Id_Is_Unknown()
    {
        var repoPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));

        var ex = Assert.Throws<InvalidOperationException>(() =>
            ScanRunner.Run("not-a-real-check", repoPath, agent: null, model: null));

        Assert.Contains("Unknown check id", ex.Message, StringComparison.OrdinalIgnoreCase);
    }
}
