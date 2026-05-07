import type {Event} from '@opencode-ai/sdk';
import {z} from 'zod';
import {readCheckDefinition} from './checks.js';
import {
  MAX_CHECK_EVIDENCE_ITEMS,
  MAX_CHECK_REMEDIATION_ITEMS,
  MAX_SCOPE_EVIDENCE_OUTPUT_LINES
} from './constants.js';
import {OpenCodeRuntime} from './runtime.js';
import type {
  CheckResult,
  Confidence,
  ScanScopeContext
} from './types.js';

const DEFAULT_VERSION = '0.1.0';
const agentCheckPayloadSchema = z.object({
  id: z.string().optional(),
  version: z.string().optional(),
  status: z.enum(['pass', 'fail', 'unknown']).optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  evidence: z.array(z.string()).max(MAX_CHECK_EVIDENCE_ITEMS).optional(),
  rationale: z.string().optional(),
  remediation: z.array(z.string()).max(MAX_CHECK_REMEDIATION_ITEMS).optional()
});
type ValidatedAgentCheckPayload = z.infer<typeof agentCheckPayloadSchema>;

export class CheckEvaluationError extends Error {
  readonly originalOutput: string | null;

  constructor(
    message: string,
    options: {
      originalOutput?: string | null | undefined;
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause !== undefined ? {cause: options.cause} : undefined);
    this.name = 'CheckEvaluationError';
    this.originalOutput = options.originalOutput?.trim() || null;
  }
}

export function getCheckEvaluationOriginalOutput(error: unknown): string | null {
  return error instanceof CheckEvaluationError ? error.originalOutput : null;
}

export interface EvaluateCheckOptions {
  checkId: string;
  repoPath: string;
  agent: string;
  model: string;
  workerId?: string | undefined;
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
    title: options.checkId,
    checkId: options.checkId,
    workerId: options.workerId
  });

  let payloadJson: string | null = null;
  let payload: ValidatedAgentCheckPayload | null = null;

  try {
    payloadJson = extractJsonObject(responseText.text);
    payload = agentCheckPayloadSchema.parse(JSON.parse(payloadJson));
    validatePayload(payload, options.checkId);
    validateEvidenceScope(payload, options.scopeContext);
  } catch (error) {
    throw createCheckEvaluationError(error, responseText.text, payloadJson, payload);
  }

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
  const sections = [
    [
      `You are executing a best-practice check against repository path: ${repoPath}`,
      '',
      `Check id: ${checkId}`,
      buildScopeSection(scopeContext)
    ].join('\n'),
    ['Best-practive check definition markdown:', '---', checkDefinition, '---'].join('\n'),
    [
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
      ...buildPromptRules(scopeContext)
    ].join('\n')
  ];
  const scopeEvidenceSection = buildScopeEvidenceSection(scopeContext);
  if (scopeEvidenceSection) {
    sections.push(scopeEvidenceSection);
  }

  return sections.join('\n\n');
}

function buildScopeSection(scopeContext: ScanScopeContext): string {
  if (scopeContext.isFullRepository) {
    return 'Review scope: full repository.';
  }

  const listedFiles = scopeContext.files.map(filePath => `- ${filePath}`);
  return [
    `Review scope: ${scopeContext.label}.`,
    '',
    `Scoped file allowlist (${scopeContext.files.length}):`,
    ...listedFiles
  ].join('\n');
}

function buildPromptRules(scopeContext: ScanScopeContext): string[] {
  const baseRules = [
    '- Output raw JSON only. No markdown fences.',
    '- Use repo-relative evidence paths.',
    `- Keep evidence to at most ${MAX_CHECK_EVIDENCE_ITEMS} items.`,
    `- Keep remediation to at most ${MAX_CHECK_REMEDIATION_ITEMS} items.`
  ];
  const statusRule = '- status=unknown only when the check is not applicable or evidence is insufficient.';

  if (scopeContext.isFullRepository) {
    return [...baseRules, statusRule];
  }

  return [
    ...baseRules,
    '- If scope is not full repository, evidence paths MUST come from the scoped file allowlist above.',
    '- If the relevant evidence is outside the scoped file allowlist, return status="unknown".',
    '- Do not cite or mention out-of-scope file paths in evidence, rationale, or remediation.',
    ...(scopeContext.scopeEvidence?.mode === 'complete'
      ? [
          '- Treat the captured scope evidence at the end of this prompt as authoritative for scope discovery.',
          '- Do not rerun `git status`, `git diff`, `git show`, or `git log` to redefine scope. Use the scoped file allowlist and attached scope capture instead.'
        ]
      : scopeContext.scopeEvidence?.mode === 'omitted'
        ? [
            `- The diff for this scope was omitted because it exceeded the inline limit of ${MAX_SCOPE_EVIDENCE_OUTPUT_LINES} lines.`,
            '- Inspect scoped files directly to gather evidence instead of relying on a partial diff.'
          ]
      : []),
    statusRule
  ];
}

function buildScopeEvidenceSection(scopeContext: ScanScopeContext): string {
  if (scopeContext.isFullRepository || !scopeContext.scopeEvidence) {
    return '';
  }

  if (scopeContext.scopeEvidence.mode === 'omitted') {
    return '';
  }

  const lines = [
    'Authoritative scope evidence:',
    'The commands below were already executed by OpenShrike to define this review scope.',
    'If you need exact current line numbers, you may open files from the scoped file allowlist only.'
  ];

  if (scopeContext.scopeEvidence.mode === 'complete') {
    lines.splice(
      2,
      0,
      'Reuse this captured output instead of rerunning git scope-discovery commands.'
    );
  }

  if (scopeContext.scopeEvidence.commands.length === 0) {
    lines.push('', 'No captured diff output was recorded for this scope.');
    return lines.join('\n');
  }

  scopeContext.scopeEvidence.commands.forEach((capture, index) => {
    lines.push('', `Scope capture ${index + 1}: ${capture.description}`, 'Command:', capture.command, 'Output:', capture.output || '(no output)');
  });

  return lines.join('\n');
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

function validatePayload(payload: ValidatedAgentCheckPayload, expectedCheckId: string): void {
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

function validateEvidenceScope(payload: ValidatedAgentCheckPayload, scopeContext: ScanScopeContext): void {
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

function createCheckEvaluationError(
  error: unknown,
  rawResponseText: string,
  payloadJson: string | null,
  payload: ValidatedAgentCheckPayload | null
): CheckEvaluationError {
  if (error instanceof CheckEvaluationError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const originalOutput = payload
    ? JSON.stringify(payload, null, 2)
    : payloadJson
    ?? rawResponseText;

  return new CheckEvaluationError(message, {
    originalOutput,
    cause: error
  });
}
