using System.Text.RegularExpressions;

namespace OpenShrike.Core.Runner;

internal static partial class PolicyDefinitionResolver
{
    private static readonly Regex CheckLinkRegex = CheckLinkPattern();

    public static PolicyDefinition Resolve(string policyId)
    {
        var root = ProjectRootResolver.Find();
        var policiesDirectory = Path.Combine(root, "best_practices", "policies");

        if (!Directory.Exists(policiesDirectory))
        {
            throw new InvalidOperationException($"Policies directory not found: {policiesDirectory}");
        }

        var expectedFileName = $"{policyId}.md";
        var policyPath = Directory
            .EnumerateFiles(policiesDirectory, "*.md", SearchOption.AllDirectories)
            .FirstOrDefault(path => string.Equals(Path.GetFileName(path), expectedFileName, StringComparison.OrdinalIgnoreCase));

        if (policyPath is null)
        {
            throw new InvalidOperationException($"Unknown policy id '{policyId}'. Expected markdown definition named '{expectedFileName}'.");
        }

        var text = File.ReadAllText(policyPath);
        var checkIds = CheckLinkRegex
            .Matches(text)
            .Select(match => Path.GetFileNameWithoutExtension(match.Groups["checkFile"].Value))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (checkIds.Length == 0)
        {
            throw new InvalidOperationException($"Policy '{policyId}' contains no linked check definitions.");
        }

        var policyVersion = File.GetLastWriteTimeUtc(policyPath).ToString("yyyy-MM-dd");

        return new PolicyDefinition(policyId, policyVersion, checkIds);
    }

    [GeneratedRegex(@"\(\.\./checks/[^)]+/(?<checkFile>[^)/]+\.md)\)", RegexOptions.IgnoreCase)]
    private static partial Regex CheckLinkPattern();
}

internal sealed record PolicyDefinition(string Id, string Version, IReadOnlyList<string> CheckIds);
