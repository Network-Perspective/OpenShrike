import {describe, expect, it} from 'vitest';
import {createMockScanState, getDefaultSelectedFindingId, sortMockFindings} from '../src/vscode/mock-data.js';
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
    const state = createMockScanState({
      workspaceName: 'Workspace',
      workspacePath: '/tmp/workspace'
    });
    const html = renderSummaryHtml(state);

    expect(html).toContain('24 total checks scanned');
    expect(html).toContain('Tokens In / Out');
    expect(html).toContain('430K / 27K');
    expect(html).toContain('Duration');
    expect(html).toContain('Fixing bp-sec-001... (1 of 2)');
    expect(html).toContain('Scope: uncommitted changes');
    expect(html).not.toContain('>Target<');
  });
});

describe('VS Code detail HTML', () => {
  it('renders the selected finding details and escapes unsafe content', () => {
    const state = createMockScanState({
      workspaceName: '<workspace>',
      workspacePath: '/tmp/workspace'
    });
    const html = renderFindingDetailHtml({
      state,
      finding: state.findings.find(finding => finding.id === 'BP-SEC-001') ?? null
    });
    
    expect(html).toContain('External input is validated at trust boundaries');
    expect(html).toContain('&lt;workspace&gt;');
    expect(html).not.toContain('<workspace>');
    expect(html).toContain('>Edit<');
    expect(html).toContain('>Recheck<');
    expect(html).toContain('>Fix<');
    expect(html).toContain('class="hero-head"');
    expect(html).toContain('mock-pass');
    expect(html).not.toContain('Open check markdown');
    expect(html).not.toContain('Open evidence');
    expect(html).not.toContain('Open last scan snapshot');
    expect(html).not.toContain('>Target<');
    expect(html).not.toContain('>Scope<');
    expect(html).not.toContain('>Generated<');
    expect(html).toContain('src/api/handlers.ts:42');
    expect(html).not.toContain('Handler consumes req.body before validation');
    expect(html).not.toContain('The handler casts request data into an internal payload type before a validation schema runs.');
  });
});
