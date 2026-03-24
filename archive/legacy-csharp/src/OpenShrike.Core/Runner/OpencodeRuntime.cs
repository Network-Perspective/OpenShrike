using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace OpenShrike.Core.Runner;

internal sealed class OpencodeRuntime
{
    private const string DefaultAgentName = "shrike-checker";
    private const string DefaultAzureDeployment = "gpt-5.4-mini";
    private const string AzureProviderName = "azure";
    private const string AzureApiKeyEnvironmentVariable = "AZURE_OPENAI_API_KEY";
    private const string AzureBaseUrlEnvironmentVariable = "OPENSHRIKE_AZURE_OPENAI_BASE_URL";
    private const string AzureApiVersionEnvironmentVariable = "OPENSHRIKE_AZURE_OPENAI_API_VERSION";
    private const string DockerImageTag = "openshrike-opencode:1.3.0";
    private const string OpencodePackageVersion = "1.3.0";
    private static readonly object DockerImageLock = new();
    private static volatile bool s_dockerImageReady;

    public string Run(
        string prompt,
        string repoPath,
        string? agent,
        string? model,
        OpencodeRuntimeMode runtimeMode)
    {
        if (runtimeMode == OpencodeRuntimeMode.Docker)
        {
            EnsureDockerImage();
        }

        var command = CreateCommand(prompt, repoPath, agent, model, runtimeMode);
        return Execute(command);
    }

    internal static OpencodeCommand CreateCommand(
        string prompt,
        string repoPath,
        string? agent,
        string? model,
        OpencodeRuntimeMode runtimeMode)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(prompt);
        ArgumentException.ThrowIfNullOrWhiteSpace(repoPath);

        var repoFullPath = Path.GetFullPath(repoPath);
        var agentName = string.IsNullOrWhiteSpace(agent) ? DefaultAgentName : agent.Trim();
        var providerModel = NormalizeAzureModel(model);
        var configContent = BuildConfigContent(agentName, providerModel);

        return runtimeMode switch
        {
            OpencodeRuntimeMode.Local => CreateLocalCommand(prompt, repoFullPath, agentName, configContent),
            OpencodeRuntimeMode.Docker => CreateDockerCommand(prompt, repoFullPath, agentName, configContent),
            _ => throw new InvalidOperationException($"Unsupported opencode runtime mode '{runtimeMode}'.")
        };
    }

    internal static string BuildConfigContent(string agentName, string providerModel)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(agentName);
        ArgumentException.ThrowIfNullOrWhiteSpace(providerModel);

        var apiKey = Environment.GetEnvironmentVariable(AzureApiKeyEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                $"Missing required environment variable '{AzureApiKeyEnvironmentVariable}' for opencode Azure access.");
        }

        var baseUrl = Environment.GetEnvironmentVariable(AzureBaseUrlEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new InvalidOperationException(
                $"Missing required environment variable '{AzureBaseUrlEnvironmentVariable}' for opencode Azure access.");
        }

        var apiVersion = Environment.GetEnvironmentVariable(AzureApiVersionEnvironmentVariable);
        if (string.IsNullOrWhiteSpace(apiVersion))
        {
            throw new InvalidOperationException(
                $"Missing required environment variable '{AzureApiVersionEnvironmentVariable}' for opencode Azure access.");
        }

        var deploymentName = providerModel.StartsWith(AzureProviderName + "/", StringComparison.OrdinalIgnoreCase)
            ? providerModel[(AzureProviderName.Length + 1)..]
            : providerModel;

        var permissions = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["bash"] = "allow",
            ["read"] = "allow",
            ["edit"] = "deny",
            ["write"] = "deny",
            ["webfetch"] = "deny"
        };

        var config = new Dictionary<string, object?>
        {
            ["$schema"] = "https://opencode.ai/config.json",
            ["model"] = providerModel,
            ["provider"] = new Dictionary<string, object?>
            {
                [AzureProviderName] = new Dictionary<string, object?>
                {
                    ["options"] = new Dictionary<string, object?>
                    {
                        ["apiKey"] = apiKey,
                        ["baseURL"] = baseUrl,
                        ["queryParams"] = new Dictionary<string, string>
                        {
                            ["api-version"] = apiVersion
                        }
                    },
                    ["models"] = new Dictionary<string, object?>
                    {
                        [deploymentName] = new Dictionary<string, string>
                        {
                            ["name"] = deploymentName
                        }
                    }
                }
            },
            ["permission"] = permissions,
            ["agent"] = new Dictionary<string, object?>
            {
                [agentName] = new Dictionary<string, object?>
                {
                    ["description"] = "Runs OpenShrike policy checks inside an isolated review environment.",
                    ["model"] = providerModel,
                    ["permission"] = permissions
                }
            }
        };

        return JsonSerializer.Serialize(config, new JsonSerializerOptions
        {
            WriteIndented = false
        });
    }

    private static OpencodeCommand CreateLocalCommand(
        string prompt,
        string repoPath,
        string agentName,
        string configContent)
    {
        return new OpencodeCommand(
            "opencode",
            repoPath,
            BuildOpencodeArguments(prompt, repoPath, agentName),
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["OPENCODE_CONFIG_CONTENT"] = configContent
            });
    }

    private static OpencodeCommand CreateDockerCommand(
        string prompt,
        string repoPath,
        string agentName,
        string configContent)
    {
        var promptBase64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(prompt));

        return new OpencodeCommand(
            "docker",
            repoPath,
            BuildDockerArguments(repoPath),
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["OPENCODE_CONFIG_CONTENT"] = configContent,
                ["SHRIKE_AGENT_NAME"] = agentName,
                ["SHRIKE_PROMPT_BASE64"] = promptBase64
            });
    }

    private static IReadOnlyList<string> BuildOpencodeArguments(string prompt, string repoPath, string agentName)
    {
        return
        [
            "run",
            "--format",
            "json",
            "--dir",
            repoPath,
            "--agent",
            agentName,
            prompt
        ];
    }

    private static IReadOnlyList<string> BuildDockerArguments(string repoPath)
    {
        return
        [
            "run",
            "--rm",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--mount",
            $"type=bind,src={repoPath},dst=/src,readonly",
            "--env",
            "OPENCODE_CONFIG_CONTENT",
            "--env",
            "SHRIKE_AGENT_NAME",
            "--env",
            "SHRIKE_PROMPT_BASE64",
            DockerImageTag
        ];
    }

    private static string Execute(OpencodeCommand command)
    {
        var psi = new ProcessStartInfo(command.FileName)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            WorkingDirectory = command.WorkingDirectory
        };

        foreach (var argument in command.Arguments)
        {
            psi.ArgumentList.Add(argument);
        }

        foreach (var pair in command.EnvironmentVariables)
        {
            psi.Environment[pair.Key] = pair.Value;
        }

        using var process = Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException($"Failed to start process '{command.FileName}'.");
        }

        var textBuffer = new StringBuilder();
        var stdoutTask = Task.Run(async () =>
        {
            while (true)
            {
                var line = await process.StandardOutput.ReadLineAsync().ConfigureAwait(false);
                if (line is null)
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                try
                {
                    using var doc = JsonDocument.Parse(line);
                    if (!doc.RootElement.TryGetProperty("type", out var typeElement))
                    {
                        continue;
                    }

                    if (!string.Equals(typeElement.GetString(), "text", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    if (!doc.RootElement.TryGetProperty("part", out var partElement))
                    {
                        continue;
                    }

                    if (!partElement.TryGetProperty("text", out var textElement))
                    {
                        continue;
                    }

                    var chunk = textElement.GetString();
                    if (!string.IsNullOrWhiteSpace(chunk))
                    {
                        lock (textBuffer)
                        {
                            textBuffer.Append(chunk);
                        }
                    }
                }
                catch (JsonException)
                {
                    // Ignore malformed event lines and keep reading.
                }
            }
        });

        var stderrTask = process.StandardError.ReadToEndAsync();

        Task.WhenAll(stdoutTask, stderrTask).GetAwaiter().GetResult();
        process.WaitForExit();

        var stderr = stderrTask.GetAwaiter().GetResult().Trim();
        if (process.ExitCode != 0)
        {
            var guidance = string.Equals(command.FileName, "docker", StringComparison.Ordinal)
                ? " Use '--local-runtime' to bypass Docker on hosts that cannot start nested containers."
                : string.Empty;

            throw new InvalidOperationException($"{command.FileName} exited with code {process.ExitCode}: {stderr}{guidance}");
        }

        var text = textBuffer.ToString().Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("opencode returned no text response.");
        }

        return text;
    }

    private static string NormalizeAzureModel(string? model)
    {
        var raw = string.IsNullOrWhiteSpace(model) ? DefaultAzureDeployment : model.Trim();
        if (raw.Contains('/', StringComparison.Ordinal))
        {
            return raw.StartsWith(AzureProviderName + "/", StringComparison.OrdinalIgnoreCase)
                ? raw
                : raw[(raw.LastIndexOf('/') + 1)..].Trim() is var suffix && !string.IsNullOrWhiteSpace(suffix)
                    ? AzureProviderName + "/" + suffix
                    : AzureProviderName + "/" + DefaultAzureDeployment;
        }

        return AzureProviderName + "/" + raw;
    }

    private static void EnsureDockerImage()
    {
        if (s_dockerImageReady)
        {
            return;
        }

        lock (DockerImageLock)
        {
            if (s_dockerImageReady)
            {
                return;
            }

            VerifyDockerAvailability();
            if (!HasDockerImage())
            {
                BuildDockerImage();
            }

            s_dockerImageReady = true;
        }
    }

    private static void VerifyDockerAvailability()
    {
        var psi = new ProcessStartInfo("docker")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        psi.ArgumentList.Add("version");
        psi.ArgumentList.Add("--format");
        psi.ArgumentList.Add("{{.Server.Version}}");

        using var process = Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to start docker process.");
        }

        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(stdout))
        {
            throw new InvalidOperationException(
                $"Docker is required for the default isolated runtime. Start Docker or use '--local-runtime'. Details: {stderr.Trim()}");
        }
    }

    private static bool HasDockerImage()
    {
        var psi = new ProcessStartInfo("docker")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        psi.ArgumentList.Add("image");
        psi.ArgumentList.Add("inspect");
        psi.ArgumentList.Add(DockerImageTag);

        using var process = Process.Start(psi);
        if (process is null)
        {
            throw new InvalidOperationException("Failed to start docker process.");
        }

        process.WaitForExit();
        return process.ExitCode == 0;
    }

    private static void BuildDockerImage()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "openshrike-docker-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        try
        {
            var dockerfilePath = Path.Combine(tempRoot, "Dockerfile");
            File.WriteAllText(dockerfilePath, BuildDockerfileContents());
            var entrypointPath = Path.Combine(tempRoot, "shrike-opencode-run");
            File.WriteAllText(entrypointPath, BuildEntrypointScriptContents());

            var psi = new ProcessStartInfo("docker")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                WorkingDirectory = tempRoot
            };

            psi.ArgumentList.Add("build");
            psi.ArgumentList.Add("--tag");
            psi.ArgumentList.Add(DockerImageTag);
            psi.ArgumentList.Add(tempRoot);

            using var process = Process.Start(psi);
            if (process is null)
            {
                throw new InvalidOperationException("Failed to start docker build process.");
            }

            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();
            process.WaitForExit();

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    $"Failed to build docker image '{DockerImageTag}'. {stderr.Trim()} {stdout.Trim()} Use '--local-runtime' to bypass Docker on hosts that cannot start nested containers.".Trim());
            }
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    private static string BuildDockerfileContents()
    {
        return
            "FROM node:22-bookworm-slim\n" +
            "ENV npm_config_update_notifier=false \\\n" +
            "    npm_config_fund=false\n" +
            "RUN apt-get update \\\n" +
            "    && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \\\n" +
            $"    && npm install -g opencode-ai@{OpencodePackageVersion} \\\n" +
            "    && rm -rf /var/lib/apt/lists/*\n" +
            "COPY shrike-opencode-run /usr/local/bin/shrike-opencode-run\n" +
            "RUN chmod +x /usr/local/bin/shrike-opencode-run\n" +
            "ENTRYPOINT [\"/usr/local/bin/shrike-opencode-run\"]\n";
    }

    private static string BuildEntrypointScriptContents()
    {
        return
            "#!/usr/bin/env bash\n" +
            "set -euo pipefail\n" +
            "mkdir -p /workspace/repo\n" +
            "cp -a /src/. /workspace/repo\n" +
            "prompt=\"$(printf '%s' \"${SHRIKE_PROMPT_BASE64:?}\" | base64 -d)\"\n" +
            "exec opencode run --format json --dir /workspace/repo --agent \"${SHRIKE_AGENT_NAME:?}\" \"$prompt\"\n";
    }
}

internal sealed record OpencodeCommand(
    string FileName,
    string WorkingDirectory,
    IReadOnlyList<string> Arguments,
    IReadOnlyDictionary<string, string> EnvironmentVariables);
