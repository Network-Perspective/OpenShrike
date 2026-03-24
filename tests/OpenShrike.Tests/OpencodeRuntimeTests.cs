using System.Text.Json;
using OpenShrike.Core.Runner;

namespace OpenShrike.Tests;

public class OpencodeRuntimeTests
{
    [Fact]
    public void CreateCommand_Uses_Docker_Runtime_By_Default_With_Isolated_Copy_Bootstrap()
    {
        Environment.SetEnvironmentVariable("AZURE_OPENAI_API_KEY", "test-key");

        var command = OpencodeRuntime.CreateCommand(
            "scan prompt",
            "/repo/path",
            agent: null,
            model: null,
            OpencodeRuntimeMode.Docker);

        Assert.Equal("docker", command.FileName);
        Assert.Contains("run", command.Arguments);
        Assert.Contains("type=bind,src=/repo/path,dst=/src,readonly", command.Arguments);
        Assert.Equal("shrike-checker", command.EnvironmentVariables["SHRIKE_AGENT_NAME"]);
        Assert.True(command.EnvironmentVariables.ContainsKey("SHRIKE_PROMPT_BASE64"));
    }

    [Fact]
    public void CreateCommand_Uses_Local_Runtime_When_Requested()
    {
        Environment.SetEnvironmentVariable("AZURE_OPENAI_API_KEY", "test-key");

        var command = OpencodeRuntime.CreateCommand(
            "scan prompt",
            "/repo/path",
            agent: "custom-agent",
            model: "custom-model",
            OpencodeRuntimeMode.Local);

        Assert.Equal("opencode", command.FileName);
        Assert.Equal("/repo/path", command.WorkingDirectory);
        Assert.Equal("run", command.Arguments[0]);
        Assert.Contains("--agent", command.Arguments);
        Assert.Contains("custom-agent", command.Arguments);
        Assert.Contains("scan prompt", command.Arguments);
        Assert.True(command.EnvironmentVariables.ContainsKey("OPENCODE_CONFIG_CONTENT"));
    }

    [Fact]
    public void BuildConfigContent_Uses_Azure_Settings_And_Default_Permissions()
    {
        Environment.SetEnvironmentVariable("AZURE_OPENAI_API_KEY", "test-key");

        var json = OpencodeRuntime.BuildConfigContent("shrike-checker", "azure/gpt-5.4-mini");
        using var doc = JsonDocument.Parse(json);

        Assert.Equal("azure/gpt-5.4-mini", doc.RootElement.GetProperty("model").GetString());

        var provider = doc.RootElement
            .GetProperty("provider")
            .GetProperty("azure");

        Assert.Equal("https://np-openai-swe.openai.azure.com/openai", provider.GetProperty("options").GetProperty("baseURL").GetString());
        Assert.Equal("2025-04-01-preview", provider.GetProperty("options").GetProperty("queryParams").GetProperty("api-version").GetString());
        Assert.Equal("test-key", provider.GetProperty("options").GetProperty("apiKey").GetString());

        var agent = doc.RootElement
            .GetProperty("agent")
            .GetProperty("shrike-checker");

        Assert.Equal("azure/gpt-5.4-mini", agent.GetProperty("model").GetString());
        Assert.Equal("allow", agent.GetProperty("permission").GetProperty("bash").GetString());
        Assert.Equal("deny", agent.GetProperty("permission").GetProperty("edit").GetString());
    }
}
