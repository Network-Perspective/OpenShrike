import type {Event} from '@opencode-ai/sdk';
import {readCheckDefinition} from './checks.js';
import {OpenCodeRuntime} from './runtime.js';
import type {
  AgentCheckPayload,
  CheckResult,
  Confidence,
  ScanScopeContext
} from './types.js';

const DEFAULT_VERSION = '0.1.0';

export interface EvaluateCheckOptions {
  checkId: string;
  repoPath: string;
  agent: string;
  model: string;
  scopeContext: ScanScopeContext;
  emulateOpencode: boolean;
  runtime: OpenCodeRuntime | null;
}

export async function evaluateCheck(options: EvaluateCheckOptions): Promise<CheckResult> {
  if (options.emulateOpencode) {
    return await emulateCheckResult(options.checkId, options.scopeContext);
  }

  if (!options.runtime) {
    throw new Error('OpenCode runtime is not available.');
  }

  const definition = await readCheckDefinition(options.checkId);
  const prompt = buildPrompt(options.checkId, definition, options.repoPath, options.scopeContext);
  const responseText = await options.runtime.runPrompt({
    prompt,
    agent: options.agent,
    model: options.model,
    title: options.checkId
  });

  const payloadJson = extractJsonObject(responseText.text);
  const payload = JSON.parse(payloadJson) as AgentCheckPayload;
  validatePayload(payload, options.checkId);
  validateEvidenceScope(payload, options.scopeContext);

  return {
    id: payload.id!,
    version: payload.version?.trim() || DEFAULT_VERSION,
    status: payload.status as CheckResult['status'],
    confidence: payload.confidence as Confidence,
    evidence: payload.evidence ?? [],
    rationale: payload.rationale?.trim() || 'No rationale provided.',
    remediation: payload.remediation ?? []
  };
}

async function emulateCheckResult(
  checkId: string,
  scopeContext: ScanScopeContext
): Promise<CheckResult> {
  const delayMs = 2_000 + Math.floor(Math.random() * 3_001);
  await new Promise(resolve => setTimeout(resolve, delayMs));

  const isPass = Math.random() < 0.9;
  const evidencePath = scopeContext.isFullRepository
    ? 'README.md:1'
    : buildScopedEvidence(scopeContext);

  return {
    id: checkId,
    version: DEFAULT_VERSION,
    status: isPass ? 'pass' : 'fail',
    confidence: isPass ? 'MEDIUM' : 'HIGH',
    evidence: [evidencePath],
    rationale: isPass
      ? `Mock evaluation passed after ${delayMs}ms.`
      : `Mock evaluation failed after ${delayMs}ms.`,
    remediation: isPass
      ? ['No action required.']
      : ['Inspect the check evidence and update code to satisfy policy.']
  };
}

function buildScopedEvidence(scopeContext: ScanScopeContext): string {
  return `${scopeContext.files[0] || 'README.md'}:1`;
}

export function buildPrompt(
  checkId: string,
  checkDefinition: string,
  repoPath: string,
  scopeContext: ScanScopeContext
): string {
  return [
    `You are executing a single OpenShrike best-practice check against repository path: ${repoPath}`,
    '',
    `Check id: ${checkId}`,
    buildScopeSection(scopeContext),
    '',
    'Check definition markdown:',
    '---',
    checkDefinition,
    '---',
    '',
    'Follow the check definition exactly. Inspect only the allowed review scope and collect direct evidence.',
    'Return ONLY one JSON object with this schema:',
    '{',
    `  "id": "${checkId}",`,
    '  "version": "0.1.0",',
    '  "status": "pass|fail|unknown",',
    '  "confidence": "HIGH|MEDIUM|LOW",',
    '  "evidence": ["relative/path:line"],',
    '  "rationale": "short explanation grounded in evidence",',
    '  "remediation": ["action 1", "action 2"]',
    '}',
    '',
    'Rules:',
    '- Output raw JSON only. No markdown fences.',
    '- Use repo-relative evidence paths.',
    '- If scope is not full repository, evidence paths MUST come from listed scoped files.',
    '- status=unknown only when the check is not applicable or evidence is insufficient.'
  ].join('\n');
}

function buildScopeSection(scopeContext: ScanScopeContext): string {
  if (scopeContext.isFullRepository) {
    return 'Review scope: full repository.';
  }

  const listedFiles = scopeContext.files.slice(0, 200).map(filePath => `- ${filePath}`);
  if (scopeContext.files.length > listedFiles.length) {
    listedFiles.push(`- ... (${scopeContext.files.length - listedFiles.length} more files)`);
  }

  return [`Review scope: ${scopeContext.label}.`, 'Scoped files:', ...listedFiles].join('\n');
}

export function extractJsonObject(input: string): string {
  const fenceStart = input.indexOf('```');
  if (fenceStart >= 0) {
    const firstBraceInFence = input.indexOf('{', fenceStart);
    const fenceEnd = input.lastIndexOf('```');
    if (firstBraceInFence >= 0 && fenceEnd > firstBraceInFence) {
      return extractByBraces(input.slice(firstBraceInFence, fenceEnd));
    }
  }

  return extractByBraces(input);
}

function extractByBraces(text: string): string {
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error('Could not find complete JSON object in agent response.');
}

function validatePayload(payload: AgentCheckPayload, expectedCheckId: string): void {
  if ((payload.id ?? '').toLowerCase() !== expectedCheckId.toLowerCase()) {
    throw new Error(`Agent returned unexpected id '${payload.id}', expected '${expectedCheckId}'.`);
  }

  if (!['pass', 'fail', 'unknown'].includes(payload.status ?? '')) {
    throw new Error(`Agent returned invalid status '${payload.status}'.`);
  }

  if (!['HIGH', 'MEDIUM', 'LOW'].includes(payload.confidence ?? '')) {
    throw new Error(`Agent returned invalid confidence '${payload.confidence}'.`);
  }
}

function validateEvidenceScope(payload: AgentCheckPayload, scopeContext: ScanScopeContext): void {
  if (scopeContext.isFullRepository || !payload.evidence?.length) {
    return;
  }

  const allowed = new Set(scopeContext.files.map(normalizePath));
  for (const evidence of payload.evidence) {
    const separatorIndex = evidence.indexOf(':');
    const evidencePath = separatorIndex >= 0 ? evidence.slice(0, separatorIndex) : evidence;
    const normalized = normalizePath(evidencePath);
    if (!allowed.has(normalized)) {
      throw new Error(
        `Agent returned evidence outside scan scope: '${evidence}'. Allowed scope: ${scopeContext.label}.`
      );
    }
  }
}

function normalizePath(value: string): string {
  return value.trim().replaceAll('\\', '/');
}
