import path from 'node:path';
import {resolveCheckDefinitionPath, resolveProjectCheckSelection} from './checks.js';
import {CONFIG_DIRECTORY_NAME} from './constants.js';
import {resolvePolicyDefinition} from './policies.js';
import {findToolRoot} from './project-root.js';

export async function assembleBundleForPolicy(policyId: string): Promise<string> {
  const policy = await resolvePolicyDefinition(policyId);
  return await assembleBundle(policy.id, policy.checkIds);
}

export async function assembleBundleForCheck(checkId: string): Promise<string> {
  return await assembleBundle(checkId, [checkId]);
}

export async function assembleBundleForProjectChecks(
  projectChecksDir: string,
  checkId?: string | undefined
): Promise<string> {
  const selection = await resolveProjectCheckSelection(projectChecksDir, checkId);
  return await assembleBundle(
    checkId ?? 'project-checks',
    selection.checkIds,
    {
      checksDirectory: projectChecksDir,
      relativeBase: resolveProjectChecksBundleBase(projectChecksDir)
    }
  );
}

async function assembleBundle(
  bundleId: string,
  checkIds: string[],
  options: {
    checksDirectory?: string | undefined;
    relativeBase?: string | undefined;
  } = {}
): Promise<string> {
  const toolRoot = findToolRoot();
  const relativeBase = options.relativeBase ?? toolRoot;
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
    const definitionPath = await resolveCheckDefinitionPath(checkId, {
      checksDirectory: options.checksDirectory
    });
    const relativePath = path.relative(relativeBase, definitionPath).replaceAll(path.sep, '/');
    lines.push(`- id: ${checkId}`);
    lines.push(`  source: ${relativePath}`);
  }

  lines.push('', 'report_schema: openshrike-scan-report-v1');
  return lines.join('\n');
}

function resolveProjectChecksBundleBase(projectChecksDir: string): string {
  const configDirectory = path.dirname(projectChecksDir);
  return path.basename(configDirectory) === CONFIG_DIRECTORY_NAME
    ? path.dirname(configDirectory)
    : configDirectory;
}
