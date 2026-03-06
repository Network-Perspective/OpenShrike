using System.ComponentModel;
using System.Text.Json;
using OpenShrike.Core.Runner;
using Spectre.Console;
using Spectre.Console.Cli;

namespace OpenShrike.Cli.Commands;

public sealed class ScanCommand : Command<ScanCommand.Settings>
{
    public sealed class Settings : CommandSettings
    {
        [CommandOption("--check <CHECK_ID>")]
        [Description("Check identifier, e.g. csharp-rel-001-cancellation-tokens")]
        public required string CheckId { get; init; }

        [CommandOption("--repo <PATH>")]
        [DefaultValue(".")]
        [Description("Repository path to scan")]
        public string RepoPath { get; init; } = ".";

        [CommandOption("--output <FORMAT>")]
        [DefaultValue("json")]
        [Description("Output format (json only in MVP)")]
        public string OutputFormat { get; init; } = "json";

        [CommandOption("--agent <NAME>")]
        [Description("Optional opencode agent name")]
        public string? Agent { get; init; }

        [CommandOption("--model <PROVIDER_MODEL>")]
        [Description("Optional opencode model, e.g. openai/gpt-5")]
        public string? Model { get; init; }

        public override ValidationResult Validate()
        {
            if (string.IsNullOrWhiteSpace(CheckId))
            {
                return ValidationResult.Error("Missing required argument: --check <CHECK_ID>");
            }

            if (!string.Equals(OutputFormat, "json", StringComparison.OrdinalIgnoreCase))
            {
                return ValidationResult.Error("Only '--output json' is supported in MVP.");
            }

            return ValidationResult.Success();
        }
    }

    public override int Execute(CommandContext context, Settings settings, CancellationToken cancellationToken)
    {
        try
        {
            var report = ScanRunner.Run(settings.CheckId, settings.RepoPath, settings.Agent, settings.Model);
            var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            Console.WriteLine(json);

            return report.Summary.Failed > 0 ? 2 : 0;
        }
        catch (Exception ex)
        {
            AnsiConsole.MarkupLineInterpolated($"[red]Scan failed:[/] {Markup.Escape(ex.Message)}");
            return 1;
        }
    }
}
