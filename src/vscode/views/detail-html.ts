import {formatConfidence, getStatusLabel, type MockFinding, type MockScanState} from '../mock-data.js';

export function renderFindingDetailHtml(input: {
  finding: MockFinding | null;
  state: MockScanState;
}): string {
  const {finding, state} = input;

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

  const evidenceMarkup = finding.evidence
    .map(evidence => renderEvidenceCard(evidence))
    .join('');
  const remediationMarkup = finding.remediation
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const actionButtons = [
    {label: 'Edit', command: 'openshrike.editFinding', kind: 'secondary'},
    {label: 'Recheck', command: 'openshrike.recheckFinding', kind: 'secondary'},
    {label: 'Fix', command: 'openshrike.fixFinding', kind: 'primary'}
  ]
    .map(action => `<a class="button button-${action.kind}" href="command:${action.command}">${escapeHtml(action.label)}</a>`)
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
            --status-pass: #89d185;
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
            padding: 28px 32px 56px;
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

          .note {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 22px;
            padding: 10px 12px;
            border: 1px solid var(--soft-border);
            background: var(--surface-3);
            color: var(--text-muted);
          }

          .note strong {
            color: var(--text-main);
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
            gap: 12px;
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

          .status-fail {
            border-color: rgba(241, 76, 76, 0.42);
            color: var(--status-fail);
          }

          .status-unknown {
            border-color: rgba(204, 167, 0, 0.42);
            color: var(--status-unknown);
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

          .evidence-card {
            border: 1px solid var(--panel-border);
            background: var(--surface-2);
          }

          .evidence-header {
            padding: 10px 12px;
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
          <header class="hero">
            <div class="hero-head">
              <div class="title-block">
                <div class="meta-row">
                  <span class="pill ${statusClass}">${escapeHtml(getStatusLabel(finding.status))}</span>
                  <span class="pill">ID: ${escapeHtml(finding.id)}</span>
                  <span class="pill">Confidence: ${escapeHtml(formatConfidence(finding.confidence))}</span>
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
            <ol class="remediation-list">
              ${remediationMarkup}
            </ol>
          </section>

          <section>
            <span class="section-label">Evidence</span>
            <div class="evidence-list">
              ${evidenceMarkup}
            </div>
          </section>

          <p class="footer">
            OpenShrike mock workspace: ${escapeHtml(state.workspaceName)}. Counts reflect the staged design snapshot: ${escapeHtml(String(state.counts.pass))} passed, ${escapeHtml(String(state.counts.fail))} failed, ${escapeHtml(String(state.counts.unknown))} inconclusive.
          </p>
        </main>
      </body>
    </html>
  `;
}

function renderEvidenceCard(evidence: MockFinding['evidence'][number]): string {
  const pathLabel = evidence.location ?? evidence.raw;
  const pathMarkup = `<a class="evidence-path" href="command:openshrike.openEvidence">${escapeHtml(pathLabel)}</a>`;
  const snippetMarkup = renderSnippet(evidence.codeSnippet ?? createFallbackSnippet(evidence));

  return `
    <article class="evidence-card">
      <div class="evidence-header">
        ${pathMarkup}
      </div>
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

function createFallbackSnippet(evidence: MockFinding['evidence'][number]): NonNullable<MockFinding['evidence'][number]['codeSnippet']> {
  return {
    path: evidence.location ?? evidence.raw,
    language: 'typescript',
    lineStart: 1,
    lines: [
      'const issue = inspectBoundaryInput(payload);',
      "if (!issue) return { status: 'mock-pass' };",
      `return { evidence: '${sanitizeForSnippet(evidence.raw)}' };`
    ]
  };
}

function sanitizeForSnippet(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
