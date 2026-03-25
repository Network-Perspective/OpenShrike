export type OutputFormat = 'json' | 'markdown';

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
  checkId: string | null;
  checkStatus: CheckStatus | null;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  checkIndex: number;
  totalChecks: number;
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
