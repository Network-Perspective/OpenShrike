import {loadEvidencePreview} from '../../lib/evidence.js';
import {createCommandUri} from '../command-uri.js';
import type {MockFinding} from '../mock-data.js';
import type {MockScanViewModel} from '../mock-view-model.js';

export async function renderFindingDetailHtml(input: {
  viewModel: MockScanViewModel;
}): Promise<string> {
  const {viewModel} = input;
  const finding = viewModel.selectedFinding;

  if (!finding) {
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<body>',
      '<p>No finding selected.</p>',
      '</body>',
      '</html>'
    ].join('');
  }

  const evidenceMarkup = finding.evidence.length > 0
    ? (await Promise.all(
        finding.evidence.map(evidence => renderEvidenceCard(evidence, viewModel.workspacePath))
      )).join('')
    : `<p class="empty-copy">${escapeHtml(
        finding.confidenceLabel
          ? 'No evidence provided.'
          : 'No evidence available until the check completes.'
      )}</p>`;
  const remediationMarkup = finding.remediation.length > 0
    ? finding.remediation
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('')
    : `<li>${escapeHtml(
        finding.confidenceLabel
          ? 'No remediation provided.'
          : 'No remediation available until the check completes.'
      )}</li>`;
  const actionButtons = [
    {label: 'Open Check Markdown', command: 'openshrike.openCheckMarkdown', kind: 'secondary'},
    {label: 'Open Last Scan Snapshot', command: 'openshrike.openLastScan', kind: 'secondary'},
    {label: 'Recheck', command: 'openshrike.recheckFinding', kind: 'secondary'},
    {label: 'Auto-Fix', command: 'openshrike.fixFinding', kind: 'primary'}
  ]
    .map(action => `<a class="button button-${action.kind}" href="${createCommandUri(action.command)}">${escapeHtml(action.label)}</a>`)
    .join('');
  const statusClass = `status-${finding.status}`;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          :root {
            color-scheme: light dark;
            --panel-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.35));
            --soft-border: rgba(128, 128, 128, 0.18);
            --surface-1: var(--vscode-editor-background);
            --surface-2: var(--vscode-sideBar-background);
            --surface-3: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.08));
            --text-main: var(--vscode-editor-foreground);
            --text-muted: var(--vscode-descriptionForeground);
            --text-link: var(--vscode-textLink-foreground);
            --status-fail: #f14c4c;
            --status-unknown: #cca700;
            --status-pending: var(--vscode-descriptionForeground, #8b949e);
            --status-running: var(--vscode-textLink-foreground, #3794ff);
            --status-fixing: var(--vscode-chartsBlue, #4fc1ff);
            --status-pass: #89d185;
            --active: var(--vscode-list-highlightForeground, #3794ff);
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            color: var(--text-main);
            background: var(--surface-1);
            font-family: var(--vscode-font-family);
            line-height: 1.55;
          }

          main {
            max-width: 980px;
            margin: 0 auto;
            padding: 24px 28px 56px;
          }

          h1,
          h2,
          h3,
          p,
          ul,
          li {
            margin: 0;
          }

          h1 {
            font-size: 18px;
            font-weight: 600;
            line-height: 1.35;
          }

          .hero {
            display: grid;
            gap: 12px;
          }

          .hero-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;            
          }

          .title-block {
            display: grid;
            gap: 10px;
            flex: 1 1 auto;
            min-width: 0;
          }

          .meta-row,
          .button-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .button-row {
            justify-content: flex-end;
            align-self: flex-start;
            flex: 0 0 auto;
          }

          .pill {
            display: inline-flex;
            align-items: center;
            border: 1px solid var(--soft-border);
            background: var(--surface-3);
            color: var(--text-main);
            padding: 4px 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
          }

          .pill.is-selected {
            border-color: rgba(55, 148, 255, 0.45);
            color: var(--active);
          }

          .status-fail {
            border-color: rgba(241, 76, 76, 0.42);
            color: var(--status-fail);
          }

          .status-unknown {
            border-color: rgba(204, 167, 0, 0.42);
            color: var(--status-unknown);
          }

          .status-pending {
            border-color: rgba(128, 128, 128, 0.32);
            color: var(--status-pending);
          }

          .status-running {
            border-color: rgba(55, 148, 255, 0.35);
            color: var(--status-running);
          }

          .status-fixing {
            border-color: rgba(79, 193, 255, 0.35);
            color: var(--status-fixing);
          }

          .status-pass {
            border-color: rgba(137, 209, 133, 0.42);
            color: var(--status-pass);
          }

          .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 84px;
            padding: 7px 14px;
            border: 1px solid var(--soft-border);
            background: var(--surface-3);
            color: var(--text-main);
            text-decoration: none;
            font-size: 12px;
          }

          .button:hover {
            border-color: var(--panel-border);
            background: rgba(128, 128, 128, 0.12);
          }

          .button:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
          }

          .button-primary {
            background: var(--vscode-button-background);
            border-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }

          .button-primary:hover {
            background: var(--vscode-button-hoverBackground);
            border-color: var(--vscode-button-hoverBackground);
          }

          section {
            margin-top: 24px;
            padding-top: 18px;
            border-top: 1px solid var(--panel-border);
          }

          .section-label {
            display: block;
            margin-bottom: 12px;
            color: var(--text-muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .section-copy {
            max-width: 920px;
          }

          .remediation-list {
            padding-left: 18px;
          }

          .remediation-list li + li {
            margin-top: 8px;
          }

          .evidence-list {
            display: grid;
            gap: 16px;
          }

          .empty-copy {
            color: var(--text-muted);
          }

          .evidence-card {
            border: 1px solid var(--panel-border);
            background: var(--surface-2);
          }

          .evidence-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 12px;
          }

          .evidence-copy {
            padding: 0 12px 12px;
            color: var(--text-muted);
          }

          .evidence-path {
            color: var(--text-link);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            text-decoration: none;
          }

          .evidence-path:hover {
            text-decoration: underline;
          }

          .evidence-path-static {
            color: var(--text-main);
          }

          .snippet {
            overflow-x: auto;
            border-top: 1px solid var(--soft-border);
            background: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.08));
          }

          .snippet table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
          }

          .snippet tr.is-highlighted {
            background: rgba(241, 76, 76, 0.16);
          }

          .gutter {
            width: 54px;
            padding: 0 12px;
            text-align: right;
            color: var(--text-muted);
            vertical-align: top;
            user-select: none;
            border-right: 1px solid var(--soft-border);
          }

          .code {
            padding: 0 12px;
            white-space: pre;
          }

          .footer {
            margin-top: 24px;
            color: var(--text-muted);
            font-size: 12px;
          }

          .breadcrumbs {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 18px;
            color: var(--text-muted);
            font-size: 12px;
          }

          .breadcrumbs strong {
            color: var(--text-main);
          }

          @media (max-width: 760px) {
            main {
              padding: 18px 20px 40px;
            }

            .hero-head {
              flex-direction: column;
            }

            .button-row {
              justify-content: flex-start;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <div class="breadcrumbs">
            <span>OpenShrike</span>
            <span>/</span>
            <span>Scans</span>
            <span>/</span>
            <strong>${escapeHtml(finding.idLabel)} Details</strong>
          </div>

          <header class="hero">
            <div class="hero-head">
              <div class="title-block">
                <div class="meta-row">
                  <span class="pill ${statusClass}">${escapeHtml(finding.statusLabel)}</span>
                  <span class="pill">ID: ${escapeHtml(finding.idLabel)}</span>
                  ${finding.confidenceLabel ? `<span class="pill">Confidence: ${escapeHtml(finding.confidenceLabel)}</span>` : ''}
                  <span class="pill is-selected">Workspace: ${escapeHtml(viewModel.workspaceName)}</span>
                </div>
                <h1>${escapeHtml(finding.title)}</h1>
                <p class="section-copy">${escapeHtml(finding.summary)}</p>
              </div>
              <div class="button-row">${actionButtons}</div>
            </div>
          </header>

          <section>
            <span class="section-label">Why It Matters</span>
            <p class="section-copy">${escapeHtml(finding.rationale)}</p>
          </section>

          <section>
            <span class="section-label">Remediation</span>
            <ul class="remediation-list">
              ${remediationMarkup}
            </ul>
          </section>

          <section>
            <span class="section-label">Evidence</span>
            <div class="evidence-list">
              ${evidenceMarkup}
            </div>
          </section>

          <p class="footer">
            OpenShrike workspace: ${escapeHtml(viewModel.workspaceName)}. Current totals: ${escapeHtml(String(viewModel.counts.pass))} passed, ${escapeHtml(String(viewModel.counts.fail))} failed, ${escapeHtml(String(viewModel.counts.unknown))} inconclusive.
          </p>
        </main>
      </body>
    </html>
  `;
}

async function renderEvidenceCard(
  evidence: MockFinding['evidence'][number],
  workspacePath: string
): Promise<string> {
  const preview = await loadEvidencePreview(evidence.location ?? evidence.raw, workspacePath);
  const reference = evidence.location ?? evidence.raw;
  const pathMarkup = preview.location
    ? `<a class="evidence-path" href="${createCommandUri('openshrike.openEvidence', [reference])}">${escapeHtml(preview.displayLabel)}</a>`
    : `<span class="evidence-path evidence-path-static">${escapeHtml(preview.displayLabel)}</span>`;
  const snippetMarkup = renderSnippet(createSnippetFromPreview(preview) ?? evidence.codeSnippet);
  const evidenceCopy = renderEvidenceCopy(evidence, preview.displayLabel);

  return `
    <article class="evidence-card">
      <div class="evidence-header">
        ${pathMarkup}
      </div>
      ${evidenceCopy}
      ${snippetMarkup}
    </article>
  `;
}

function renderSnippet(snippet: MockFinding['evidence'][number]['codeSnippet']): string {
  if (!snippet) {
    return '';
  }

  const rows = snippet.lines
    .map((line, index) => {
      const lineNumber = snippet.lineStart + index;
      const highlightedClass = lineNumber === snippet.highlightedLine ? 'is-highlighted' : '';

      return `
        <tr class="${highlightedClass}">
          <td class="gutter">${lineNumber}</td>
          <td class="code">${escapeHtml(line)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="snippet">
      <table>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function createSnippetFromPreview(
  preview: Awaited<ReturnType<typeof loadEvidencePreview>>
): NonNullable<MockFinding['evidence'][number]['codeSnippet']> | undefined {
  if (!preview.location || !preview.lines || preview.lines.length === 0) {
    return undefined;
  }

  const [firstLine] = preview.lines;
  if (!firstLine) {
    return undefined;
  }

  return {
    path: preview.location.filePath,
    language: 'text',
    lineStart: firstLine.number,
    highlightedLine: preview.location.startLine,
    lines: preview.lines.map(line => line.text)
  };
}

function renderEvidenceCopy(evidence: MockFinding['evidence'][number], pathLabel: string): string {
  const excerpt = evidence.excerpt.trim();
  if (!excerpt) {
    return '';
  }

  const raw = evidence.raw.trim();
  const location = evidence.location?.trim() ?? '';
  if (excerpt === raw || excerpt === location || excerpt === pathLabel) {
    return '';
  }

  return `<div class="evidence-copy">${escapeHtml(excerpt)}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
