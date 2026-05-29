import {describe, expect, it} from 'vitest';
import {createEmptyScanState, createMockScanState, getDefaultSelectedFindingId, sortMockFindings} from '../src/vscode/mock-data.js';
import {buildMockScanViewModel} from '../src/vscode/mock-view-model.js';
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
});

describe('VS Code checks HTML', () => {
  it('renders grouped findings with command links and selection styling', () => {
    const viewModel = buildMockScanViewModel({
      state: createMockScanState({
        workspaceName: 'Workspace',
        workspacePath: '/tmp/workspace'
      }),
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });
    const html = renderChecksHtml(viewModel);

    expect(html).toContain('Checks (10 of 24)');
    expect(html).toContain('Failed');
    expect(html).toContain('Inconclusive');
    expect(html).toContain('Passed');
    expect(html).toContain('command:openshrike.selectFinding');
    expect(html).toContain('BP-SEC-001');
    expect(html).toContain('is-selected');
  });
});

describe('VS Code view model', () => {
  it('builds grouped findings for multiple extension surfaces', () => {
    const state = createMockScanState({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace'
    });
    const viewModel = buildMockScanViewModel({
      state,
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });

    expect(viewModel.groups[0]?.status).toBe('fail');
    expect(viewModel.groups[0]?.items.map(item => item.id)).toEqual(['BP-SEC-001', 'TS-ARCH-001']);
    expect(viewModel.groups[1]?.status).toBe('unknown');
    expect(viewModel.groups[2]?.status).toBe('pass');
    expect(viewModel.selectedFinding?.id).toBe('BP-SEC-001');
    expect(viewModel.statusBarText).toBe('$(sync~spin) OpenShrike: 10/24');
    expect(viewModel.canCancel).toBe(false);
  });
});

describe('VS Code detail HTML', () => {
  it('renders the selected finding details and escapes unsafe content', () => {
    const viewModel = buildMockScanViewModel({
      state: createMockScanState({
        workspaceName: '<workspace>',
        workspacePath: '/tmp/workspace'
      }),
      selectedFindingId: 'BP-SEC-001',
      sortMode: 'status'
    });
    const html = renderFindingDetailHtml({
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
    expect(html).toContain('mock-pass');
    expect(html).toContain('openshrike.openEvidence');
    expect(html).toContain('src/api/handlers.ts:42');
    expect(html).toContain('The handler casts request data into an internal payload type before a validation schema runs.');
  });
});
