export type OutputFormat = 'json' | 'markdown';
export type RuntimeMode = 'native' | 'docker';
export type ParallelismValue = number | 'auto';

export type ScanScopeKind =
  | 'uncommitted'
  | 'commit'
  | 'branch'
  | 'pr'
  | 'full';

export type CheckStatus = 'pass' | 'fail' | 'unknown';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RepoInfo {
  path: string;
}

export interface SummaryInfo {
  total_checks: number;
  passed: number;
  failed: number;
  unknown: number;
}

export interface CheckResult {
  id: string;
  version: string;
  status: CheckStatus;
  confidence: Confidence;
  evidence: string[];
  rationale: string;
  remediation: string[];
}

export interface ScanReport {
  bundle_id: string;
  policy_version: string;
  repo: RepoInfo;
  execution?: {
    runtime_mode: RuntimeMode;
    requested_parallelism: ParallelismValue;
    effective_parallelism: number;
    artifacts_dir: string | null;
  } | undefined;
  summary: SummaryInfo;
  checks: CheckResult[];
}

export interface PolicyDefinition {
  id: string;
  version: string;
  checkIds: string[];
}

export interface ScanScopeContext {
  kind: ScanScopeKind;
  label: string;
  files: string[];
  isFullRepository: boolean;
}

export type ScanProgressEventType =
  | 'scope-resolved'
  | 'no-changes-in-scope'
  | 'check-started'
  | 'check-completed';

export interface ScanProgressEvent {
  type: ScanProgressEventType;
  scopeLabel: string;
  scopeFileCount: number;
  isFullRepository: boolean;
  checkIds: string[];
  checkId: string | null;
  workerId: string | null;
  checkStatus: CheckStatus | null;
  checkResult: CheckResult | null;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  checkIndex: number;
  completedCount: number;
  totalChecks: number;
  runningCheckIds: string[];
}

export interface SerializedRuntimeEvent {
  type: string;
  properties?: Record<string, unknown> | undefined;
}

export interface ScanRuntimeEvent {
  checkId: string | null;
  workerId: string | null;
  runtimeMode: RuntimeMode;
  event: SerializedRuntimeEvent;
}

export interface ScanCommandOptions {
  checkId?: string | undefined;
  policyId?: string | undefined;
  repoPath: string;
  outputFormat: OutputFormat;
  agent?: string | undefined;
  model?: string | undefined;
  emitBundlePath?: string | undefined;
  scanScope: ScanScopeKind;
  scanTarget?: string | undefined;
  mockOpencode: boolean;
  configPath?: string | undefined;
  logPath?: string | undefined;
  runtimeMode: RuntimeMode;
  image?: string | undefined;
  artifactsDir?: string | undefined;
  parallelism: ParallelismValue;
  ui: boolean;
}

export interface AgentCheckPayload {
  id?: string;
  version?: string;
  status?: string;
  confidence?: string;
  evidence?: string[];
  rationale?: string;
  remediation?: string[];
}
