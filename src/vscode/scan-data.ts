import type {CheckStatus} from '../lib/types.js';
import {
  createCheckingInitEnvironmentState,
  createReadyInitEnvironmentState,
  type InitEnvironmentState
} from './init-environment-state.js';

export type FindingStatus = CheckStatus | 'pending' | 'running' | 'fixing';
export type FindingSortMode = 'id' | 'status' | 'name';
export type ScanStatusKind = 'idle' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'loaded';

export interface CodeSnippet {
  path: string;
  language: string;
  lineStart: number;
  highlightedLine?: number;
  lines: string[];
}

export interface EvidenceItem {
  label: string;
  location?: string;
  excerpt: string;
  raw: string;
  codeSnippet?: CodeSnippet;
}

export interface Finding {
  id: string;
  title: string;
  status: FindingStatus;
  confidence: 'high' | 'medium' | 'low' | null;
  summary: string;
  rationale: string;
  remediation: string[];
  checkMarkdown: string;
  evidence: EvidenceItem[];
}

export interface ScanCounts {
  fail: number;
  unknown: number;
  pass: number;
  pending: number;
  running: number;
  fixing: number;
  completed: number;
  total: number;
  visible: number;
}

export interface ScanState {
  workspaceName: string;
  workspacePath: string;
  statusKind: ScanStatusKind;
  statusLabel: string;
  generatedAtLabel: string;
  targetLabel: string;
  durationLabel: string;
  tokensLabel: string;
  scopeLabel: string;
  scanTargetLabel: string;
  runtimeModeLabel: string;
  parallelismLabel: string;
  counts: ScanCounts;
  activeOperationLabel: string;
  findings: Finding[];
  outputLines: string[];
  lastScanPath: string;
  warnings: string[];
  canCancel: boolean;
  isInitialized: boolean;
  initEnvironment: InitEnvironmentState;
}

const DEFAULT_SELECTED_FINDING_ID = 'BP-SEC-001';

const SAMPLE_FINDINGS: Finding[] = [
  {
    id: 'BP-API-002',
    title: 'Collection reads are bounded',
    status: 'unknown',
    confidence: 'medium',
    summary: 'The scan snapshot could not confirm that broad collection reads always apply an explicit limit.',
    rationale:
      'The visible query path looks disciplined, but the scan snapshot keeps this check inconclusive because pagination and administrative reads appear to share helpers. That is enough uncertainty to keep it out of the pass bucket.',
    remediation: [
      'Make limit and pagination parameters explicit at the repository boundary.',
      'Add tests for unbounded administrative or export-style paths.',
      'Keep the scan note once the extension can jump directly to evidence.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-api-002-bounded-collection-reads.md',
    evidence: [
      {
        label: 'Repository helper accepts a caller-supplied limit',
        location: 'src/data/user-repository.ts:18-41',
        excerpt: 'The public repository API exposes a limit parameter, but the default and max values are not obvious from the call path alone.',
        raw: 'src/data/user-repository.ts:18-41'
      }
    ]
  },
  {
    id: 'BP-ARCH-001',
    title: 'Avoid hidden dependencies',
    status: 'pass',
    confidence: 'high',
    summary: 'Composition remains explicit across the reviewed service boundary.',
    rationale:
      'The result shows the core dependency graph staying visible from the composition root down to request handlers and runtime helpers.',
    remediation: [
      'Preserve explicit wiring as scan execution moves into the extension host.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-arch-001-avoid-hidden-cross-module-dependencies.md',
    evidence: [
      {
        label: 'Service graph is assembled in one module',
        location: 'src/app/bootstrap.ts:1-55',
        excerpt: 'The main graph is created centrally rather than through side-effect imports.',
        raw: 'src/app/bootstrap.ts:1-55'
      }
    ]
  },
  {
    id: 'BP-ARCH-002',
    title: 'Dependency direction follows boundaries',
    status: 'pass',
    confidence: 'high',
    summary: 'Domain logic stays pointed inward and does not depend on presentation details.',
    rationale:
      'The extension keeps VS Code concepts out of the execution core, which is the same directional boundary the design calls for.',
    remediation: [
      'Keep the future scan adapter thin.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-arch-002-dependency-direction-follows-boundaries.md',
    evidence: [
      {
        label: 'Shared scan code is separate from the VS Code shell',
        location: 'src/vscode/extension.ts:1-120',
        excerpt: 'The presentation layer owns only tree, editor, output, and command wiring.',
        raw: 'src/vscode/extension.ts:1-120'
      }
    ]
  },
  {
    id: 'BP-ARCH-003',
    title: 'Composition stays in the root',
    status: 'pass',
    confidence: 'high',
    summary: 'The extension shell keeps orchestration in the entrypoint instead of scattering it across views.',
    rationale:
      'That gives the implementation a clean place to own activation, output, status, tree, and detail wiring.',
    remediation: [
      'Continue registering runtime services in one activation path.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-arch-003-composition-root-owns-wiring.md',
    evidence: [
      {
        label: 'Activation remains the single coordination point',
        location: 'src/vscode/extension.ts:1-120',
        excerpt: 'All UI services are created and disposed from the extension root.',
        raw: 'src/vscode/extension.ts:1-120'
      }
    ]
  },
  {
    id: 'BP-DOC-004',
    title: 'Architectural decisions are recorded',
    status: 'pass',
    confidence: 'medium',
    summary: 'The staged plan and requirements docs clearly describe the extension boundaries and rollout.',
    rationale:
      'The repo already contains the UI requirements, implementation plan, and development workflow notes that anchor the extension rollout.',
    remediation: [
      'Keep the implementation notes current as native detail and editor behavior evolves.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-doc-004-architectural-decisions-recorded.md',
    evidence: [
      {
        label: 'Extension scope and phase plan are documented',
        location: 'docs/implementation/07-vscode-extension-ui-plan.md:1-120',
        excerpt: 'The staged plan describes the extension surfaces, packaging, and boundaries.',
        raw: 'docs/implementation/07-vscode-extension-ui-plan.md:1-120'
      }
    ]
  },
  {
    id: 'BP-OPS-005',
    title: 'Deployment config is environment agnostic',
    status: 'unknown',
    confidence: 'low',
    summary: 'The current review cannot tell whether every runtime path stays free of workstation-specific assumptions.',
    rationale:
      'The extension resolves workspace context locally and stays side-effect free, but the packaged VSIX path is not implemented yet.',
    remediation: [
      'Keep packaged asset discovery explicit once the runtime ships as a VSIX.',
      'Test workspace, SSH, WSL, and container hosts before calling this a pass.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-ops-005-environment-agnostic-deployment-config.md',
    evidence: [
      {
        label: 'Development host flow is documented, packaged flow is not',
        location: 'docs/implementation/08-vscode-extension-development-workflow.md:1-120',
        excerpt: 'The current workflow targets source-based extension development.',
        raw: 'docs/implementation/08-vscode-extension-development-workflow.md:1-120'
      }
    ]
  },
  {
    id: 'BP-REL-001',
    title: 'Outbound dependencies have time budgets',
    status: 'pass',
    confidence: 'medium',
    summary: 'The extension introduces no new outbound service dependency beyond the configured runtime.',
    rationale:
      'That keeps execution explicit and avoids blending UI behavior with hidden provider work.',
    remediation: [
      'Keep runtime configuration explicit and preserve clear timeout behavior for provider calls.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-rel-001-outbound-dependencies-have-time-budgets.md',
    evidence: [
      {
        label: 'Command surfaces route through extension actions',
        location: 'src/vscode/commands.ts:1-160',
        excerpt: 'Commands route user actions into the controller layer instead of placeholder handlers.',
        raw: 'src/vscode/commands.ts:1-160'
      }
    ]
  },
  {
    id: 'BP-REL-002',
    title: 'Retries are bounded',
    status: 'unknown',
    confidence: 'medium',
    summary: 'The design review did not trace retry behavior deeply enough to mark it as passed.',
    rationale:
      'This remains inconclusive until retry and cancellation behavior are exercised more deeply through runtime failure paths.',
    remediation: [
      'Keep retry and cancellation behavior visible in the output channel.',
      'Add extension-host tests for failure handling coverage.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-rel-002-retries-are-bounded-and-safe.md',
    evidence: [
      {
        label: 'Retry behavior is not represented in this fixture',
        excerpt: 'This sample result does not model retry activity.',
        raw: 'This sample result does not model retry activity.'
      }
    ]
  },
  {
    id: 'BP-SEC-001',
    title: 'External input is validated at trust boundaries',
    status: 'fail',
    confidence: 'high',
    summary: 'Request payloads cross a handler boundary before validation is applied.',
    rationale:
      'Data crossing a trust boundary must be strictly validated before processing. Failure to validate external input can lead to injection attacks, data corruption, or unexpected application states. Ensure all entry points use the centralized validation schema.',
    remediation: [
      'Implement a validation schema before request bodies reach the business logic layer.',
      'Remove direct casts from the request boundary and promote only validated data.',
      'Add a regression test that proves malformed input is rejected before persistence.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-sec-001-boundary-input-validation.md',
    evidence: [
      {
        label: 'Handler consumes req.body before validation',
        location: 'src/api/handlers.ts:42',
        excerpt: 'The handler casts request data into an internal payload type before a validation schema runs.',
        raw: 'src/api/handlers.ts:42',
        codeSnippet: {
          path: 'src/api/handlers.ts',
          language: 'typescript',
          lineStart: 41,
          highlightedLine: 44,
          lines: [
            'export async function processUserData(req: Request, res: Response) {',
            "  // FIXME: Input 'req.body' is used without validation schema",
            '  const userData = req.body as UserDataPayload;',
            '  await database.users.insert(userData);',
            '  return res.status(200).send({ success: true });',
            '}'
          ]
        }
      },
      {
        label: 'Schema exists but is not used at the boundary',
        location: 'src/api/validation/user.ts:1-14',
        excerpt: 'A validation helper is present elsewhere in the service, but it is not called from the handler path above.',
        raw: 'src/api/validation/user.ts:1-14'
      }
    ]
  },
  {
    id: 'TS-ARCH-001',
    title: 'External data is not cast directly to trusted types',
    status: 'fail',
    confidence: 'high',
    summary: 'The reviewed handler uses a direct cast instead of a narrowing parser at the edge.',
    rationale:
      'This is the same failure pattern from the selected security finding, viewed through the TypeScript architecture policy lens.',
    remediation: [
      'Introduce a parser or schema that converts unknown input into a trusted domain object.',
      'Ban direct `as SomePayload` casts on request or process boundaries.'
    ],
    checkMarkdown: '.openshrike/checks/typescript/typescript-arch-001-external-data-not-cast-to-trusted-types.md',
    evidence: [
      {
        label: 'Direct trust-upgrade at the API edge',
        location: 'src/api/handlers.ts:44',
        excerpt: 'The cast makes external data appear safe to downstream code without validation.',
        raw: 'src/api/handlers.ts:44'
      }
    ]
  }
];

export function createSampleScanState(input: {
  workspaceName?: string;
  workspacePath?: string;
} = {}): ScanState {
  const workspaceName = input.workspaceName ?? 'OpenShrike.vscode';
  const workspacePath = input.workspacePath ?? '/home/example/OpenShrike.vscode';

  return {
    workspaceName,
    workspacePath,
    statusKind: 'running',
    statusLabel: 'Fixing',
    generatedAtLabel: 'May 19, 2026 09:12 UTC',
    targetLabel: truncateMiddle(workspacePath, 26),
    durationLabel: '21.1s',
    tokensLabel: '430K / 27K',
    scopeLabel: 'uncommitted changes',
    scanTargetLabel: 'origin/main...HEAD',
    runtimeModeLabel: 'native',
    parallelismLabel: 'auto',
    counts: {
      fail: 2,
      unknown: 3,
      pass: 19,
      pending: 0,
      running: 0,
      fixing: 0,
      completed: 24,
      total: 24,
      visible: SAMPLE_FINDINGS.length
    },
    activeOperationLabel: 'Fixing bp-sec-001... (1 of 2)',
    findings: SAMPLE_FINDINGS,
    outputLines: [
      `[09:12:08] OpenShrike extension activated for ${workspaceName}`,
      '[09:12:09] Sidebar summary restored from a sample scan snapshot',
      '[09:12:10] Showing 10 highlighted checks from a 24-check scan',
      '[09:12:11] Status counts: 2 failed, 3 inconclusive, 19 passed',
      '[09:12:12] Active operation: Fixing bp-sec-001... (1 of 2)',
      '[09:12:13] Detail preview opened in an editor tab',
      '[09:12:14] Recheck and fix actions are available from the detail panel'
    ],
    lastScanPath: '.openshrike/last-scan.md',
    warnings: [],
    canCancel: false,
    isInitialized: true,
    initEnvironment: createReadyInitEnvironmentState({
      detectedVersion: 'v22.18.0',
      detectedPath: '/usr/bin/node'
    })
  };
}

export function createEmptyScanState(input: {
  workspaceName: string;
  workspacePath: string;
  statusLabel?: string;
  outputLines?: string[];
  scopeLabel?: string;
  runtimeModeLabel?: string;
  parallelismLabel?: string;
  activeOperationLabel?: string;
  isInitialized?: boolean;
  initEnvironment?: InitEnvironmentState;
}): ScanState {
  return {
    workspaceName: input.workspaceName,
    workspacePath: input.workspacePath,
    statusKind: 'idle',
    statusLabel: input.statusLabel ?? 'Ready to scan',
    generatedAtLabel: 'Not yet generated',
    targetLabel: truncateMiddle(input.workspacePath, 26),
    durationLabel: 'n/a',
    tokensLabel: 'n/a',
    scopeLabel: input.scopeLabel ?? 'uncommitted changes',
    scanTargetLabel: 'project defaults',
    runtimeModeLabel: input.runtimeModeLabel ?? 'native',
    parallelismLabel: input.parallelismLabel ?? 'auto',
    counts: {
      fail: 0,
      unknown: 0,
      pass: 0,
      pending: 0,
      running: 0,
      fixing: 0,
      completed: 0,
      total: 0,
      visible: 0
    },
    activeOperationLabel: input.activeOperationLabel ?? 'Run OpenShrike: Run Scan or Load Last Scan.',
    findings: [],
    outputLines: input.outputLines ?? [],
    lastScanPath: '.openshrike/last-scan.md',
    warnings: [],
    canCancel: false,
    isInitialized: input.isInitialized ?? true,
    initEnvironment: input.initEnvironment ?? createCheckingInitEnvironmentState()
  };
}

export function getDefaultSelectedFindingId(state: ScanState): string | null {
  const preferredFinding = findFindingById(state, DEFAULT_SELECTED_FINDING_ID);
  if (preferredFinding) {
    return preferredFinding.id;
  }

  const failedFinding = state.findings.find(finding => finding.status === 'fail');
  if (failedFinding) {
    return failedFinding.id;
  }

  const unknownFinding = state.findings.find(finding => finding.status === 'unknown');
  if (unknownFinding) {
    return unknownFinding.id;
  }

  return state.findings[0]?.id ?? null;
}

export function findFindingById(state: ScanState, findingId: string): Finding | null {
  return state.findings.find(finding => finding.id === findingId) ?? null;
}

export function getStatusLabel(status: FindingStatus): string {
  switch (status) {
    case 'fail':
      return 'Failed';
    case 'unknown':
      return 'Inconclusive';
    case 'pending':
      return 'Pending';
    case 'running':
      return 'In Progress';
    case 'fixing':
      return 'Fixing';
    case 'pass':
      return 'Passed';
  }
}

export function formatConfidence(confidence: NonNullable<Finding['confidence']>): string {
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

export function sortFindings(findings: readonly Finding[], sortMode: FindingSortMode): Finding[] {
  const sortedFindings = [...findings];

  sortedFindings.sort((left, right) => {
    switch (sortMode) {
      case 'id':
        return compareText(left.id, right.id) || compareText(left.title, right.title);
      case 'name':
        return compareText(left.title, right.title) || compareText(left.id, right.id);
      case 'status':
        return compareStatus(left.status, right.status) || compareText(left.id, right.id) || compareText(left.title, right.title);
    }
  });

  return sortedFindings;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const headLength = Math.floor((maxLength - 3) / 2);
  const tailLength = Math.max(1, maxLength - 3 - headLength);
  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en', {
    numeric: true,
    sensitivity: 'base'
  });
}

function compareStatus(left: FindingStatus, right: FindingStatus): number {
  const order: Record<FindingStatus, number> = {
    fail: 0,
    unknown: 1,
    fixing: 2,
    running: 3,
    pending: 4,
    pass: 5
  };

  return order[left] - order[right];
}
