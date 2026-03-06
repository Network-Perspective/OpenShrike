namespace OpenShrike.Core.Runner;

public static class PolicyBundleAssembler
{
    public static string AssembleForPolicy(string policyId)
    {
        var policy = PolicyDefinitionResolver.Resolve(policyId);
        return Assemble(policy.Id, policy.CheckIds);
    }

    public static string AssembleForCheck(string checkId)
    {
        return Assemble(checkId, new[] { checkId });
    }

    private static string Assemble(string bundleId, IReadOnlyList<string> checkIds)
    {
        var lines = new List<string>
        {
            "# OpenShrike Execution Bundle",
            "",
            $"bundle_id: {bundleId}",
            "runtime: opencode",
            "guardrails:",
            "- read_only_repo: true",
            "- network: disabled_by_default",
            "- tools: minimum-required",
            "",
            "checks:"
        };

        foreach (var checkId in checkIds)
        {
            var path = CheckDefinitionResolver.ResolvePath(checkId);
            var relativePath = Path.GetRelativePath(ProjectRootResolver.Find(), path).Replace('\\', '/');
            lines.Add($"- id: {checkId}");
            lines.Add($"  source: {relativePath}");
        }

        lines.Add("");
        lines.Add("report_schema: openshrike-scan-report-v1");

        return string.Join(Environment.NewLine, lines);
    }
}
