import {spawn} from 'node:child_process';
import path from 'node:path';
import * as vscode from 'vscode';
import type {OpenShrikeExtensionModel} from './extension-model.js';
import {
  createCheckingInitEnvironmentState,
  createErrorInitEnvironmentState,
  createMissingInitEnvironmentState,
  createMissingShrikeInitEnvironmentState,
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

interface NodeProbeResult {
  detectedNodeVersion: string | null;
  detectedNodePath: string | null;
  missing: boolean;
  error: string | null;
}

interface CommandPathProbeResult {
  detectedPath: string | null;
  missing: boolean;
  error: string | null;
}

interface InitEnvironmentProbeDependencies {
  runShellNodeProbe?: typeof runShellNodeProbe;
  runDirectNodeProbe?: typeof runDirectNodeProbe;
  runShellCommandPathProbe?: typeof runShellCommandPathProbe;
  runDirectCommandPathProbe?: typeof runDirectCommandPathProbe;
}

const DEFAULT_REFRESH_DEBOUNCE_MS = 150;
const COMMAND_TIMEOUT_MS = 4_000;
const POSIX_PROBE_MARKER = '__OPENSHRIKE_NODE_PROBE__';
const POWERSHELL_PROBE_MARKER = '__OPENSHRIKE_NODE_PROBE__';
const CMD_PROBE_MARKER = '__OPENSHRIKE_NODE_PROBE__';
const POSIX_COMMAND_PATH_PROBE_MARKER = '__OPENSHRIKE_COMMAND_PATH_PROBE__';
const POWERSHELL_COMMAND_PATH_PROBE_MARKER = '__OPENSHRIKE_COMMAND_PATH_PROBE__';
const CMD_COMMAND_PATH_PROBE_MARKER = '__OPENSHRIKE_COMMAND_PATH_PROBE__';

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

export async function probeInitEnvironment(
  workspacePath: string,
  dependencies: InitEnvironmentProbeDependencies = {}
): Promise<InitEnvironmentState> {
  const checkedAtMs = Date.now();
  const probeNodeWithShell = dependencies.runShellNodeProbe ?? runShellNodeProbe;
  const probeNodeDirectly = dependencies.runDirectNodeProbe ?? runDirectNodeProbe;
  const probeCommandPathWithShell = dependencies.runShellCommandPathProbe ?? runShellCommandPathProbe;
  const probeCommandPathDirectly = dependencies.runDirectCommandPathProbe ?? runDirectCommandPathProbe;

  const shellNodeProbe = await probeNodeWithShell(workspacePath);
  const nodeProbe = shouldUseDirectNodeFallback(shellNodeProbe)
    ? await probeNodeDirectly(workspacePath, shellNodeProbe)
    : shellNodeProbe;

  if (nodeProbe.missing) {
    return createMissingInitEnvironmentState(checkedAtMs);
  }

  if (!nodeProbe.detectedNodeVersion || !nodeProbe.detectedNodePath) {
    return createErrorInitEnvironmentState({
      detectedNodeVersion: nodeProbe.detectedNodeVersion,
      detectedNodePath: nodeProbe.detectedNodePath,
      checkedAtMs
    });
  }

  if (!isNodeVersionSupported(nodeProbe.detectedNodeVersion)) {
    return createUnsupportedInitEnvironmentState({
      detectedNodeVersion: nodeProbe.detectedNodeVersion,
      detectedNodePath: nodeProbe.detectedNodePath,
      checkedAtMs
    });
  }

  const shellShrikeProbe = await probeCommandPathWithShell(workspacePath, 'shrike');
  const shrikeProbe = shouldUseDirectCommandFallback(shellShrikeProbe)
    ? await probeCommandPathDirectly(workspacePath, 'shrike', shellShrikeProbe)
    : shellShrikeProbe;
  if (shrikeProbe.missing) {
    return createMissingShrikeInitEnvironmentState({
      detectedNodeVersion: nodeProbe.detectedNodeVersion,
      detectedNodePath: nodeProbe.detectedNodePath,
      checkedAtMs
    });
  }

  if (!shrikeProbe.detectedPath) {
    return createErrorInitEnvironmentState({
      detectedNodeVersion: nodeProbe.detectedNodeVersion,
      detectedNodePath: nodeProbe.detectedNodePath,
      checkedAtMs
    });
  }

  return createReadyInitEnvironmentState({
    detectedNodeVersion: nodeProbe.detectedNodeVersion,
    detectedNodePath: nodeProbe.detectedNodePath,
    detectedShrikePath: shrikeProbe.detectedPath,
    checkedAtMs
  });
}

async function runShellNodeProbe(workspacePath: string): Promise<NodeProbeResult> {
  const shell = resolveProbeShell();
  if (!shell) {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: true,
      error: 'No compatible shell was resolved for the Node.js probe.'
    };
  }

  const result = await runCommand(shell.path, buildShellProbeArgs(shell), workspacePath);
  return parseShellProbeOutput(shell.kind, result);
}

async function runDirectNodeProbe(
  workspacePath: string,
  fallback: NodeProbeResult
): Promise<NodeProbeResult> {
  const pathResult = await runCommand('node', ['-p', 'process.execPath'], workspacePath);
  if (pathResult.error?.code === 'ENOENT') {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: true,
      error: fallback.error
    };
  }

  if (pathResult.timedOut) {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: false,
      error: fallback.error ?? 'The direct Node.js probe timed out.'
    };
  }

  const versionResult = await runCommand('node', ['--version'], workspacePath);
  if (versionResult.error?.code === 'ENOENT') {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: true,
      error: fallback.error
    };
  }

  if (versionResult.timedOut) {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: false,
      error: fallback.error ?? 'The direct Node.js version probe timed out.'
    };
  }

  const detectedNodePath = extractDirectNodePath(pathResult.stdout);
  const detectedNodeVersion = extractVersionLine(versionResult.stdout, 'node');
  if (!detectedNodePath || !detectedNodeVersion) {
    return {
      detectedNodeVersion,
      detectedNodePath,
      missing: false,
      error: fallback.error ?? 'The direct Node.js probe returned an incomplete result.'
    };
  }

  return {
    detectedNodeVersion,
    detectedNodePath,
    missing: false,
    error: null
  };
}

async function runShellCommandPathProbe(
  workspacePath: string,
  commandName: string
): Promise<CommandPathProbeResult> {
  const shell = resolveProbeShell();
  if (!shell) {
    return {
      detectedPath: null,
      missing: false,
      error: `No compatible shell was resolved for the ${commandName} probe.`
    };
  }

  const result = await runCommand(shell.path, buildShellCommandPathProbeArgs(shell, commandName), workspacePath);
  return parseShellCommandPathProbeOutput(shell.kind, result);
}

async function runDirectCommandPathProbe(
  workspacePath: string,
  commandName: string,
  fallback: CommandPathProbeResult
): Promise<CommandPathProbeResult> {
  const result = await runCommand(commandName, ['--version'], workspacePath);
  if (result.error?.code === 'ENOENT') {
    return {
      detectedPath: null,
      missing: true,
      error: fallback.error
    };
  }

  if (result.timedOut) {
    return {
      detectedPath: null,
      missing: false,
      error: fallback.error ?? `The direct ${commandName} probe timed out.`
    };
  }

  if (result.exitCode !== 0) {
    return {
      detectedPath: null,
      missing: false,
      error: fallback.error ?? `The direct ${commandName} probe exited with code ${result.exitCode ?? 'unknown'}.`
    };
  }

  return {
    // The shell-based path probe is preferred, but a successful direct invocation is enough
    // to know the command is runnable from PATH for the integrated terminal.
    detectedPath: commandName,
    missing: false,
    error: null
  };
}

function shouldProbeWorkspace(workspacePath?: string | null): workspacePath is string {
  return Boolean(workspacePath && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0);
}

function syncNodeBinaryEnvironment(state: InitEnvironmentState): void {
  if (state.detectedNodePath && state.detectedNodeVersion && isNodeVersionSupported(state.detectedNodeVersion)) {
    process.env.OPENSHRIKE_NODE_BINARY = state.detectedNodePath;
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

function buildShellCommandPathProbeArgs(shell: ResolvedShell, commandName: string): string[] {
  switch (shell.kind) {
    case 'cmd':
      return [
        '/d',
        '/c',
        `echo ${CMD_COMMAND_PATH_PROBE_MARKER} && where ${commandName} 2>nul`
      ];
    case 'powershell':
      return [
        '-NoProfile',
        '-Command',
        [
          `$marker='${POWERSHELL_COMMAND_PATH_PROBE_MARKER}'`,
          'Write-Output $marker',
          `$command = Get-Command ${commandName} -ErrorAction SilentlyContinue`,
          'if (-not $command) { exit 127 }',
          'Write-Output $command.Path'
        ].join('; ')
      ];
    case 'posix': {
      const shellName = path.basename(shell.path).toLowerCase();
      const command = [
        `printf '%s\\n' '${POSIX_COMMAND_PATH_PROBE_MARKER}'`,
        `command -v ${commandName}`
      ].join(' && ');
      if (shellName === 'bash' || shellName === 'zsh' || shellName === 'fish') {
        return ['-i', '-l', '-c', command];
      }

      return ['-l', '-c', command];
    }
  }
}

function parseShellProbeOutput(shellKind: ResolvedShell['kind'], result: CommandResult): NodeProbeResult {
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  if (result.error?.code === 'ENOENT') {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: true,
      error: `Shell executable not found: ${result.error.path ?? 'unknown shell'}`
    };
  }

  if (result.timedOut) {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
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

function parseShellCommandPathProbeOutput(
  shellKind: ResolvedShell['kind'],
  result: CommandResult
): CommandPathProbeResult {
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  if (result.error?.code === 'ENOENT') {
    return {
      detectedPath: null,
      missing: false,
      error: `Shell executable not found: ${result.error.path ?? 'unknown shell'}`
    };
  }

  if (result.timedOut) {
    return {
      detectedPath: null,
      missing: false,
      error: 'The shrike CLI probe timed out.'
    };
  }

  if (shellKind === 'cmd') {
    return parseMarkerCommandPathLines(combinedOutput, CMD_COMMAND_PATH_PROBE_MARKER, result);
  }

  if (shellKind === 'powershell') {
    return parseMarkerCommandPathLines(combinedOutput, POWERSHELL_COMMAND_PATH_PROBE_MARKER, result);
  }

  return parseMarkerCommandPathLines(combinedOutput, POSIX_COMMAND_PATH_PROBE_MARKER, result);
}

function parseMarkerProbeLines(output: string, marker: string, result: CommandResult): NodeProbeResult {
  const lines = output
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const markerIndex = lines.lastIndexOf(marker);
  const relevantLines = markerIndex === -1 ? lines : lines.slice(markerIndex + 1);
  const detectedNodePath = extractCommandPathLine(relevantLines, 'node');
  const detectedNodeVersion = extractVersionLine(relevantLines.join('\n'), 'node');

  if (result.exitCode === 127 || result.exitCode === 1 && !detectedNodePath && !detectedNodeVersion) {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: true,
      error: null
    };
  }

  if (!detectedNodePath && !detectedNodeVersion) {
    return {
      detectedNodeVersion: null,
      detectedNodePath: null,
      missing: false,
      error: 'The Node.js probe returned no recognizable output.'
    };
  }

  return {
    detectedNodeVersion,
    detectedNodePath,
    missing: false,
    error: result.exitCode === 0 ? null : `Node.js probe exited with code ${result.exitCode ?? 'unknown'}.`
  };
}

function parseMarkerCommandPathLines(
  output: string,
  marker: string,
  result: CommandResult
): CommandPathProbeResult {
  const lines = output
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const markerIndex = lines.lastIndexOf(marker);
  const relevantLines = markerIndex === -1 ? lines : lines.slice(markerIndex + 1);
  const detectedPath = extractCommandPathLine(relevantLines, 'shrike');

  if (result.exitCode === 127 || result.exitCode === 1 && !detectedPath) {
    return {
      detectedPath: null,
      missing: true,
      error: null
    };
  }

  if (!detectedPath) {
    return {
      detectedPath: null,
      missing: false,
      error: 'The shrike CLI probe returned no recognizable output.'
    };
  }

  return {
    detectedPath,
    missing: false,
    error: result.exitCode === 0 ? null : `The shrike CLI probe exited with code ${result.exitCode ?? 'unknown'}.`
  };
}

function shouldUseDirectNodeFallback(result: NodeProbeResult): boolean {
  return result.missing || result.error !== null || !result.detectedNodePath || !result.detectedNodeVersion;
}

function shouldUseDirectCommandFallback(result: CommandPathProbeResult): boolean {
  return result.missing || result.error !== null || !result.detectedPath;
}

function extractDirectNodePath(output: string): string | null {
  const lines = output
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  return extractCommandPathLine(lines, 'node');
}

function extractVersionLine(output: string, commandName: string): string | null {
  const lines = output
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (commandName === 'node') {
    return lines.find(line => /^v\d+(?:\.\d+){0,2}$/u.test(line)) ?? null;
  }

  return lines.find(line => /\d/u.test(line)) ?? null;
}

function extractCommandPathLine(lines: readonly string[], commandName: string): string | null {
  for (const line of lines) {
    const candidate = normalizeCommandPathCandidate(line);
    if (!candidate) {
      continue;
    }

    if (!isExpectedCommandPath(candidate, commandName)) {
      continue;
    }

    return candidate;
  }

  return null;
}

function normalizeCommandPathCandidate(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/^['"]|['"]$/gu, '');
}

function isExpectedCommandPath(candidate: string, commandName: string): boolean {
  const normalizedCommandName = commandName.toLowerCase();
  const allowedBaseNames = new Set([
    normalizedCommandName,
    `${normalizedCommandName}.exe`,
    `${normalizedCommandName}.cmd`,
    `${normalizedCommandName}.bat`,
    `${normalizedCommandName}.ps1`
  ]);
  const posixBaseName = path.posix.basename(candidate).toLowerCase();
  const winBaseName = path.win32.basename(candidate).toLowerCase();

  if (allowedBaseNames.has(posixBaseName) || allowedBaseNames.has(winBaseName)) {
    return true;
  }

  return candidate.toLowerCase() === normalizedCommandName;
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
