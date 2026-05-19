export type MockFindingStatus = 'fail' | 'unknown' | 'pass';
export type MockFindingSortMode = 'id' | 'status' | 'name';

export interface MockCodeSnippet {
  path: string;
  language: string;
  lineStart: number;
  highlightedLine?: number;
  lines: string[];
}

export interface MockEvidenceItem {
  label: string;
  location?: string;
  excerpt: string;
  raw: string;
  codeSnippet?: MockCodeSnippet;
}

export interface MockFinding {
  id: string;
  title: string;
  status: MockFindingStatus;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  rationale: string;
  remediation: string[];
  checkMarkdown: string;
  evidence: MockEvidenceItem[];
}

export interface MockScanCounts {
  fail: number;
  unknown: number;
  pass: number;
  total: number;
  visible: number;
}

export interface MockScanState {
  workspaceName: string;
  workspacePath: string;
  statusLabel: string;
  generatedAtLabel: string;
  targetLabel: string;
  durationLabel: string;
  tokensLabel: string;
  scopeLabel: string;
  scanTargetLabel: string;
  counts: MockScanCounts;
  activeOperationLabel: string;
  findings: MockFinding[];
  outputLines: string[];
  lastScanPath: string;
}

const DEFAULT_SELECTED_FINDING_ID = 'BP-SEC-001';

const MOCK_FINDINGS: MockFinding[] = [
  {
    id: 'BP-API-002',
    title: 'Collection reads are bounded',
    status: 'unknown',
    confidence: 'medium',
    summary: 'The mock review could not confirm that broad collection reads always apply an explicit limit.',
    rationale:
      'The visible query path looks disciplined, but the scan snapshot keeps this check inconclusive because pagination and administrative reads appear to share helpers. That is enough uncertainty to keep it out of the pass bucket.',
    remediation: [
      'Make limit and pagination parameters explicit at the repository boundary.',
      'Add tests for unbounded administrative or export-style paths.',
      'Keep the scan note once the real extension can jump directly to evidence.'
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
      'The mock result shows the core dependency graph staying visible from the composition root down to request handlers and runtime helpers.',
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
      'The extension mock intentionally keeps VS Code concepts out of the execution core, which is the same directional boundary the design calls for.',
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
    summary: 'The mock shell keeps orchestration in the extension entrypoint instead of scattering it across views.',
    rationale:
      'That gives the real implementation a clean place to own activation, output, status, tree, and detail wiring.',
    remediation: [
      'Continue registering future runtime services in one activation path.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-arch-003-composition-root-owns-wiring.md',
    evidence: [
      {
        label: 'Activation remains the single coordination point',
        location: 'src/vscode/extension.ts:1-120',
        excerpt: 'All mock UI services are created and disposed from the extension root.',
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
      'The repo already contains the UI requirements, implementation plan, and development workflow notes that anchor the mockup.',
    remediation: [
      'Keep the implementation notes current as native detail/editor behavior evolves.'
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
    summary: 'The mock review cannot tell whether every runtime path stays free of workstation-specific assumptions.',
    rationale:
      'The extension mock resolves workspace context locally and stays side-effect free, but the packaged runtime path is not implemented yet.',
    remediation: [
      'Keep packaged asset discovery explicit once the real runtime launches from the extension.',
      'Test workspace, SSH, WSL, and container hosts before calling this a pass.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-ops-005-environment-agnostic-deployment-config.md',
    evidence: [
      {
        label: 'Development host flow is documented, packaged flow is not',
        location: 'docs/implementation/08-vscode-extension-development-workflow.md:1-120',
        excerpt: 'The current workflow targets source-based extension development only.',
        raw: 'docs/implementation/08-vscode-extension-development-workflow.md:1-120'
      }
    ]
  },
  {
    id: 'BP-REL-001',
    title: 'Outbound dependencies have time budgets',
    status: 'pass',
    confidence: 'medium',
    summary: 'The mock extension introduces no new outbound service dependency while UI design is in progress.',
    rationale:
      'That keeps the preview deterministic and avoids blending layout work with provider or runtime behavior.',
    remediation: [
      'Preserve the no-network mock mode until real scan execution is ready.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-rel-001-outbound-dependencies-have-time-budgets.md',
    evidence: [
      {
        label: 'Mock command surfaces are informational only',
        location: 'src/vscode/commands.ts:1-120',
        excerpt: 'Placeholder commands display messages instead of triggering runtime work.',
        raw: 'src/vscode/commands.ts:1-120'
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
      'This remains inconclusive until the extension is wired to the real runtime and error paths can be exercised.',
    remediation: [
      'Keep retry and cancellation behavior visible in the future output channel.',
      'Add extension-host tests once execution is live.'
    ],
    checkMarkdown: '.openshrike/checks/shared/bp-rel-002-retries-are-bounded-and-safe.md',
    evidence: [
      {
        label: 'Runtime execution is intentionally absent in the mock',
        excerpt: 'No retry path exists yet because scan execution has not been connected.',
        raw: 'No retry path exists yet because scan execution has not been connected.'
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

export function createMockScanState(input: {
  workspaceName?: string;
  workspacePath?: string;
} = {}): MockScanState {
  const workspaceName = input.workspaceName ?? 'OpenShrike.vscode';
  const workspacePath = input.workspacePath ?? '/home/example/OpenShrike.vscode';

  return {
    workspaceName,
    workspacePath,
    statusLabel: 'Fixing (mock)',
    generatedAtLabel: 'May 19, 2026 09:12 UTC',
    targetLabel: truncateMiddle(workspacePath, 26),
    durationLabel: '21.1s',
    tokensLabel: '430K / 27K',
    scopeLabel: 'uncommitted changes',
    scanTargetLabel: 'origin/main...HEAD',
    counts: {
      fail: 2,
      unknown: 3,
      pass: 19,
      total: 24,
      visible: MOCK_FINDINGS.length
    },
    activeOperationLabel: 'Fixing bp-sec-001... (1 of 2)',
    findings: MOCK_FINDINGS,
    outputLines: [
      `[09:12:08] OpenShrike mockup activated for ${workspaceName}`,
      `[09:12:09] Sidebar summary restored from static scan snapshot`,
      '[09:12:10] Showing 10 highlighted checks from a 24-check mock scan',
      '[09:12:11] Status counts: 2 failed, 3 inconclusive, 19 passed',
      '[09:12:12] Active operation: Fixing bp-sec-001... (1 of 2)',
      '[09:12:13] Detail preview opened in an editor tab using mock data only',
      '[09:12:14] Edit, Recheck, and Fix actions remain placeholders'
    ],
    lastScanPath: '.openshrike/last-scan.md'
  };
}

export function getDefaultSelectedFindingId(state: MockScanState): string | null {
  const preferredFinding = findFindingById(state, DEFAULT_SELECTED_FINDING_ID);
  return preferredFinding?.id ?? state.findings[0]?.id ?? null;
}

export function findFindingById(state: MockScanState, findingId: string): MockFinding | null {
  return state.findings.find(finding => finding.id === findingId) ?? null;
}

export function getStatusLabel(status: MockFindingStatus): string {
  switch (status) {
    case 'fail':
      return 'Failed';
    case 'unknown':
      return 'Inconclusive';
    case 'pass':
      return 'Passed';
  }
}

export function formatConfidence(confidence: MockFinding['confidence']): string {
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

export function sortMockFindings(findings: readonly MockFinding[], sortMode: MockFindingSortMode): MockFinding[] {
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

function compareStatus(left: MockFindingStatus, right: MockFindingStatus): number {
  const order: Record<MockFindingStatus, number> = {
    fail: 0,
    unknown: 1,
    pass: 2
  };

  return order[left] - order[right];
}
