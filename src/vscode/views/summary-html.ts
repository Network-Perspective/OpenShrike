import type {MockScanState} from '../mock-data.js';

export function renderSummaryHtml(state: MockScanState): string {
  const {counts} = state;
  const failWidth = `${toPercent(counts.fail, counts.total)}%`;
  const unknownWidth = `${toPercent(counts.unknown, counts.total)}%`;
  const passWidth = `${toPercent(counts.pass, counts.total)}%`;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          :root {
            color-scheme: light dark;
            --surface-1: var(--vscode-sideBar-background);
            --surface-2: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.08));
            --surface-3: rgba(128, 128, 128, 0.06);
            --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.25));
            --text-main: var(--vscode-sideBar-foreground);
            --text-muted: var(--vscode-descriptionForeground);
            --text-strong: var(--vscode-foreground);
            --fail: var(--vscode-problemsErrorIcon-foreground, #f14c4c);
            --unknown: var(--vscode-problemsWarningIcon-foreground, #cca700);
            --pass: var(--vscode-testing-iconPassed, #89d185);
            --activity-bg: rgba(14, 99, 156, 0.16);
            --activity-border: rgba(14, 99, 156, 0.35);
            --activity-text: var(--vscode-textLink-foreground);
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 12px 12px 16px;
            background: var(--surface-1);
            color: var(--text-main);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            line-height: 1.45;
          }

          main {
            display: grid;
            gap: 12px;
          }

          .metrics {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px 12px;
          }

          .metric-card {
            min-width: 0;
          }

          .metric-card.is-wide {
            grid-column: 1 / -1;
          }

          .metric-label {
            display: block;
            margin-bottom: 2px;
            color: var(--text-muted);
            font-size: 11px;
          }

          .metric-value {
            display: block;
            color: var(--text-strong);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .total {
            color: var(--text-strong);
            font-size: 12px;
            letter-spacing: 0.03em;
            text-transform: uppercase;
          }

          .progress {
            display: flex;
            height: 4px;
            overflow: hidden;
            background: var(--surface-2);
            border-radius: 999px;
          }

          .progress-segment {
            height: 100%;
          }

          .progress-segment.fail {
            width: ${failWidth};
            background: var(--fail);
          }

          .progress-segment.unknown {
            width: ${unknownWidth};
            background: var(--unknown);
          }

          .progress-segment.pass {
            width: ${passWidth};
            background: var(--pass);
          }

          .status-list {
            display: grid;
            gap: 6px;
          }

          .status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--text-strong);
          }

          .status-icon {
            width: 16px;
            height: 16px;
            flex: 0 0 auto;            
          }

          .status-icon svg {
            display: block;
            width: 16px;
            height: 16px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
          }

          .status-row.fail {
            color: var(--fail);
          }

          .status-row.unknown {
            color: var(--unknown);
          }

          .status-row.pass {
            color: var(--pass);
          }

          .scope {
            padding-top: 10px;
            border-top: 1px solid var(--border);
            color: var(--text-muted);
          }

          .activity {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border: 1px solid var(--activity-border);
            background: var(--activity-bg);
            color: var(--activity-text);
          }

          .activity-icon {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: currentColor;
            flex: 0 0 auto;
          }
        </style>
      </head>
      <body>
        <main>
          <section class="metrics">
            <div class="metric-card">
              <span class="metric-label">Tokens In / Out</span>
              <span class="metric-value">${escapeHtml(state.tokensLabel)}</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">Duration</span>
              <span class="metric-value">${escapeHtml(state.durationLabel)}</span>
            </div>
          </section>

          <div class="total">${escapeHtml(String(counts.total))} total checks scanned</div>

          <div class="progress" aria-label="Scan result distribution">
            <div class="progress-segment fail"></div>
            <div class="progress-segment unknown"></div>
            <div class="progress-segment pass"></div>
          </div>

          <section class="status-list">
            ${renderStatusRow('fail', counts.fail, 'Failed')}
            ${renderStatusRow('unknown', counts.unknown, 'Inconclusive')}
            ${renderStatusRow('pass', counts.pass, 'Passed')}
          </section>

          <div class="scope">Scope: ${escapeHtml(state.scopeLabel)}</div>

          <div class="activity">
            <span class="activity-icon"></span>
            <span>${escapeHtml(state.activeOperationLabel)}</span>
          </div>
        </main>
      </body>
    </html>
  `;
}

function toPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, (value / total) * 100);
}

function renderStatusRow(status: 'fail' | 'unknown' | 'pass', count: number, label: string): string {
  return `<div class="status-row ${status}"><span class="status-icon">${renderStatusIcon(status)}</span><span>${escapeHtml(String(count))} ${escapeHtml(label)}</span></div>`;
}

function renderStatusIcon(status: 'fail' | 'unknown' | 'pass'): string {
  switch (status) {
    case 'fail':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5"></circle>
          <path d="M6.2 6.2 9.8 9.8"></path>
          <path d="M9.8 6.2 6.2 9.8"></path>
        </svg>
      `;
    case 'unknown':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.2 13.2 12H2.8L8 2.2Z"></path>
          <path d="M8 5.8V8.8"></path>
          <path d="M8 11.1H8.01"></path>
        </svg>
      `;
    case 'pass':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3.5 8.3 2.5 2.5 6-6"></path>
        </svg>
      `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
