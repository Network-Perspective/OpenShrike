namespace OpenShrike.Core.Runner;

internal static class CheckDefinitionResolver
{
    public static string ResolvePath(string checkId)
    {
        var root = FindProjectRoot();
        var checksDirectory = Path.Combine(root, "best_practices", "checks");

        if (!Directory.Exists(checksDirectory))
        {
            throw new InvalidOperationException($"Checks directory not found: {checksDirectory}");
        }

        var expectedFileName = $"{checkId}.md";
        var match = Directory
            .EnumerateFiles(checksDirectory, "*.md", SearchOption.AllDirectories)
            .FirstOrDefault(path => string.Equals(Path.GetFileName(path), expectedFileName, StringComparison.OrdinalIgnoreCase));

        if (match is null)
        {
            throw new InvalidOperationException($"Unknown check id '{checkId}'. Expected markdown definition named '{expectedFileName}'.");
        }

        return match;
    }

    private static string FindProjectRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);

        while (current is not null)
        {
            var marker = Path.Combine(current.FullName, "best_practices", "checks");
            if (Directory.Exists(marker))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException("Could not locate project root containing 'best_practices/checks'.");
    }
}
