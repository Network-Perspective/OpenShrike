using OpenShrike.Cli.Commands;

namespace OpenShrike.Tests;

public class ScanCommandSettingsTests
{
    [Fact]
    public void Validate_Fails_When_CheckId_Is_Missing()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "",
            RepoPath = ".",
            OutputFormat = "json"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("--check", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Fails_When_Output_Is_Not_Json()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "markdown"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("--output json", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Succeeds_For_Valid_Inputs()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "json"
        };

        var result = settings.Validate();

        Assert.True(result.Successful);
    }
}
