import path from 'node:path';
import {resolveCheckDefinitionPath} from './checks.js';
import {resolvePolicyDefinition} from './policies.js';
import {findToolRoot} from './project-root.js';

export async function assembleBundleForPolicy(policyId: string): Promise<string> {
  const policy = await resolvePolicyDefinition(policyId);
  return await assembleBundle(policy.id, policy.checkIds);
}

export async function assembleBundleForCheck(checkId: string): Promise<string> {
  return await assembleBundle(checkId, [checkId]);
}

async function assembleBundle(bundleId: string, checkIds: string[]): Promise<string> {
  const toolRoot = findToolRoot();
  const lines = [
    '# OpenShrike Execution Bundle',
    '',
    `bundle_id: ${bundleId}`,
    'runtime: opencode',
    'guardrails:',
    '- read_only_repo: true',
    '- network: disabled_by_default',
    '- tools: minimum-required',
    '',
    'checks:'
  ];

  for (const checkId of checkIds) {
    const definitionPath = await resolveCheckDefinitionPath(checkId);
    const relativePath = path.relative(toolRoot, definitionPath).replaceAll(path.sep, '/');
    lines.push(`- id: ${checkId}`);
    lines.push(`  source: ${relativePath}`);
  }

  lines.push('', 'report_schema: openshrike-scan-report-v1');
  return lines.join('\n');
}
