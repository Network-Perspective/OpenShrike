import {createCommandUri} from '../command-uri.js';
import type {MockScanViewModel} from '../mock-view-model.js';

export function renderChecksHtml(viewModel: MockScanViewModel): string {
  const sectionsMarkup = viewModel.groups
    .map(group => {
      const rows = group.items.length > 0
        ? group.items.map(item => renderFindingRow(item)).join('')
        : '<div class="empty-state">No checks in this section.</div>';

      return `
        <section class="group">
          <div class="group-header">
            <span>${escapeHtml(group.label)}</span>
            <span>${escapeHtml(String(group.count))}</span>
          </div>
          ${rows}
        </section>
      `;
    })
    .join('');

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
            --surface-2: var(--vscode-sideBarSectionHeader-background, rgba(128, 128, 128, 0.08));
            --surface-3: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
            --surface-4: var(--vscode-list-activeSelectionBackground, rgba(128, 128, 128, 0.16));
            --border: var(--vscode-sideBarSectionHeader-border, rgba(128, 128, 128, 0.22));
            --text-main: var(--vscode-sideBar-foreground);
            --text-muted: var(--vscode-descriptionForeground);
            --text-strong: var(--vscode-foreground);
            --focus: var(--vscode-focusBorder);
            --link: var(--vscode-textLink-foreground);
            --fail: var(--vscode-problemsErrorIcon-foreground, #f14c4c);
            --unknown: var(--vscode-problemsWarningIcon-foreground, #cca700);
            --pass: var(--vscode-testing-iconPassed, #89d185);
            --active: var(--vscode-list-highlightForeground, #3794ff);
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: var(--surface-1);
            color: var(--text-main);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            line-height: 1.45;
          }

          main {
            display: grid;
            gap: 12px;
            padding: 0 0 12px;
          }

          .toolbar {
            position: sticky;
            top: 0;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            background: var(--surface-2);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 11px;
            font-weight: 700;
          }

          .toolbar-meta {
            color: var(--text-muted);
          }

          .sort-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .sort-link {
            display: inline-flex;
            align-items: center;
            padding: 4px 8px;
            border: 1px solid var(--border);
            color: var(--text-main);
            text-decoration: none;
            text-transform: none;
            letter-spacing: 0;
            font-weight: 400;
          }

          .sort-link.is-active {
            border-color: var(--focus);
            color: var(--text-strong);
          }

          .content {
            display: grid;
            gap: 12px;
          }

          .group {
            display: grid;
          }

          .group-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 4px 12px;
            color: var(--text-muted);
            border-top: 1px solid var(--border);
            border-bottom: 1px solid var(--border);
            background: var(--surface-2);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 11px;
            font-weight: 700;
          }

          .finding-link {
            position: relative;
            display: grid;
            grid-template-columns: 16px minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
            min-height: 30px;
            padding: 6px 12px;
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
            flex: 0 0 auto;
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

          .empty-state {
            padding: 8px 12px;
            color: var(--text-muted);
          }
        </style>
      </head>
      <body>
        <main>
          <header class="toolbar">
            <span>${escapeHtml(viewModel.checksHeading)}</span>
            <span class="toolbar-meta">Sort: ${escapeHtml(viewModel.sortLabel)}</span>
          </header>

          <section class="sort-actions" aria-label="Sort checks">
            ${renderSortLink('status', 'Status', viewModel.sortMode)}
            ${renderSortLink('id', 'ID', viewModel.sortMode)}
            ${renderSortLink('name', 'Name', viewModel.sortMode)}
          </section>

          <div class="content">
            ${sectionsMarkup}
          </div>
        </main>
      </body>
    </html>
  `;
}

function renderFindingRow(item: MockScanViewModel['groups'][number]['items'][number]): string {
  const selectedClass = item.isSelected ? ' is-selected' : '';
  const commandUri = createCommandUri('openshrike.selectFinding', [item.id]);

  return `
    <a class="finding-link status-${item.status}${selectedClass}" href="${commandUri}" title="${escapeHtml(item.summary)}">
      <span class="finding-icon" aria-hidden="true">${renderStatusIcon(item.status)}</span>
      <span class="finding-title">${escapeHtml(item.title)}</span>
      <span class="finding-id">${escapeHtml(item.id)}</span>
    </a>
  `;
}

function renderSortLink(sortMode: 'status' | 'id' | 'name', label: string, current: MockScanViewModel['sortMode']): string {
  const activeClass = sortMode === current ? ' is-active' : '';
  const commandName = sortMode === 'status'
    ? 'openshrike.sortChecksByStatus'
    : sortMode === 'id'
      ? 'openshrike.sortChecksById'
      : 'openshrike.sortChecksByName';

  return `<a class="sort-link${activeClass}" href="${createCommandUri(commandName)}">${escapeHtml(label)}</a>`;
}

function renderStatusIcon(status: MockScanViewModel['groups'][number]['status']): string {
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
