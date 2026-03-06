using OpenShrike.Cli.Commands;
using Spectre.Console.Cli;

var app = new CommandApp();

app.Configure(config =>
{
    config.SetApplicationName("shrike");
    config.AddCommand<ScanCommand>("scan")
        .WithDescription("Run a single OpenShrike check against a repository.");
});

return app.Run(args);
