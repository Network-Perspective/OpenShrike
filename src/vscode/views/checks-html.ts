import {createCommandUri} from '../command-uri.js';
import type {MockScanFindingItem, MockScanViewModel} from '../mock-view-model.js';

export function renderChecksHtml(viewModel: MockScanViewModel): string {
  const rowsMarkup = viewModel.items.length > 0
    ? viewModel.items.map(item => renderFindingRow(item)).join('')
    : '<div class="empty-state">No checks available.</div>';

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
            --surface-3: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
            --surface-4: var(--vscode-list-activeSelectionBackground, rgba(128, 128, 128, 0.16));
            --text-main: var(--vscode-sideBar-foreground);
            --text-muted: var(--vscode-descriptionForeground);
            --text-strong: var(--vscode-foreground);
            --focus: var(--vscode-focusBorder);
            --fail: var(--vscode-problemsErrorIcon-foreground, #f14c4c);
            --unknown: var(--vscode-problemsWarningIcon-foreground, #cca700);
            --pass: var(--vscode-testing-iconPassed, #89d185);
            --pending: var(--vscode-descriptionForeground, #8b949e);
            --running: var(--vscode-textLink-foreground, #3794ff);
            --fixing: var(--vscode-chartsBlue, #4fc1ff);
            --active: var(--vscode-list-highlightForeground, #3794ff);
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            height: 100%;
            margin: 0;
            background: var(--surface-1);
            color: var(--text-main);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            line-height: 1.45;
            padding: 0;
          }

          main {
            width: 100%;
            min-height: 100%;
          }

          .content {
            display: grid;
            width: 100%;
            min-height: 100%;
          }

          .finding-link {
            position: relative;
            display: grid;
            grid-template-columns: 16px minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
            min-height: 32px;
            padding: 6px 12px;
            border-bottom: 1px solid rgba(128, 128, 128, 0.08);
            color: var(--text-main);
            text-decoration: none;
          }

          .finding-link:hover {
            background: var(--surface-3);
          }

          .finding-link:focus-visible {
            outline: 1px solid var(--focus);
            outline-offset: -1px;
          }

          .finding-link.is-selected {
            background: var(--surface-4);
          }

          .finding-link.is-selected::before {
            content: '';
            position: absolute;
            inset: 0 auto 0 0;
            width: 2px;
            background: var(--active);
          }

          .finding-icon {
            width: 14px;
            height: 14px;
            color: currentColor;
          }

          .finding-icon svg {
            display: block;
            width: 14px;
            height: 14px;
            stroke: currentColor;
            fill: none;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
          }

          .finding-icon svg.is-spinning {
            animation: spin 1s linear infinite;
            transform-origin: center;
          }

          .finding-title {
            overflow: hidden;
            color: var(--text-strong);
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .finding-id {
            color: var(--text-muted);
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
          }

          .status-fail {
            color: var(--fail);
          }

          .status-unknown {
            color: var(--unknown);
          }

          .status-pass {
            color: var(--pass);
          }

          .status-pending {
            color: var(--pending);
          }

          .status-running {
            color: var(--running);
          }

          .status-fixing {
            color: var(--fixing);
          }

          .empty-state {
            padding: 10px 12px;
            color: var(--text-muted);
          }

          @keyframes spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        </style>
      </head>
      <body>
        <main>
          <div class="content">
            ${rowsMarkup}
          </div>
        </main>
      </body>
    </html>
  `;
}

function renderFindingRow(item: MockScanFindingItem): string {
  const selectedClass = item.isSelected ? ' is-selected' : '';
  const commandUri = createCommandUri('openshrike.selectFinding', [item.id]);

  return `
    <a class="finding-link status-${item.status}${selectedClass}" href="${commandUri}" title="${escapeHtml(item.summary)}">
      <span class="finding-icon" aria-hidden="true">${renderStatusIcon(item.status)}</span>
      <span class="finding-title">${escapeHtml(item.title)}</span>
      <span class="finding-id">${escapeHtml(item.idLabel)}</span>
    </a>
  `;
}

function renderStatusIcon(status: MockScanFindingItem['status']): string {
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
    case 'pending':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3.5" y="3.5" width="9" height="9" rx="2"></rect>
        </svg>
      `;
    case 'running':
      return `
        <svg class="is-spinning" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.2a5.8 5.8 0 1 0 4.1 1.7"></path>
        </svg>
      `;
    case 'fixing':
      return `
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.9 3a2.9 2.9 0 0 0 3.1 4l-5 5a1.4 1.4 0 0 1-2 0l-.7-.7a1.4 1.4 0 0 1 0-2l5-5A2.9 2.9 0 0 0 9.9 3Z"></path>
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
