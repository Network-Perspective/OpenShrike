import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {createEmptyScanState, createMockScanState, getDefaultSelectedFindingId, sortMockFindings} from '../src/vscode/mock-data.js';
import {buildMockScanViewModel} from '../src/vscode/mock-view-model.js';
import {createScanStateFromResults} from '../src/vscode/scan-state.js';
import {renderChecksHtml} from '../src/vscode/views/checks-html.js';
import {renderFindingDetailHtml} from '../src/vscode/views/detail-html.js';
import {renderSummaryHtml} from '../src/vscode/views/summary-html.js';

describe('VS Code mock data', () => {
  it('builds summary counts from the staged design snapshot', () => {
    const state = createMockScanState({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace'
    });

    expect(state.counts.fail).toBe(2);
    expect(state.counts.unknown).toBe(3);
    expect(state.counts.pass).toBe(19);
    expect(state.counts.total).toBe(24);
    expect(state.counts.visible).toBe(10);
  });

  it('selects the staged security finding by default', () => {
    const state = createMockScanState();

    expect(getDefaultSelectedFindingId(state)).toBe('BP-SEC-001');
  });

  it('sorts findings by status using fail, inconclusive, then pass', () => {
    const state = createMockScanState();
    const sorted = sortMockFindings(state.findings, 'status');

    expect(sorted.slice(0, 2).map(finding => finding.id)).toEqual(['BP-SEC-001', 'TS-ARCH-001']);
    expect(sorted.at(-1)?.status).toBe('pass');
  });

  it('sorts findings by check id', () => {
    const state = createMockScanState();
    const sorted = sortMockFindings(state.findings, 'id');

    expect(sorted[0]?.id).toBe('BP-API-002');
  });

  it('sorts findings alphabetically by check name', () => {
    const state = createMockScanState();
    const sorted = sortMockFindings(state.findings, 'name');

    expect(sorted[0]?.title).toBe('Architectural decisions are recorded');
  });
});

describe('VS Code summary HTML', () => {
  it('renders the custom summary panel from the staged design snapshot', () => {
    const viewModel = buildMockScanViewModel({
      state: createMockScanState({
        workspaceName: 'Workspace',
        workspacePath: '/tmp/workspace'
      }),
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });
    const html = renderSummaryHtml(viewModel);

    expect(html).toContain('24 total checks scanned');
    expect(html).toContain('Target');
    expect(html).toContain('Tokens In / Out');
    expect(html).toContain('430K / 27K');
    expect(html).toContain('Duration');
    expect(html).toContain('origin/main...HEAD');
    expect(html).toContain('Scope: uncommitted changes');
    expect(html).toContain('Runtime');
    expect(html).toContain('Parallelism');
    expect(html).not.toContain('>Run Scan<');
    expect(html).not.toContain('>Load Last Scan<');
    expect(html).not.toContain('>Show Output<');
  });

  it('renders a clickable scope control when the summary is idle', () => {
    const viewModel = buildMockScanViewModel({
      state: createEmptyScanState({
        workspaceName: 'Workspace',
        workspacePath: '/tmp/workspace'
      }),
      selectedFindingId: null,
      sortMode: 'status'
    });
    const html = renderSummaryHtml(viewModel);

    expect(html).toContain('command:openshrike.runScanWithScopeOverride');
    expect(html).toContain('Scope: uncommitted changes');
  });

  it('keeps zero-complete cancelled scans out of the fully scanned copy', () => {
    const state = createScanStateFromResults({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace',
      statusKind: 'cancelled',
      statusLabel: 'Scan cancelled',
      generatedAt: new Date('2026-05-20T10:00:00.000Z'),
      durationMs: 1200,
      scopeLabel: 'full repository',
      selectionLabel: 'shared-baseline',
      runtimeMode: 'native',
      parallelism: 'auto',
      totalChecks: 25,
      checkIds: Array.from({length: 25}, (_, index) => `check-${index + 1}`),
      checks: [],
      titlesByCheckId: {},
      checkMarkdownPathsByCheckId: {},
      activeOperationLabel: 'Scan cancelled',
      outputLines: [],
      warnings: [],
      lastScanPath: '/tmp/workspace/.openshrike/last-scan.md',
      canCancel: false
    });
    const viewModel = buildMockScanViewModel({
      state,
      selectedFindingId: null,
      sortMode: 'status'
    });
    const html = renderSummaryHtml(viewModel);

    expect(html).toContain('25 total checks ready');
    expect(html).not.toContain('25 total checks scanned');
  });
});

describe('VS Code checks HTML', () => {
  it('renders a flat findings list with command links, short ids, and selection styling', () => {
    const viewModel = buildMockScanViewModel({
      state: createMockScanState({
        workspaceName: 'Workspace',
        workspacePath: '/tmp/workspace'
      }),
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });
    const html = renderChecksHtml(viewModel);

    expect(html).toContain('Checks (10)');
    expect(html).toContain('Sort: Status');
    expect(html).toContain('command:openshrike.selectFinding');
    expect(html).toContain('BP-SEC-001');
    expect(html).not.toContain('BP-SEC-001-BOUNDARY-INPUT-VALIDATION');
    expect(html).not.toContain('Status</a>');
    expect(html).not.toContain('Failed');
    expect(html).toContain('is-selected');
  });
});

describe('VS Code view model', () => {
  it('builds flat findings for multiple extension surfaces', () => {
    const state = createMockScanState({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace'
    });
    const viewModel = buildMockScanViewModel({
      state,
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });

    expect(viewModel.items.slice(0, 2).map(item => item.id)).toEqual(['BP-SEC-001', 'TS-ARCH-001']);
    expect(viewModel.items[0]?.idLabel).toBe('BP-SEC-001');
    expect(viewModel.selectedFinding?.id).toBe('BP-SEC-001');
    expect(viewModel.statusBarText).toBe('$(sync~spin) OpenShrike: 24/24');
    expect(viewModel.canCancel).toBe(false);
  });
});

describe('VS Code detail HTML', () => {
  it('renders the selected finding details and escapes unsafe content', async () => {
    const viewModel = buildMockScanViewModel({
      state: createMockScanState({
        workspaceName: '<workspace>',
        workspacePath: '/tmp/workspace'
      }),
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });
    const html = await renderFindingDetailHtml({
      viewModel
    });

    expect(html).toContain('External input is validated at trust boundaries');
    expect(html).toContain('&lt;workspace&gt;');
    expect(html).not.toContain('<workspace>');
    expect(html).toContain('>Open Check Markdown<');
    expect(html).toContain('>Open Last Scan Snapshot<');
    expect(html).toContain('>Recheck<');
    expect(html).toContain('>Auto-Fix<');
    expect(html).toContain('class="hero-head"');
    expect(html).toContain('processUserData');
    expect(html).toContain('database.users.insert');
    expect(html).toContain('openshrike.openEvidence');
    expect(html).toContain('src/api/handlers.ts:42');
    expect(html).toContain('The handler casts request data into an internal payload type before a validation schema runs.');
  });

  it('renders real source snippets for live evidence and suppresses duplicate path copy', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-evidence-'));

    try {
      const sourceFilePath = path.join(workspacePath, 'src/api/handlers.ts');
      await fs.mkdir(path.dirname(sourceFilePath), {recursive: true});
      await fs.writeFile(sourceFilePath, [
        'export async function process(req: Request) {',
        '  const payload = req.body;',
        '  return validate(payload);',
        '}'
      ].join('\n'));

      const state = createScanStateFromResults({
        workspaceName: 'Workspace',
        workspacePath,
        statusKind: 'completed',
        statusLabel: 'Scan complete',
        generatedAt: new Date('2026-05-20T10:00:00.000Z'),
        durationMs: 1200,
        scopeLabel: 'full repository',
        selectionLabel: 'shared-baseline',
        runtimeMode: 'native',
        parallelism: 'auto',
        totalChecks: 1,
        checkIds: ['bp-sec-001-boundary-input-validation'],
        checks: [
          {
            id: 'bp-sec-001-boundary-input-validation',
            version: '1',
            status: 'fail',
            confidence: 'HIGH',
            evidence: ['src/api/handlers.ts:2'],
            rationale: 'Validation is missing at the request boundary.',
            remediation: ['Validate the request before using it.']
          }
        ],
        titlesByCheckId: {
          'bp-sec-001-boundary-input-validation': 'Boundary input validation'
        },
        checkMarkdownPathsByCheckId: {
          'bp-sec-001-boundary-input-validation': path.join(
            workspacePath,
            '.openshrike/checks/bp-sec-001-boundary-input-validation.md'
          )
        },
        activeOperationLabel: 'Scan complete',
        outputLines: [],
        warnings: [],
        lastScanPath: path.join(workspacePath, '.openshrike/last-scan.md'),
        canCancel: false
      });
      const viewModel = buildMockScanViewModel({
        state,
        selectedFindingId: 'bp-sec-001-boundary-input-validation',
        sortMode: 'status'
      });
      const html = await renderFindingDetailHtml({viewModel});

      expect(html).toContain('const payload = req.body;');
      expect(html).toContain('return validate(payload);');
      expect(html).not.toContain('mock-pass');
      expect(html).toContain('src/api/handlers.ts:2');
      expect(html).not.toContain('class="evidence-copy">src/api/handlers.ts:2<');
    } finally {
      await fs.rm(workspacePath, {recursive: true, force: true});
    }
  });
});
