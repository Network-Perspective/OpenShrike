import {spawn} from 'node:child_process';
import path from 'node:path';
import * as vscode from 'vscode';
import type {OpenShrikeExtensionModel} from './extension-model.js';
import {
  createCheckingInitEnvironmentState,
  createErrorInitEnvironmentState,
  createMissingInitEnvironmentState,
  createReadyInitEnvironmentState,
  createUnsupportedInitEnvironmentState,
  isNodeVersionSupported,
  type InitEnvironmentState
} from './init-environment-state.js';

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: NodeJS.ErrnoException | null;
}

interface ResolvedShell {
  kind: 'posix' | 'powershell' | 'cmd';
  path: string;
}

interface ProbeResult {
  detectedVersion: string | null;
  detectedPath: string | null;
  missing: boolean;
  error: string | null;
}

const DEFAULT_REFRESH_DEBOUNCE_MS = 150;
const COMMAND_TIMEOUT_MS = 4_000;
const POSIX_PROBE_MARKER = '__OPENSHRIKE_NODE_PROBE__';
const POWERSHELL_PROBE_MARKER = '__OPENSHRIKE_NODE_PROBE__';
const CMD_PROBE_MARKER = '__OPENSHRIKE_NODE_PROBE__';

export class OpenShrikeInitEnvironmentMonitor implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private refreshChain: Promise<InitEnvironmentState>;
  private latestRequestedRevision = 0;
  private summaryVisible = false;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly model: OpenShrikeExtensionModel,
    private readonly options: {
      probeEnvironment?: typeof probeInitEnvironment;
      debounceMs?: number;
    } = {}
  ) {
    this.refreshChain = Promise.resolve(this.model.getState().initEnvironment);
    this.subscriptions.push(vscode.window.onDidChangeWindowState(state => {
      if (!state.focused || !this.summaryVisible) {
        return;
      }

      this.scheduleRefresh(this.model.getState().workspacePath);
    }));
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  notifySummaryViewResolved(isVisible: boolean): void {
    this.summaryVisible = isVisible;
    void this.refresh(this.model.getState().workspacePath, {
      announceChecking: this.model.getState().initEnvironment.checkedAtMs === null
    });
  }

  notifySummaryVisibilityChanged(isVisible: boolean): void {
    const becameVisible = isVisible && !this.summaryVisible;
    this.summaryVisible = isVisible;

    if (!becameVisible) {
      return;
    }

    this.scheduleRefresh(this.model.getState().workspacePath, {
      announceChecking: this.model.getState().initEnvironment.checkedAtMs === null
    });
  }

  scheduleRefresh(
    workspacePath?: string | null,
    options: {
      announceChecking?: boolean;
      delayMs?: number;
    } = {}
  ): void {
    if (!shouldProbeWorkspace(workspacePath)) {
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh(workspacePath, {
        announceChecking: options.announceChecking ?? false
      });
    }, options.delayMs ?? this.options.debounceMs ?? DEFAULT_REFRESH_DEBOUNCE_MS);
  }

  async refresh(
    workspacePath?: string | null,
    options: {
      announceChecking?: boolean;
    } = {}
  ): Promise<InitEnvironmentState> {
    if (!shouldProbeWorkspace(workspacePath)) {
      return this.model.getState().initEnvironment;
    }

    if (options.announceChecking) {
      this.model.setInitEnvironment(createCheckingInitEnvironmentState());
    }

    const revision = ++this.latestRequestedRevision;
    const probeEnvironment = this.options.probeEnvironment ?? probeInitEnvironment;
    const refreshPromise = this.refreshChain.then(async () => {
      const result = await probeEnvironment(workspacePath);
      if (revision === this.latestRequestedRevision) {
        syncNodeBinaryEnvironment(result);
        this.model.setInitEnvironment(result);
      }

      return result;
    });

    this.refreshChain = refreshPromise.catch(() => this.model.getState().initEnvironment);
    return await refreshPromise;
  }
}

export async function probeInitEnvironment(workspacePath: string): Promise<InitEnvironmentState> {
  const checkedAtMs = Date.now();
  const shellProbe = await runShellProbe(workspacePath);
  const probeResult = shellProbe.missing || shellProbe.error
    ? await runDirectNodeProbe(workspacePath, shellProbe)
    : shellProbe;

  if (probeResult.missing) {
    return createMissingInitEnvironmentState(checkedAtMs);
  }

  if (!probeResult.detectedVersion || !probeResult.detectedPath) {
    return createErrorInitEnvironmentState({
      detectedVersion: probeResult.detectedVersion,
      detectedPath: probeResult.detectedPath,
      checkedAtMs
    });
  }

  if (!isNodeVersionSupported(probeResult.detectedVersion)) {
    return createUnsupportedInitEnvironmentState({
      detectedVersion: probeResult.detectedVersion,
      detectedPath: probeResult.detectedPath,
      checkedAtMs
    });
  }

  return createReadyInitEnvironmentState({
    detectedVersion: probeResult.detectedVersion,
    detectedPath: probeResult.detectedPath,
    checkedAtMs
  });
}

async function runShellProbe(workspacePath: string): Promise<ProbeResult> {
  const shell = resolveProbeShell();
  if (!shell) {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: true,
      error: 'No compatible shell was resolved for the Node.js probe.'
    };
  }

  const result = await runCommand(shell.path, buildShellProbeArgs(shell), workspacePath);
  return parseShellProbeOutput(shell.kind, result);
}

async function runDirectNodeProbe(workspacePath: string, fallback: ProbeResult): Promise<ProbeResult> {
  const pathResult = await runCommand('node', ['-p', 'process.execPath'], workspacePath);
  if (pathResult.error?.code === 'ENOENT') {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: true,
      error: fallback.error
    };
  }

  const versionResult = await runCommand('node', ['--version'], workspacePath);
  if (versionResult.error?.code === 'ENOENT') {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: true,
      error: fallback.error
    };
  }

  const detectedPath = pathResult.stdout.trim() || null;
  const detectedVersion = versionResult.stdout.trim() || null;
  if (!detectedPath || !detectedVersion) {
    return {
      detectedVersion,
      detectedPath,
      missing: false,
      error: fallback.error ?? 'The direct Node.js probe returned an incomplete result.'
    };
  }

  return {
    detectedVersion,
    detectedPath,
    missing: false,
    error: null
  };
}

function shouldProbeWorkspace(workspacePath?: string | null): workspacePath is string {
  return Boolean(workspacePath && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0);
}

function syncNodeBinaryEnvironment(state: InitEnvironmentState): void {
  if (state.statusKind === 'ready' && state.detectedPath) {
    process.env.OPENSHRIKE_NODE_BINARY = state.detectedPath;
    return;
  }

  delete process.env.OPENSHRIKE_NODE_BINARY;
}

function resolveProbeShell(): ResolvedShell | null {
  const platformKey = getPlatformKey();
  const configuration = vscode.workspace.getConfiguration('terminal.integrated');
  const defaultProfileName = configuration.get<string>(`defaultProfile.${platformKey}`);
  const configuredProfiles = configuration.get<Record<string, unknown>>(`profiles.${platformKey}`);

  if (defaultProfileName && configuredProfiles && typeof configuredProfiles === 'object') {
    const profile = configuredProfiles[defaultProfileName];
    const resolvedProfileShell = resolveShellFromProfile(profile);
    if (resolvedProfileShell) {
      return resolvedProfileShell;
    }
  }

  const legacyShell = configuration.get<string>(`shell.${platformKey}`);
  if (legacyShell) {
    return classifyShellPath(legacyShell);
  }

  if (process.platform === 'win32') {
    return classifyShellPath(process.env.ComSpec || 'cmd.exe');
  }

  return classifyShellPath(process.env.SHELL || '/bin/sh');
}

function resolveShellFromProfile(profile: unknown): ResolvedShell | null {
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const profilePath = (profile as {path?: unknown}).path;
  if (typeof profilePath === 'string') {
    return classifyShellPath(profilePath);
  }

  if (Array.isArray(profilePath) && typeof profilePath[0] === 'string') {
    return classifyShellPath(profilePath[0]);
  }

  if (process.platform !== 'win32') {
    return null;
  }

  const source = (profile as {source?: unknown}).source;
  if (source === 'PowerShell') {
    return {
      kind: 'powershell',
      path: 'powershell.exe'
    };
  }

  if (source === 'Command Prompt') {
    return {
      kind: 'cmd',
      path: 'cmd.exe'
    };
  }

  if (source === 'Git Bash') {
    return {
      kind: 'posix',
      path: 'bash.exe'
    };
  }

  return null;
}

function classifyShellPath(shellPath: string): ResolvedShell {
  const shellName = path.basename(shellPath).toLowerCase();
  if (shellName === 'cmd.exe' || shellName === 'cmd') {
    return {
      kind: 'cmd',
      path: shellPath
    };
  }

  if (shellName.includes('powershell') || shellName === 'pwsh' || shellName === 'pwsh.exe') {
    return {
      kind: 'powershell',
      path: shellPath
    };
  }

  return {
    kind: 'posix',
    path: shellPath
  };
}

function buildShellProbeArgs(shell: ResolvedShell): string[] {
  switch (shell.kind) {
    case 'cmd':
      return [
        '/d',
        '/c',
        `echo ${CMD_PROBE_MARKER} && where node 2>nul && node --version`
      ];
    case 'powershell':
      return [
        '-NoProfile',
        '-Command',
        [
          `$marker='${POWERSHELL_PROBE_MARKER}'`,
          'Write-Output $marker',
          '$command = Get-Command node -ErrorAction SilentlyContinue',
          'if (-not $command) { exit 127 }',
          'Write-Output $command.Path',
          'Write-Output (& $command.Path --version)'
        ].join('; ')
      ];
    case 'posix': {
      const shellName = path.basename(shell.path).toLowerCase();
      if (shellName === 'bash' || shellName === 'zsh' || shellName === 'fish') {
        return ['-i', '-l', '-c', buildPosixProbeCommand()];
      }

      return ['-l', '-c', buildPosixProbeCommand()];
    }
  }
}

function buildPosixProbeCommand(): string {
  return [
    `printf '%s\\n' '${POSIX_PROBE_MARKER}'`,
    'command -v node',
    'node --version'
  ].join(' && ');
}

function parseShellProbeOutput(shellKind: ResolvedShell['kind'], result: CommandResult): ProbeResult {
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  if (result.error?.code === 'ENOENT') {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: true,
      error: `Shell executable not found: ${result.error.path ?? 'unknown shell'}`
    };
  }

  if (result.timedOut) {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: false,
      error: 'The Node.js probe timed out.'
    };
  }

  if (shellKind === 'cmd') {
    return parseMarkerProbeLines(combinedOutput, CMD_PROBE_MARKER, result);
  }

  if (shellKind === 'powershell') {
    return parseMarkerProbeLines(combinedOutput, POWERSHELL_PROBE_MARKER, result);
  }

  return parseMarkerProbeLines(combinedOutput, POSIX_PROBE_MARKER, result);
}

function parseMarkerProbeLines(output: string, marker: string, result: CommandResult): ProbeResult {
  const lines = output
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const markerIndex = lines.lastIndexOf(marker);
  const relevantLines = markerIndex === -1 ? lines : lines.slice(markerIndex + 1);
  const detectedPath = relevantLines[0] ?? null;
  const detectedVersion = relevantLines.find(line => /^v\d+(?:\.\d+){0,2}$/u.test(line)) ?? null;

  if (result.exitCode === 127 || result.exitCode === 1 && !detectedPath && !detectedVersion) {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: true,
      error: null
    };
  }

  if (!detectedPath && !detectedVersion) {
    return {
      detectedVersion: null,
      detectedPath: null,
      missing: false,
      error: 'The Node.js probe returned no recognizable output.'
    };
  }

  return {
    detectedVersion,
    detectedPath,
    missing: false,
    error: result.exitCode === 0 ? null : `Node.js probe exited with code ${result.exitCode ?? 'unknown'}.`
  };
}

async function runCommand(
  executable: string,
  args: string[],
  cwd: string
): Promise<CommandResult> {
  return await new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      resolve({
        exitCode: null,
        stdout,
        stderr,
        timedOut: true,
        error: null
      });
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', error => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode: null,
        stdout,
        stderr,
        timedOut: false,
        error
      });
    });
    child.on('close', exitCode => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut: false,
        error: null
      });
    });
  });
}

function getPlatformKey(): 'linux' | 'osx' | 'windows' {
  switch (process.platform) {
    case 'darwin':
      return 'osx';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}
