using OpenShrike.Cli.Commands;

namespace OpenShrike.Tests;

public class ScanCommandSettingsTests
{
    [Fact]
    public void Validate_Fails_When_Check_And_Policy_Are_Both_Missing()
    {
        var settings = new ScanCommand.Settings
        {
            RepoPath = ".",
            OutputFormat = "json"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("exactly one", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Fails_When_Check_And_Policy_Are_Both_Set()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            PolicyId = "csharp-baseline",
            RepoPath = ".",
            OutputFormat = "json"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("exactly one", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Fails_When_Output_Is_Unsupported()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "xml"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("supported outputs", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Succeeds_For_Valid_Check_Inputs()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "uncommitted"
        };

        var result = settings.Validate();

        Assert.True(result.Successful);
    }

    [Fact]
    public void Validate_Succeeds_For_Valid_Policy_Inputs_With_Markdown_Output()
    {
        var settings = new ScanCommand.Settings
        {
            PolicyId = "csharp-baseline",
            RepoPath = ".",
            OutputFormat = "markdown",
            ScanScope = "full"
        };

        var result = settings.Validate();

        Assert.True(result.Successful);
    }

    [Fact]
    public void Validate_Fails_For_Invalid_Scan_Scope()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "random"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("scan-scope", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Fails_Commit_Scope_Without_Target()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "commit"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("commit", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("scan-target", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Fails_Branch_Scope_Without_Target()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "branch"
        };

        var result = settings.Validate();

        Assert.False(result.Successful);
        Assert.Contains("branch", result.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("scan-target", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_Succeeds_Commit_Scope_With_Target()
    {
        var settings = new ScanCommand.Settings
        {
            CheckId = "csharp-rel-001-cancellation-tokens",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "commit",
            ScanTarget = "HEAD~1..HEAD"
        };

        var result = settings.Validate();

        Assert.True(result.Successful);
    }

    [Fact]
    public void Validate_Succeeds_With_Mock_Opencode_Enabled()
    {
        var settings = new ScanCommand.Settings
        {
            PolicyId = "csharp-baseline",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "full",
            MockOpencode = true
        };

        var result = settings.Validate();

        Assert.True(result.Successful);
    }

    [Fact]
    public void Validate_Succeeds_With_Local_Runtime_Enabled()
    {
        var settings = new ScanCommand.Settings
        {
            PolicyId = "csharp-baseline",
            RepoPath = ".",
            OutputFormat = "json",
            ScanScope = "full",
            LocalRuntime = true
        };

        var result = settings.Validate();

        Assert.True(result.Successful);
    }
}
