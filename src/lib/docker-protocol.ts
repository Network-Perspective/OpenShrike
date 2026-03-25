import {z} from 'zod';
import {
  DOCKER_EVENT_PREFIX,
  MAX_CHECK_EVIDENCE_ITEMS,
  MAX_CHECK_REMEDIATION_ITEMS,
  RUNTIME_MODE_VALUES
} from './constants.js';
import type {CheckResult, ScanProgressEvent, ScanReport, ScanRuntimeEvent} from './types.js';

const checkStatusSchema = z.enum(['pass', 'fail', 'unknown']);
const confidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const runtimeModeSchema = z.enum(RUNTIME_MODE_VALUES);
const parallelismSchema = z.union([z.literal('auto'), z.number().int().min(1)]);

const serializedRuntimeEventSchema = z.object({
  type: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional()
});

const checkResultSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  status: checkStatusSchema,
  confidence: confidenceSchema,
  evidence: z.array(z.string()).max(MAX_CHECK_EVIDENCE_ITEMS),
  rationale: z.string(),
  remediation: z.array(z.string()).max(MAX_CHECK_REMEDIATION_ITEMS)
});

const executionSchema = z.object({
  runtime_mode: runtimeModeSchema,
  requested_parallelism: parallelismSchema,
  effective_parallelism: z.number().int().min(1),
  artifacts_dir: z.string().nullable()
});

const scanReportSchema = z.object({
  bundle_id: z.string().min(1),
  policy_version: z.string().min(1),
  repo: z.object({
    path: z.string().min(1)
  }),
  execution: executionSchema.optional(),
  summary: z.object({
    total_checks: z.number().int().min(0),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    unknown: z.number().int().min(0)
  }),
  checks: z.array(checkResultSchema)
});

const scanProgressEventSchema = z.object({
  type: z.enum(['scope-resolved', 'no-changes-in-scope', 'check-started', 'check-completed']),
  scopeLabel: z.string(),
  scopeFileCount: z.number().int().min(0),
  isFullRepository: z.boolean(),
  checkId: z.string().nullable(),
  workerId: z.string().nullable(),
  checkStatus: checkStatusSchema.nullable(),
  passedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  unknownCount: z.number().int().min(0),
  checkIndex: z.number().int().min(0),
  completedCount: z.number().int().min(0),
  totalChecks: z.number().int().min(0),
  runningCheckIds: z.array(z.string())
});

const scanRuntimeEventSchema = z.object({
  checkId: z.string().nullable(),
  workerId: z.string().nullable(),
  runtimeMode: runtimeModeSchema,
  event: serializedRuntimeEventSchema
});

const dockerProgressWireMessageSchema = z.object({
  kind: z.literal('progress'),
  event: scanProgressEventSchema
});

const dockerRuntimeWireMessageSchema = z.object({
  kind: z.literal('runtime'),
  event: scanRuntimeEventSchema
});

const dockerWireMessageSchema = z.discriminatedUnion('kind', [
  dockerProgressWireMessageSchema,
  dockerRuntimeWireMessageSchema
]);

const dockerScanRequestSchema = z.object({
  options: z.record(z.string(), z.unknown()),
  reportPath: z.string().trim().min(1)
});

export interface DockerScanRequest {
  options: Record<string, unknown>;
  reportPath: string;
}

export interface DockerProgressWireMessage {
  kind: 'progress';
  event: ScanProgressEvent;
}

export interface DockerRuntimeWireMessage {
  kind: 'runtime';
  event: ScanRuntimeEvent;
}

export type DockerWireMessage = DockerProgressWireMessage | DockerRuntimeWireMessage;

export function encodeDockerWireMessage(message: DockerWireMessage): string {
  return `${DOCKER_EVENT_PREFIX}${JSON.stringify(message)}`;
}

export function parseDockerScanRequest(input: unknown): DockerScanRequest {
  return dockerScanRequestSchema.parse(input);
}

export function tryDecodeDockerWireMessage(line: string): DockerWireMessage | null {
  if (!line.startsWith(DOCKER_EVENT_PREFIX)) {
    return null;
  }

  const payload = line.slice(DOCKER_EVENT_PREFIX.length);
  return dockerWireMessageSchema.parse(JSON.parse(payload));
}

export function parseScanReport(input: string): ScanReport {
  return scanReportSchema.parse(JSON.parse(input));
}

export function serializeScanReport(report: ScanReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
