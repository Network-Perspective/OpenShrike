namespace OpenShrike.Core.Runner;

internal static class ProjectRootResolver
{
    public static string Find()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);

        while (current is not null)
        {
            var marker = Path.Combine(current.FullName, "best_practices");
            if (Directory.Exists(marker))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new InvalidOperationException("Could not locate project root containing 'best_practices'.");
    }
}
