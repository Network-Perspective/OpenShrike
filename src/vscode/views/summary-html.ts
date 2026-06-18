import {createCommandUri} from '../command-uri.js';
import {SHRIKE_CLI_INSTALL_COMMAND} from '../init-environment-state.js';
import type {ScanViewModel} from '../scan-view-model.js';

export function renderSummaryHtml(viewModel: ScanViewModel): string {
  const {counts} = viewModel;
  const failWidth = `${toPercent(counts.fail, counts.total)}%`;
  const unknownWidth = `${toPercent(counts.unknown, counts.total)}%`;
  const passWidth = `${toPercent(counts.pass, counts.total)}%`;
  const totalLabel = counts.completed === 0
    ? `${counts.total} total checks ready`
    : `${counts.total} total checks scanned`;

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
            --surface-3: rgba(128, 128, 128, 0.06);
            --border: var(--vscode-sideBarSectionHeader-border, rgba(128, 128, 128, 0.25));
            --text-main: var(--vscode-sideBar-foreground);
            --text-muted: var(--vscode-descriptionForeground);
            --text-strong: var(--vscode-foreground);
            --text-link: var(--vscode-textLink-foreground);
            --fail: var(--vscode-problemsErrorIcon-foreground, #f14c4c);
            --unknown: var(--vscode-problemsWarningIcon-foreground, #cca700);
            --pass: var(--vscode-testing-iconPassed, #89d185);
            --activity-bg: rgba(14, 99, 156, 0.12);
            --activity-border: rgba(14, 99, 156, 0.28);
            --activity-text: var(--vscode-textLink-foreground);
            --action-hover: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.18));
            --action-border: rgba(128, 128, 128, 0.22);
            --success-action-bg: color-mix(in srgb, var(--pass) 82%, black 18%);
            --success-action-hover: color-mix(in srgb, var(--pass) 72%, black 28%);
            --success-action-foreground: #ffffff;
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

          .heading {
            display: grid;
            gap: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
          }

          .heading-main {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
          }

          .heading-title {
            display: grid;
            gap: 4px;
            min-width: 0;
          }

          .heading-title strong {
            color: var(--text-strong);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .heading-meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
          }

          .heading-status {
            color: var(--text-muted);
          }

          .scope-chip {
            display: inline-flex;
            align-items: center;
            padding: 3px 8px;
            border: 1px solid var(--action-border);
            border-radius: 999px;
            background: var(--surface-3);
            color: var(--text-main);
            text-decoration: none;
            white-space: nowrap;
          }

          .scope-chip:hover {
            background: var(--action-hover);
          }

          .scope-chip.is-static {
            color: var(--text-muted);
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

          .subcopy {
            color: var(--text-muted);
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

          .footer {
            color: var(--text-muted);
            padding-top: 10px;
            border-top: 1px solid var(--border);
          }

          .footer a {
            color: var(--text-link);
            text-decoration: none;
          }

          .footer a:hover {
            text-decoration: underline;
          }

          .warning-list {
            display: grid;
            gap: 6px;
          }

          .warning-item {
            padding: 8px 10px;
            border: 1px solid rgba(204, 167, 0, 0.28);
            background: rgba(204, 167, 0, 0.08);
            color: var(--text-main);
          }

          .setup-card {
            display: grid;
            gap: 10px;
            padding: 14px;
            border: 1px solid var(--activity-border);
            background: var(--surface-2);
          }

          .setup-title {
            color: var(--text-strong);
            font-size: 13px;
            font-weight: 600;
          }

          .setup-copy {
            color: var(--text-muted);
          }

          .setup-copy code {
            font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
            color: var(--text-strong);
          }

          .setup-status {
            color: var(--text-strong);
          }

          .setup-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .setup-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: fit-content;
            min-height: 28px;
            padding: 0 12px;
            border-radius: 6px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            text-decoration: none;
            border: 1px solid transparent;
            font-weight: 600;
          }

          .setup-action:hover {
            background: var(--vscode-button-hoverBackground);
          }

          .setup-action.is-success {
            background: var(--success-action-bg);
            color: var(--success-action-foreground);
          }

          .setup-action.is-success:hover {
            background: var(--success-action-hover);
          }

          .setup-action.is-disabled {
            background: var(--surface-3);
            color: var(--text-muted);
            border-color: var(--action-border);
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <main>
          <header class="heading">
            <div class="heading-main">
              <div class="heading-title">
                <strong>OpenShrike Scan</strong>
                <div class="heading-meta">
                  <span class="heading-status">${escapeHtml(viewModel.workspaceName)} • ${escapeHtml(viewModel.statusLabel)}</span>
                  ${renderScopeControl(viewModel)}
                </div>
              </div>
            </div>
          </header>

          ${viewModel.isInitialized ? renderScanSummary(viewModel, totalLabel, counts) : renderInitializationPrompt(viewModel)}
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

function renderScopeControl(viewModel: ScanViewModel): string {
  if (!viewModel.isInitialized) {
    return '';
  }

  const label = escapeHtml(`Scope: ${viewModel.scopeLabel}`);
  const isBusy = viewModel.statusKind === 'running' || viewModel.statusKind === 'cancelling';

  if (isBusy) {
    return `<span class="scope-chip is-static">${label}</span>`;
  }

  return `<a class="scope-chip" href="${createCommandUri('openshrike.runScanWithScopeOverride')}" title="Choose the scope for future scans">${label}</a>`;
}

function renderScanSummary(
  viewModel: ScanViewModel,
  totalLabel: string,
  counts: ScanViewModel['counts']
): string {
  return `
    <section class="metrics">
      <div class="metric-card">
        <span class="metric-label">Target</span>
        <span class="metric-value">${escapeHtml(viewModel.targetLabel)}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Tokens In / Out</span>
        <span class="metric-value">${escapeHtml(viewModel.tokensLabel)}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Duration</span>
        <span class="metric-value">${escapeHtml(viewModel.durationLabel)}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Generated</span>
        <span class="metric-value">${escapeHtml(viewModel.generatedAtLabel)}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Runtime</span>
        <span class="metric-value">${escapeHtml(viewModel.runtimeModeLabel)}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Parallelism</span>
        <span class="metric-value">${escapeHtml(viewModel.parallelismLabel)}</span>
      </div>
    </section>

    <div class="total">${escapeHtml(totalLabel)}</div>
    <div class="subcopy">Selection: ${escapeHtml(viewModel.scanTargetLabel)}</div>

    ${viewModel.warnings.length > 0 ? `<section class="warning-list">${viewModel.warnings.map(warning => `<div class="warning-item">${escapeHtml(warning)}</div>`).join('')}</section>` : ''}

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

    <div class="activity">
      <span class="activity-icon"></span>
      <span>${escapeHtml(viewModel.activeOperationLabel)}</span>
    </div>

    <div class="footer">
      Last scan snapshot: <a href="${createCommandUri('openshrike.openLastScan')}">${escapeHtml(viewModel.lastScanPath)}</a>
    </div>
  `;
}

function renderInitializationPrompt(viewModel: ScanViewModel): string {
  const hasWorkspace = viewModel.workspaceName !== 'No Workspace Open';
  if (!hasWorkspace) {
    return `
      <section class="setup-card">
        <div class="setup-title">Repository initialization required</div>
        <div class="setup-copy">Open a workspace folder before initializing OpenShrike.</div>
      </section>
    `;
  }

  const copy = buildInitializationCopy(viewModel);
  const statusLine = viewModel.initEnvironment.message;
  const actions = renderInitializationActions(viewModel);

  return `
    <section class="setup-card">
      <div class="setup-title">Repository initialization required</div>
      <div class="setup-copy">${copy}</div>
      <div class="setup-status">${escapeHtml(statusLine)}</div>
      ${actions}
    </section>
  `;
}

function buildInitializationCopy(viewModel: ScanViewModel): string {
  switch (viewModel.initEnvironment.statusKind) {
    case 'checking':
      return 'OpenShrike is checking whether Node.js 22+ and the <code>shrike</code> CLI are available on the current workspace host before enabling <code>shrike init</code>.';
    case 'ready':
      return 'OpenShrike will run <code>shrike init</code> in the integrated terminal on the current workspace host. Complete that setup flow, then click "Done" or run a scan.';
    case 'missing':
    case 'unsupported':
      return 'OpenShrike needs Node.js 22+ on the current workspace host before it can run <code>shrike init</code>.';
    case 'cli-missing':
      return `OpenShrike found Node.js 22+ on the current workspace host, but it also needs the <code>shrike</code> CLI. Install it with <code>${SHRIKE_CLI_INSTALL_COMMAND}</code>, then click "Done" and run <code>shrike init</code>.`;
    case 'error':
      return 'OpenShrike could not verify that Node.js 22+ and the <code>shrike</code> CLI are available on the current workspace host. Verify <code>node --version</code> and <code>shrike --version</code> in a terminal on the workspace host, then click "Done".';
  }
}

function renderInitializationActions(viewModel: ScanViewModel): string {
  const actions: string[] = [];

  if (viewModel.showInstallNodeAction) {
    actions.push(
      `<a class="setup-action" href="${createCommandUri('openshrike.openNodeInstallPage')}">Install Node.js</a>`
    );
  }

  if (viewModel.showInstallShrikeAction) {
    actions.push(
      `<a class="setup-action" href="${createCommandUri('openshrike.installShrikeCli', [viewModel.workspacePath])}">Install shrike CLI</a>`
    );
  }

  if (viewModel.canRunInit) {
    actions.push(
      `<a class="setup-action" href="${createCommandUri('openshrike.runInitInTerminal', [viewModel.workspacePath])}">Run shrike init</a>`
    );
  } else if (viewModel.showRefreshAction) {
    actions.push('<span class="setup-action is-disabled" aria-disabled="true">Run shrike init</span>');
  }

  if (viewModel.showRefreshAction) {
    actions.push(
      `<a class="setup-action is-success" href="${createCommandUri('openshrike.refreshInitialization', [viewModel.workspacePath])}">Done</a>`
    );
  }

  if (actions.length === 0) {
    return '';
  }

  return `
    <div class="setup-actions">
      ${actions.join('\n      ')}
    </div>
  `;
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
