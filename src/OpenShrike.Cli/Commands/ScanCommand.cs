using System.ComponentModel;
using System.Text.Json;
using OpenShrike.Core.Models;
using OpenShrike.Core.Runner;
using Spectre.Console;
using Spectre.Console.Cli;
using Spectre.Console.Rendering;

namespace OpenShrike.Cli.Commands;

public sealed class ScanCommand : Command<ScanCommand.Settings>
{
    private static readonly IAnsiConsole ErrorConsole = AnsiConsole.Create(new AnsiConsoleSettings
    {
        Out = new AnsiConsoleOutput(Console.Error)
    });

    public sealed class Settings : CommandSettings
    {
        [CommandOption("--check <CHECK_ID>")]
        [Description("Check identifier, e.g. csharp-rel-001-cancellation-tokens")]
        public string? CheckId { get; init; }

        [CommandOption("--policy <POLICY_ID>")]
        [Description("Policy identifier, e.g. csharp-baseline")]
        public string? PolicyId { get; init; }

        [CommandOption("--repo <PATH>")]
        [DefaultValue(".")]
        [Description("Repository path to scan")]
        public string RepoPath { get; init; } = ".";

        [CommandOption("--output <FORMAT>")]
        [DefaultValue("json")]
        [Description("Output format: json or markdown")]
        public string OutputFormat { get; init; } = "json";

        [CommandOption("--agent <NAME>")]
        [Description("Optional opencode agent name")]
        public string? Agent { get; init; }

        [CommandOption("--model <MODEL>")]
        [Description("Optional Azure OpenAI deployment/model name for opencode (default: gpt-5.4-mini)")]
        public string? Model { get; init; }

        [CommandOption("--emit-bundle <PATH>")]
        [Description("Optional path to write assembled bundle instructions")]
        public string? EmitBundlePath { get; init; }

        [CommandOption("--scan-scope <SCOPE>")]
        [DefaultValue("uncommitted")]
        [Description("Scan scope: uncommitted, commit, branch, pr, full")]
        public string ScanScope { get; init; } = "uncommitted";

        [CommandOption("--scan-target <TARGET>")]
        [Description("Scope target: commit/range for commit, base branch for branch, diff spec for pr")]
        public string? ScanTarget { get; init; }

        [CommandOption("--mock-opencode")]
        [Description("Emulate opencode calls locally (2-5s/check, ~90% pass)")]
        public bool MockOpencode { get; init; }

        [CommandOption("--local-runtime")]
        [Description("Run opencode directly on the host instead of the default isolated Docker runtime")]
        public bool LocalRuntime { get; init; }

        public override ValidationResult Validate()
        {
            var hasCheck = !string.IsNullOrWhiteSpace(CheckId);
            var hasPolicy = !string.IsNullOrWhiteSpace(PolicyId);

            if (hasCheck == hasPolicy)
            {
                return ValidationResult.Error("Specify exactly one of: --check <CHECK_ID> or --policy <POLICY_ID>.");
            }

            var isJson = string.Equals(OutputFormat, "json", StringComparison.OrdinalIgnoreCase);
            var isMarkdown = string.Equals(OutputFormat, "markdown", StringComparison.OrdinalIgnoreCase);
            if (!isJson && !isMarkdown)
            {
                return ValidationResult.Error("Supported outputs are '--output json' and '--output markdown'.");
            }

            if (!ScanScopeResolver.TryParseKind(ScanScope, out var scopeKind))
            {
                return ValidationResult.Error("Supported '--scan-scope' values are: uncommitted, commit, branch, pr, full.");
            }

            if (scopeKind == ScanScopeKind.Commit && string.IsNullOrWhiteSpace(ScanTarget))
            {
                return ValidationResult.Error("Scan scope 'commit' requires '--scan-target <COMMIT_OR_RANGE>'.");
            }

            if (scopeKind == ScanScopeKind.Branch && string.IsNullOrWhiteSpace(ScanTarget))
            {
                return ValidationResult.Error("Scan scope 'branch' requires '--scan-target <BASE_BRANCH>'.");
            }

            return ValidationResult.Success();
        }
    }

    public override int Execute(CommandContext context, Settings settings, CancellationToken cancellationToken)
    {
        try
        {
            _ = ScanScopeResolver.TryParseKind(settings.ScanScope, out var scopeKind);
            ScanReport? report = null;
            var viewState = new ScanProgressViewState();

            ErrorConsole.Live(BuildProgressView(viewState))
                .AutoClear(true)
                .Start(ctx =>
                {
                    using var keyListenerCts = new CancellationTokenSource();
                    var keyListener = StartKeyListenerForDetailToggle(
                        () =>
                        {
                            lock (viewState.Sync)
                            {
                                viewState.ShowDetails = !viewState.ShowDetails;
                                ctx.UpdateTarget(BuildProgressView(viewState));
                            }
                        },
                        keyListenerCts.Token);

                    void OnProgress(ScanProgressEvent e)
                    {
                        lock (viewState.Sync)
                        {
                            ApplyProgressEvent(viewState, e);
                            ctx.UpdateTarget(BuildProgressView(viewState));
                        }
                    }

                    try
                    {
                        report = !string.IsNullOrWhiteSpace(settings.PolicyId)
                            ? ScanRunner.RunPolicy(
                                settings.PolicyId,
                                settings.RepoPath,
                                settings.Agent,
                                settings.Model,
                                scopeKind,
                                settings.ScanTarget,
                                settings.MockOpencode,
                                OnProgress,
                                useDockerRuntime: !settings.LocalRuntime)
                            : ScanRunner.Run(
                                settings.CheckId!,
                                settings.RepoPath,
                                settings.Agent,
                                settings.Model,
                                scopeKind,
                                settings.ScanTarget,
                                settings.MockOpencode,
                                OnProgress,
                                useDockerRuntime: !settings.LocalRuntime);
                    }
                    finally
                    {
                        keyListenerCts.Cancel();
                        keyListener.GetAwaiter().GetResult();
                    }
                });

            if (report is null)
            {
                throw new InvalidOperationException("Scan did not produce a report.");
            }

            if (!string.IsNullOrWhiteSpace(settings.EmitBundlePath))
            {
                var bundleContent = !string.IsNullOrWhiteSpace(settings.PolicyId)
                    ? PolicyBundleAssembler.AssembleForPolicy(settings.PolicyId)
                    : PolicyBundleAssembler.AssembleForCheck(settings.CheckId!);

                var bundlePath = Path.GetFullPath(settings.EmitBundlePath);
                var parent = Path.GetDirectoryName(bundlePath);
                if (!string.IsNullOrWhiteSpace(parent))
                {
                    Directory.CreateDirectory(parent);
                }

                File.WriteAllText(bundlePath, bundleContent);
            }

            if (string.Equals(settings.OutputFormat, "markdown", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine(ScanReportMarkdownRenderer.Render(report));
            }
            else
            {
                var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
                {
                    WriteIndented = true
                });

                Console.WriteLine(json);
            }

            return report.Summary.Failed > 0 ? 2 : 0;
        }
        catch (Exception ex)
        {
            ErrorConsole.MarkupLineInterpolated($"[red]Scan failed:[/] {Markup.Escape(ex.Message)}");
            return 1;
        }
    }

    private static Task StartKeyListenerForDetailToggle(Action onToggle, CancellationToken cancellationToken)
    {
        if (Console.IsInputRedirected)
        {
            return Task.CompletedTask;
        }

        return Task.Run(async () =>
        {
            try
            {
                while (!cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                    if (Console.KeyAvailable)
                    {
                        var key = Console.ReadKey(intercept: true);
                        var isCtrlO = key.Key == ConsoleKey.O && (key.Modifiers & ConsoleModifiers.Control) != 0;
                        var isCtrlT = key.Key == ConsoleKey.T && (key.Modifiers & ConsoleModifiers.Control) != 0;
                        var isD = key.Key == ConsoleKey.D && key.Modifiers == 0;
                        var isControlOChar = key.KeyChar == '\u000f';

                        if (isCtrlO || isCtrlT || isD || isControlOChar)
                        {
                            onToggle();
                        }
                    }
                    }
                    catch (InvalidOperationException)
                    {
                        return;
                    }

                    await Task.Delay(80, cancellationToken).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected during shutdown.
            }
        }, cancellationToken);
    }

    private static void ApplyProgressEvent(ScanProgressViewState state, ScanProgressEvent e)
    {
        state.ScopeLabel = e.ScopeLabel;
        state.ScopeFileCount = e.ScopeFileCount;
        state.ScopeIsFullRepository = e.IsFullRepository;
        state.CheckIndex = e.CheckIndex;
        state.TotalChecks = e.TotalChecks;
        state.PassedCount = e.PassedCount;
        state.FailedCount = e.FailedCount;
        state.UnknownCount = e.UnknownCount;

        if (e.Type == ScanProgressEventType.ScopeResolved)
        {
            state.StatusLabel = "Scope resolved";
            return;
        }

        if (e.Type == ScanProgressEventType.NoChangesInScope)
        {
            state.StatusLabel = "No files matched selected scope";
            return;
        }

        if (e.Type == ScanProgressEventType.CheckStarted)
        {
            state.StatusLabel = $"Running {e.CheckId}";
            return;
        }

        if (e.Type == ScanProgressEventType.CheckCompleted)
        {
            state.StatusLabel = $"Completed {e.CheckId}={e.CheckStatus}";
            if (!string.IsNullOrWhiteSpace(e.CheckId))
            {
                state.PassedChecks.Remove(e.CheckId);
                state.FailedChecks.Remove(e.CheckId);
                state.UnknownChecks.Remove(e.CheckId);

                if (string.Equals(e.CheckStatus, "pass", StringComparison.OrdinalIgnoreCase))
                {
                    state.PassedChecks.Add(e.CheckId);
                }
                else if (string.Equals(e.CheckStatus, "fail", StringComparison.OrdinalIgnoreCase))
                {
                    state.FailedChecks.Add(e.CheckId);
                }
                else
                {
                    state.UnknownChecks.Add(e.CheckId);
                }
            }
        }
    }

    private static IRenderable BuildProgressView(ScanProgressViewState state)
    {
        var rows = new List<IRenderable>
        {
            new Rule("[bold]OpenShrike Scan[/]"),
            BuildProgressPanel(state),
            BuildStatusPanel(state)
        };

        return new Rows(rows);
    }

    private static Panel BuildProgressPanel(ScanProgressViewState state)
    {
        var width = 40;
        var total = Math.Max(state.TotalChecks, 1);
        var completed = Math.Clamp(state.CheckIndex, 0, total);
        var ratio = state.TotalChecks <= 0 ? 0d : (double)completed / total;
        var filled = (int)Math.Round(ratio * width, MidpointRounding.AwayFromZero);
        filled = Math.Clamp(filled, 0, width);

        var barColor = state.FailedCount > 0 ? "red" : "green";
        var bar = $"[{barColor}]{new string('=', filled)}[/][grey]{new string('-', width - filled)}[/]";
        var percent = $"{Math.Round(ratio * 100):0}%";

        var content = new Rows(
            new Markup($"{bar} [bold]{percent}[/]"),
            new Markup($"[dim]{Markup.Escape($"[{state.CheckIndex}/{state.TotalChecks}] {state.StatusLabel}")}[/]"));

        return new Panel(content)
        {
            Header = new PanelHeader("Progress"),
            Expand = true,
            Border = BoxBorder.Rounded
        };
    }

    private static Panel BuildStatusPanel(ScanProgressViewState state)
    {
        var lines = new List<IRenderable>
        {
            new Markup($"Scope: [bold]{Markup.Escape(state.ScopeLabel)}[/] ([dim]{FormatScopeFileInfo(state)}[/])"),
            new Markup($"[green]PASS[/]: {state.PassedCount}    [red]FAIL[/]: {state.FailedCount}    [yellow]UNKNOWN[/]: {state.UnknownCount}"),
            new Markup("[dim]Toggle details: d / Ctrl+T / Ctrl+O (terminal-dependent)[/]")
        };

        if (state.ShowDetails)
        {
            lines.Add(new Markup($"[red]Failed checks:[/] {Markup.Escape(JoinChecks(state.FailedChecks))}"));
            lines.Add(new Markup($"[green]Passed checks:[/] {Markup.Escape(JoinChecks(state.PassedChecks))}"));
            lines.Add(new Markup($"[yellow]Unknown checks:[/] {Markup.Escape(JoinChecks(state.UnknownChecks))}"));
        }

        return new Panel(new Rows(lines))
        {
            Header = new PanelHeader("Status"),
            Expand = true,
            Border = BoxBorder.Rounded
        };
    }

    private static string JoinChecks(IReadOnlyCollection<string> checks)
    {
        if (checks.Count == 0)
        {
            return "none";
        }

        return string.Join(", ", checks.OrderBy(x => x, StringComparer.OrdinalIgnoreCase));
    }

    private static string FormatScopeFileInfo(ScanProgressViewState state)
    {
        if (state.ScopeIsFullRepository)
        {
            return "all files";
        }

        return $"{state.ScopeFileCount} files";
    }

    private sealed class ScanProgressViewState
    {
        public object Sync { get; } = new();
        public string ScopeLabel { get; set; } = "resolving scope";
        public int ScopeFileCount { get; set; }
        public bool ScopeIsFullRepository { get; set; }
        public int CheckIndex { get; set; }
        public int TotalChecks { get; set; }
        public int PassedCount { get; set; }
        public int FailedCount { get; set; }
        public int UnknownCount { get; set; }
        public string StatusLabel { get; set; } = "Preparing scan";
        public bool ShowDetails { get; set; }
        public HashSet<string> PassedChecks { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> FailedChecks { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> UnknownChecks { get; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
