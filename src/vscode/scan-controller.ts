import fs from 'node:fs/promises';
import {fixAndRecheckCheck, recheckSingleCheck, updateReportCheck} from '../lib/fix.js';
import {
  getProjectChecksDirectory,
  readCheckTitle,
  resolveCheckDefinitionPath,
  resolveProjectCheckSelection
} from '../lib/checks.js';
import {loadLastScanState, resolveLastScanPaths, saveLastScanState} from '../lib/last-scan.js';
import {loadProjectConfigForRepo, resolveProjectConfigRelativePath, writeProjectConfig} from '../lib/project-config.js';
import {resolvePolicyDefinition} from '../lib/policies.js';
import {createRuntimeStreamState, reduceRuntimeEvent, type RuntimeStreamState} from '../lib/runtime-events.js';
import {resolveScanOptions} from '../lib/scan-options.js';
import {createNativeScanSession, runScan, type NativeScanSession, type ScanSessionSnapshot} from '../lib/scan.js';
import type {CheckResult, ParallelismValue, RuntimeMode, SavedScanRequest, SavedScanScope, ScanCommandOptions, ScanReport, ScanRuntimeEvent} from '../lib/types.js';
import {createEmptyScanState, type MockScanStatusKind} from './mock-data.js';
import type {MockExtensionModel} from './mock-model.js';
import {
  resolvePersistedScopeLabel,
  resolveScopeSelectionLabel,
  resolveWorkspaceScanDefaults,
  type ScopeSelection
} from './scan-defaults.js';
import {createScanStateFromResults, formatSelectionLabel} from './scan-state.js';
import type {WorkspaceTarget} from './workspace-target.js';

interface ScanContext {
  workspace: WorkspaceTarget;
  request: SavedScanRequest | null;
  scope: SavedScanScope | null;
  report: ScanReport | null;
}

interface ActiveRun {
  id: number;
  kind: 'native' | 'docker';
  cancelRequested: boolean;
  startedAtMs: number;
  session?: NativeScanSession;
  abortController?: AbortController;
}

interface TokenUsageState {
  byMessageId: Record<string, {input: number; output: number}>;
  input: number;
  output: number;
}

const ACTIVE_RUN_RENDER_INTERVAL_MS = 100;

export class OpenShrikeScanController {
  private context: ScanContext | null = null;
  private activeRun: ActiveRun | null = null;
  private reusableNativeSession: NativeScanSession | null = null;
  private statusKind: MockScanStatusKind = 'idle';
  private statusLabel = 'Ready to scan';
  private activeOperationLabel = 'Run OpenShrike: Run Scan or Load Last Scan.';
  private generatedAt: Date | null = null;
  private completedAtMs: number | null = null;
  private lastDurationMs: number | null = null;
  private lastScanPath = '.openshrike/last-scan.md';
  private scopeLabel = 'uncommitted changes';
  private scopeSelection: ScopeSelection = {
    scanScope: 'uncommitted',
    scanTarget: null
  };
  private runtimeMode: RuntimeMode | null = null;
  private parallelism: ParallelismValue | null = null;
  private outputLines: string[] = [];
  private warnings: string[] = [];
  private checkOrder: string[] = [];
  private readonly runningCheckIds = new Set<string>();
  private fixingCheckId: string | null = null;
  private readonly resultsByCheckId = new Map<string, CheckResult>();
  private readonly titleCache = new Map<string, string>();
  private readonly checkMarkdownPathCache = new Map<string, string>();
  private readonly runtimeStreams = new Map<string, RuntimeStreamState>();
  private readonly sessionScopeSelections = new Map<string, ScopeSelection>();
  private activeRunRenderTimer: NodeJS.Timeout | null = null;
  private nextRunId = 1;
  private tokenUsage: TokenUsageState | null = null;

  constructor(private readonly model: MockExtensionModel) {
    this.outputLines = [...this.model.getState().outputLines];
  }

  async initialize(workspace: WorkspaceTarget): Promise<void> {
    this.context = {
      workspace,
      request: null,
      scope: null,
      report: null
    };
    await this.restoreWorkspaceDefaults(workspace);
    this.lastScanPath = await this.resolveLastScanPath(workspace.path);
    await this.primeConfiguredCheckSelection(workspace);
    this.renderState();
  }

  async loadLastScan(workspace: WorkspaceTarget, options: {silentMissing?: boolean} = {}): Promise<void> {
    await this.resetForWorkspace(workspace, 'Loading last scan');

    try {
      const loaded = await loadLastScanState(workspace.path);
      this.context = {
        workspace,
        request: loaded.state.request,
        scope: loaded.state.scope ?? null,
        report: loaded.state.report
      };
      this.warnings = [...loaded.warnings];
      this.parallelism = loaded.state.report.execution?.requested_parallelism ?? null;
      this.scopeLabel = await this.resolveDisplayedScopeLabel(workspace.path, loaded.state.request, loaded.state.scope ?? null);
      this.checkOrder = loaded.state.report.checks.map(check => check.id);
      this.resultsByCheckId.clear();
      this.clearTransientCheckStates();
      for (const check of loaded.state.report.checks) {
        this.resultsByCheckId.set(check.id, check);
      }
      this.statusKind = 'loaded';
      this.statusLabel = loaded.warnings.length > 0 ? 'Loaded last scan with warnings' : 'Loaded last scan';
      this.activeOperationLabel = this.statusLabel;
      this.generatedAt = new Date(loaded.state.savedAt);
      this.completedAtMs = null;
      this.lastDurationMs = null;
      this.tokenUsage = null;
      this.appendOutputLine(`Loaded saved scan for ${workspace.name}.`);
      loaded.warnings.forEach(warning => {
        this.appendOutputLine(`Warning: ${warning}`);
      });
      await this.refreshCheckMetadata(loaded.state.request, this.checkOrder);
      this.renderState();
    } catch (error) {
      if (options.silentMissing && isMissingLastScanError(error)) {
        this.statusKind = 'idle';
        this.statusLabel = 'Ready to scan';
        this.activeOperationLabel = 'Run OpenShrike: Run Scan or Load Last Scan.';
        await this.primeConfiguredCheckSelection(workspace);
        this.renderState();
        return;
      }

      throw error;
    }
  }

  async runScan(workspace: WorkspaceTarget, rawOverrides: Partial<ScanCommandOptions> = {}): Promise<void> {
    await this.releaseReusableNativeSession();
    await this.resetForWorkspace(workspace, 'Preparing scan');

    const hasExplicitScopeOverride = rawOverrides.scanScope !== undefined || rawOverrides.scanTarget !== undefined;
    const selectedScopeOverrides = hasExplicitScopeOverride
      ? {}
      : {
          scanScope: this.scopeSelection.scanScope,
          ...(this.scopeSelection.scanTarget ? {scanTarget: this.scopeSelection.scanTarget} : {})
        };
    const options = await resolveScanOptions({
      repoPath: workspace.path,
      outputFormat: 'markdown',
      ui: false,
      lastScan: false,
      ...selectedScopeOverrides,
      ...rawOverrides
    });
    const request = {
      checkId: options.checkId ?? null,
      policyId: options.policyId ?? null,
      projectChecksDir: options.projectChecksDir ?? null,
      scanScope: options.scanScope,
      scanTarget: options.scanTarget ?? null,
      runtimeMode: options.runtimeMode
    } satisfies SavedScanRequest;

    this.context = {
      workspace,
      request,
      scope: null,
      report: null
    };
    await this.applyCheckSelection(request, await this.resolveCheckIdsForRequest(request));
    this.parallelism = options.parallelism;
    this.scopeLabel = await this.resolveDisplayedScopeLabel(workspace.path, request, null);
    this.generatedAt = null;
    this.completedAtMs = null;
    this.lastDurationMs = null;
    this.tokenUsage = createTokenUsageState();
    this.warnings = [];
    this.appendOutputLine(`Starting ${options.runtimeMode} scan for ${workspace.name}.`);
    this.renderState(this.checkOrder.length);

    if (options.runtimeMode === 'native') {
      await this.runNativeSession(options, workspace, request);
      return;
    }

    await this.runDockerSession(options, workspace, request);
  }

  async cancelScan(): Promise<boolean> {
    if (!this.activeRun) {
      return false;
    }

    this.activeRun.cancelRequested = true;
    this.statusKind = 'cancelling';
    this.statusLabel = 'Cancelling scan';
    this.activeOperationLabel = 'Cancelling the active scan...';
    this.renderState();

    if (this.activeRun.kind === 'native') {
      await this.activeRun.session?.close().catch(() => undefined);
      return true;
    }

    this.activeRun.abortController?.abort();
    return true;
  }

  async setScopeSelection(
    workspace: WorkspaceTarget,
    selection: ScopeSelection
  ): Promise<void> {
    this.assertSettingsChangeAllowed('scan scope');
    await this.ensureWorkspaceContext(workspace);
    const normalized = {
      scanScope: selection.scanScope,
      scanTarget: selection.scanTarget?.trim() || null
    } satisfies ScopeSelection;
    this.sessionScopeSelections.set(workspace.path, normalized);
    this.scopeSelection = normalized;
    this.scopeLabel = await resolveScopeSelectionLabel(workspace.path, normalized);
    this.appendOutputLine(`Next scan scope set to ${this.scopeLabel}.`);
    this.renderState();
  }

  async setRuntimeMode(
    workspace: WorkspaceTarget,
    runtimeMode: RuntimeMode
  ): Promise<void> {
    this.assertSettingsChangeAllowed('runtime mode');
    await this.ensureWorkspaceContext(workspace);

    const loadedProjectConfig = await loadProjectConfigForRepo(workspace.path);
    if (!loadedProjectConfig) {
      throw new Error('OpenShrike is not initialized for this repository.');
    }

    await writeProjectConfig(loadedProjectConfig.configPath, {
      ...loadedProjectConfig.config,
      runtime: {
        ...loadedProjectConfig.config.runtime,
        mode: runtimeMode
      }
    });

    this.runtimeMode = runtimeMode;
    this.appendOutputLine(`Next scan runtime set to ${runtimeMode}.`);
    this.renderState();
  }

  async recheckSelectedFinding(): Promise<void> {
    const selectedFinding = this.model.getSelectedFinding();
    if (!selectedFinding) {
      throw new Error('Select a finding before rechecking it.');
    }

    const context = this.requireContext();
    const baseOptions = await this.resolveActionBaseOptions(context);
    this.appendOutputLine(`Rechecking ${selectedFinding.id}.`);

    if (context.request?.runtimeMode === 'native') {
      const session = await this.ensureReusableNativeSession(baseOptions, context);
      await session.requestRecheck(selectedFinding.id);
      context.report = session.getReport() ?? context.report;
      context.scope = session.getScope() ?? context.scope;
      this.generatedAt = new Date();
      this.completedAtMs = Date.now();
      await this.persistCurrentContext();
      await this.refreshFromContext('completed', `Rechecked ${selectedFinding.id}`);
      return;
    }

    this.setRunningCheck(selectedFinding.id);
    this.renderState();

    try {
      const rechecked = await recheckSingleCheck({
        base: baseOptions,
        request: context.request!,
        repoPath: context.report!.repo.path,
        checkId: selectedFinding.id,
        onRuntimeEvent: event => {
          this.handleRuntimeEvent(event);
        }
      });
      context.report = updateReportCheck(context.report!, rechecked);
      this.resultsByCheckId.set(rechecked.id, rechecked);
      this.generatedAt = new Date();
      this.completedAtMs = Date.now();
      await this.persistCurrentContext();
      await this.refreshFromContext('completed', `Rechecked ${selectedFinding.id}`);
    } finally {
      this.clearTransientCheckStates();
      this.renderState();
    }
  }

  async fixSelectedFinding(): Promise<void> {
    const selectedFinding = this.model.getSelectedFinding();
    if (!selectedFinding) {
      throw new Error('Select a finding before fixing it.');
    }

    const context = this.requireContext();
    if (selectedFinding.status !== 'fail') {
      throw new Error('Only failed findings can be fixed.');
    }

    const baseOptions = await this.resolveActionBaseOptions(context);
    this.appendOutputLine(`Fixing ${selectedFinding.id}.`);

    if (context.request?.runtimeMode === 'native') {
      const session = await this.ensureReusableNativeSession(baseOptions, context);
      await session.requestFix(selectedFinding.id);
      context.report = session.getReport() ?? context.report;
      context.scope = session.getScope() ?? context.scope;
      this.generatedAt = new Date();
      this.completedAtMs = Date.now();
      await this.persistCurrentContext();
      await this.refreshFromContext('completed', `Fixed ${selectedFinding.id}`);
      return;
    }

    const currentCheck = context.report?.checks.find(check => check.id === selectedFinding.id);
    if (!currentCheck) {
      throw new Error(`Could not find ${selectedFinding.id} in the current scan report.`);
    }

    this.setFixingCheck(selectedFinding.id);
    this.renderState();

    try {
      const rechecked = await fixAndRecheckCheck({
        base: baseOptions,
        request: context.request!,
        report: context.report!,
        check: currentCheck,
        ...(context.scope ? {scope: context.scope} : {}),
        onRuntimeEvent: event => {
          this.handleRuntimeEvent(event);
        }
      });
      context.report = updateReportCheck(context.report!, rechecked);
      this.resultsByCheckId.set(rechecked.id, rechecked);
      this.generatedAt = new Date();
      this.completedAtMs = Date.now();
      await this.persistCurrentContext();
      await this.refreshFromContext('completed', `Fixed ${selectedFinding.id}`);
    } finally {
      this.clearTransientCheckStates();
      this.renderState();
    }
  }

  async dispose(): Promise<void> {
    const activeRun = this.takeActiveRun();
    activeRun?.abortController?.abort();
    await activeRun?.session?.close().catch(() => undefined);
    await this.releaseReusableNativeSession();
  }

  private async runNativeSession(
    options: ScanCommandOptions,
    workspace: WorkspaceTarget,
    request: SavedScanRequest
  ): Promise<void> {
    const runId = this.nextRunId++;
    const session = createNativeScanSession(
      {
        ...options,
        ui: false,
        lastScan: false
      },
      undefined,
      {
        onUpdate: snapshot => {
          this.handleNativeSnapshot(runId, workspace, request, options, snapshot);
        },
        onRuntimeEvent: event => {
          this.handleRuntimeEvent(event, runId);
        }
      }
    );

    this.setActiveRun({
      id: runId,
      kind: 'native',
      cancelRequested: false,
      startedAtMs: Date.now(),
      session
    });
    this.statusKind = 'running';
    this.statusLabel = 'Preparing scan';
    this.activeOperationLabel = 'Preparing scan';
    this.renderState();

    try {
      await session.start();
      const completedAtMs = Date.now();
      const activeRun = this.takeActiveRun();
      const startedAtMs = activeRun?.startedAtMs ?? completedAtMs;
      this.context = {
        workspace,
        request,
        scope: session.getScope(),
        report: session.getReport()
      };
      this.generatedAt = new Date();
      this.completedAtMs = completedAtMs;
      this.lastDurationMs = completedAtMs - startedAtMs;
      this.reusableNativeSession = session;
      await this.persistCurrentContext();
      await this.refreshFromContext('completed', 'Scan complete');
    } catch (error) {
      const completedAtMs = Date.now();
      const activeRun = this.takeActiveRun();
      const cancelled = activeRun?.cancelRequested === true || isNativeSessionClosedError(error);
      const startedAtMs = activeRun?.startedAtMs ?? completedAtMs;

      if (cancelled) {
        this.context = {
          workspace,
          request,
          scope: session.getScope(),
          report: session.getPersistableReport()
        };
        this.generatedAt = new Date();
        this.completedAtMs = completedAtMs;
        this.lastDurationMs = completedAtMs - startedAtMs;
        await this.refreshFromContext('cancelled', 'Scan cancelled');
        await session.close().catch(() => undefined);
        return;
      }

      this.completedAtMs = completedAtMs;
      this.lastDurationMs = completedAtMs - startedAtMs;
      this.markRunFailed({
        workspace,
        request,
        error,
        scope: session.getScope(),
        report: session.getPersistableReport()
      });
      await session.close().catch(() => undefined);
      throw error;
    }
  }

  private async runDockerSession(
    options: ScanCommandOptions,
    workspace: WorkspaceTarget,
    request: SavedScanRequest
  ): Promise<void> {
    const runId = this.nextRunId++;
    const abortController = new AbortController();
    this.setActiveRun({
      id: runId,
      kind: 'docker',
      cancelRequested: false,
      startedAtMs: Date.now(),
      abortController
    });
    this.statusKind = 'running';
    this.statusLabel = 'Preparing Docker runtime';
    this.activeOperationLabel = 'Preparing Docker runtime';
    this.renderState();

    try {
      const report = await runScan(
        {
          ...options,
          ui: false,
          lastScan: false
        },
        {
          signal: abortController.signal,
          onProgress: event => {
            this.handleDockerProgress(runId, workspace, request, options, event);
          },
          onRuntimeEvent: event => {
            this.handleRuntimeEvent(event, runId);
          }
        }
      );
      const completedAtMs = Date.now();
      const activeRun = this.takeActiveRun();
      const startedAtMs = activeRun?.startedAtMs ?? completedAtMs;
      this.context = {
        workspace,
        request,
        scope: null,
        report
      };
      this.generatedAt = new Date();
      this.completedAtMs = completedAtMs;
      this.lastDurationMs = completedAtMs - startedAtMs;
      this.checkOrder = report.checks.map(check => check.id);
      this.resultsByCheckId.clear();
      for (const check of report.checks) {
        this.resultsByCheckId.set(check.id, check);
      }
      await this.persistCurrentContext();
      await this.refreshFromContext('completed', 'Scan complete');
    } catch (error) {
      const completedAtMs = Date.now();
      const activeRun = this.takeActiveRun();
      const cancelled = activeRun?.cancelRequested === true || isAbortError(error);
      const startedAtMs = activeRun?.startedAtMs ?? completedAtMs;

      if (cancelled) {
        this.generatedAt = new Date();
        this.completedAtMs = completedAtMs;
        this.lastDurationMs = completedAtMs - startedAtMs;
        this.statusKind = 'cancelled';
        this.statusLabel = 'Scan cancelled';
        this.activeOperationLabel = 'Scan cancelled before completion.';
        this.appendOutputLine(`Cancelled scan for ${workspace.name}.`);
        this.clearTransientCheckStates();
        this.renderState();
        return;
      }

      this.completedAtMs = completedAtMs;
      this.lastDurationMs = completedAtMs - startedAtMs;
      this.markRunFailed({
        workspace,
        request,
        error
      });
      throw error;
    }
  }

  private handleNativeSnapshot(
    runId: number,
    workspace: WorkspaceTarget,
    request: SavedScanRequest,
    options: ScanCommandOptions,
    snapshot: ScanSessionSnapshot
  ): void {
    if (!this.shouldAcceptActiveRunCallback(runId)) {
      return;
    }

    this.applyNativeSnapshot(workspace, request, options, snapshot);
  }

  private applyNativeSnapshot(
    workspace: WorkspaceTarget,
    request: SavedScanRequest,
    options: ScanCommandOptions,
    snapshot: ScanSessionSnapshot
  ): void {
    this.checkOrder = [...snapshot.checkOrder];
    this.resultsByCheckId.clear();
    this.runningCheckIds.clear();
    snapshot.runningCheckIds.forEach(checkId => {
      this.runningCheckIds.add(checkId);
    });
    this.fixingCheckId = snapshot.fixingCheckId;
    for (const [checkId, result] of Object.entries(snapshot.resultsByCheckId)) {
      this.resultsByCheckId.set(checkId, result);
    }
    this.parallelism = options.parallelism;
    if (!this.sessionScopeSelections.has(workspace.path)) {
      this.scopeLabel = snapshot.scopeLabel;
    }
    this.statusKind = this.activeRun?.cancelRequested ? 'cancelling' : 'running';
    this.statusLabel = snapshot.statusLabel;
    this.activeOperationLabel = snapshot.statusLabel;
    this.context = {
      workspace,
      request,
      scope: snapshot.isPrepared
        ? {
            kind: request.scanScope,
            label: snapshot.scopeLabel,
            files: [],
            isFullRepository: snapshot.isFullRepository
          }
        : null,
      report: snapshot.report
    };
    this.completedAtMs = null;
    void this.refreshCheckMetadata(request, snapshot.checkOrder).catch(() => undefined);
    this.renderState(snapshot.totalChecks);
  }

  private handleDockerProgress(
    runId: number,
    workspace: WorkspaceTarget,
    request: SavedScanRequest,
    options: ScanCommandOptions,
    event: {
      type: 'runtime-status' | 'scope-resolved' | 'no-changes-in-scope' | 'check-started' | 'check-completed';
      checkIds: string[];
      checkId: string | null;
      checkResult: CheckResult | null;
      runningCheckIds: string[];
      scopeLabel: string;
      totalChecks: number;
      statusLabel: string;
    }
  ): void {
    if (!this.shouldAcceptActiveRunCallback(runId)) {
      return;
    }

    this.checkOrder = [...event.checkIds];
    this.runningCheckIds.clear();
    event.runningCheckIds.forEach(checkId => {
      this.runningCheckIds.add(checkId);
    });
    this.fixingCheckId = null;
    if (event.checkId && event.checkResult) {
      this.resultsByCheckId.set(event.checkId, event.checkResult);
    }
    this.parallelism = options.parallelism;
    if (event.type !== 'runtime-status' && !this.sessionScopeSelections.has(workspace.path)) {
      this.scopeLabel = event.scopeLabel;
    }
    this.statusKind = this.activeRun?.cancelRequested ? 'cancelling' : 'running';
    this.statusLabel = event.statusLabel;
    this.activeOperationLabel = event.statusLabel;
    this.context = {
      workspace,
      request,
      scope: null,
      report: null
    };
    void this.refreshCheckMetadata(request, event.checkIds).catch(() => undefined);
    this.renderState(event.totalChecks);
  }

  private handleRuntimeEvent(event: ScanRuntimeEvent, runId?: number): void {
    if (runId !== undefined && !this.shouldAcceptActiveRunCallback(runId)) {
      return;
    }

    const streamKey = `${event.runtimeMode}:${event.checkId ?? event.workerId ?? 'session'}`;
    const previous = this.runtimeStreams.get(streamKey) ?? createRuntimeStreamState();
    const next = reduceRuntimeEvent(previous, event.event);
    this.runtimeStreams.set(streamKey, next);
    this.tokenUsage = reduceTokenUsageState(this.tokenUsage ?? createTokenUsageState(), event);

    if (next.items.length <= previous.items.length) {
      return;
    }

    const prefix = event.checkId ? `${event.checkId}: ` : '';
    for (const item of next.items.slice(previous.items.length)) {
      this.appendOutputLine(`${prefix}${item.text}`);
    }
    this.renderState();
  }

  private async refreshFromContext(statusKind: MockScanStatusKind, statusLabel: string): Promise<void> {
    const context = this.requireContext();
    this.statusKind = statusKind;
    this.statusLabel = statusLabel;
    this.activeOperationLabel = statusLabel;
    this.scopeLabel = await this.resolveDisplayedScopeLabel(
      context.workspace.path,
      context.request,
      context.scope
    );
    this.checkOrder = context.report?.checks.map(check => check.id) ?? this.checkOrder;
    this.resultsByCheckId.clear();
    this.clearTransientCheckStates();
    for (const check of context.report?.checks ?? []) {
      this.resultsByCheckId.set(check.id, check);
    }
    await this.refreshCheckMetadata(context.request, this.checkOrder);
    this.renderState(context.report?.summary.total_checks ?? this.checkOrder.length);
  }

  private renderState(totalChecks?: number): void {
    const workspace = this.context?.workspace ?? {
      name: this.model.getState().workspaceName,
      path: this.model.getState().workspacePath
    };
    const checks = this.checkOrder
      .map(checkId => this.resultsByCheckId.get(checkId) ?? null)
      .filter((check): check is CheckResult => check !== null);

    const state = this.checkOrder.length > 0 || checks.length > 0 || this.statusKind !== 'idle'
      ? createScanStateFromResults({
          workspaceName: workspace.name,
          workspacePath: workspace.path,
          statusKind: this.statusKind,
          statusLabel: this.statusLabel,
          generatedAt: this.generatedAt,
          durationMs: this.resolveDurationMs(),
          tokensLabel: this.resolveTokensLabel(),
          scopeLabel: this.scopeLabel,
          selectionLabel: formatSelectionLabel(this.context?.request ?? null),
          runtimeMode: this.runtimeMode,
          parallelism: this.parallelism,
          totalChecks: totalChecks ?? this.context?.report?.summary.total_checks ?? this.checkOrder.length,
          checkIds: this.checkOrder,
          checks,
          runningCheckIds: [...this.runningCheckIds],
          fixingCheckId: this.fixingCheckId,
          titlesByCheckId: this.buildTitleMap(this.context?.request ?? null, this.checkOrder),
          checkMarkdownPathsByCheckId: this.buildCheckMarkdownPathMap(this.context?.request ?? null, this.checkOrder),
          activeOperationLabel: this.activeOperationLabel,
          outputLines: this.outputLines,
          warnings: this.warnings,
          lastScanPath: this.lastScanPath,
          canCancel: this.activeRun !== null && !this.activeRun.cancelRequested
        })
      : createEmptyScanState({
          workspaceName: workspace.name,
          workspacePath: workspace.path,
          statusLabel: this.statusLabel,
          outputLines: this.outputLines,
          scopeLabel: this.scopeLabel,
          ...(this.runtimeMode ? {runtimeModeLabel: this.runtimeMode} : {}),
          ...(this.parallelism !== null ? {parallelismLabel: String(this.parallelism)} : {})
        });

    this.model.setState(state);
  }

  private resolveDurationMs(): number | null {
    if (!this.activeRun) {
      return this.lastDurationMs;
    }

    return Math.max(0, Date.now() - this.activeRun.startedAtMs);
  }

  private clearTransientCheckStates(): void {
    this.runningCheckIds.clear();
    this.fixingCheckId = null;
  }

  private shouldAcceptActiveRunCallback(runId: number): boolean {
    return this.activeRun?.id === runId && this.activeRun.cancelRequested !== true;
  }

  private setRunningCheck(checkId: string): void {
    this.clearTransientCheckStates();
    this.runningCheckIds.add(checkId);
  }

  private setFixingCheck(checkId: string): void {
    this.clearTransientCheckStates();
    this.fixingCheckId = checkId;
  }

  private async primeConfiguredCheckSelection(workspace: WorkspaceTarget): Promise<void> {
    try {
      const request = await this.resolveConfiguredRequest(workspace.path);
      if (!request) {
        return;
      }

      await this.applyCheckSelection(request, await this.resolveCheckIdsForRequest(request));
    } catch (error) {
      console.error('[OpenShrike] Failed to preload configured checks', error);
      this.checkOrder = [];
      if (this.context) {
        this.context = {
          ...this.context,
          request: null
        };
      }
    }
  }

  private async applyCheckSelection(request: SavedScanRequest | null, checkIds: readonly string[]): Promise<void> {
    this.checkOrder = [...checkIds];
    if (this.context) {
      this.context = {
        ...this.context,
        request
      };
    }
    await this.refreshCheckMetadata(request, this.checkOrder);
  }

  private async resolveConfiguredRequest(repoPath: string): Promise<SavedScanRequest | null> {
    const loadedProjectConfig = await loadProjectConfigForRepo(repoPath).catch(() => null);
    if (!loadedProjectConfig) {
      return null;
    }

    const projectChecksDir = await this.resolveConfiguredProjectChecksDirectory(loadedProjectConfig);

    return {
      checkId: projectChecksDir || loadedProjectConfig.config.scan.defaultKind !== 'check'
        ? null
        : loadedProjectConfig.config.scan.defaultId,
      policyId: projectChecksDir || loadedProjectConfig.config.scan.defaultKind !== 'policy'
        ? null
        : loadedProjectConfig.config.scan.defaultId,
      projectChecksDir: projectChecksDir ?? null,
      scanScope: this.scopeSelection.scanScope,
      scanTarget: this.scopeSelection.scanTarget,
      runtimeMode: this.runtimeMode ?? loadedProjectConfig.config.runtime.mode
    };
  }

  private async resolveConfiguredProjectChecksDirectory(input: NonNullable<Awaited<ReturnType<typeof loadProjectConfigForRepo>>>): Promise<string | undefined> {
    if (input.config.scan.defaultKind === 'project-checks') {
      return resolveProjectConfigRelativePath(input, input.config.scan.defaultId);
    }

    const configuredPath = getProjectChecksDirectory(input.repoRoot);

    try {
      const stats = await fs.stat(configuredPath);
      return stats.isDirectory() ? configuredPath : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return undefined;
      }

      throw error;
    }
  }

  private async resolveCheckIdsForRequest(request: SavedScanRequest): Promise<string[]> {
    if (request.projectChecksDir) {
      return (await resolveProjectCheckSelection(request.projectChecksDir, request.checkId ?? undefined)).checkIds;
    }

    if (request.policyId) {
      return (await resolvePolicyDefinition(request.policyId)).checkIds;
    }

    return request.checkId ? [request.checkId] : [];
  }

  private buildTitleMap(request: SavedScanRequest | null, checkIds: readonly string[]): Record<string, string> {
    const checksDirectory = request?.projectChecksDir ?? undefined;
    return Object.fromEntries(
      checkIds
        .map(checkId => [checkId, this.titleCache.get(this.createMetadataKey(checkId, checksDirectory))] as const)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  }

  private buildCheckMarkdownPathMap(request: SavedScanRequest | null, checkIds: readonly string[]): Record<string, string> {
    const checksDirectory = request?.projectChecksDir ?? undefined;
    return Object.fromEntries(
      checkIds
        .map(checkId => [checkId, this.checkMarkdownPathCache.get(this.createMetadataKey(checkId, checksDirectory))] as const)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  }

  private async refreshCheckMetadata(request: SavedScanRequest | null, checkIds: readonly string[]): Promise<void> {
    const checksDirectory = request?.projectChecksDir ?? undefined;
    const pendingCheckIds = checkIds.filter(checkId => !this.titleCache.has(this.createMetadataKey(checkId, checksDirectory)));
    if (pendingCheckIds.length === 0) {
      return;
    }

    const entries = await Promise.all(pendingCheckIds.map(async checkId => {
      const metadataKey = this.createMetadataKey(checkId, checksDirectory);

      try {
        const [title, checkMarkdownPath] = await Promise.all([
          readCheckTitle(checkId, {checksDirectory}),
          resolveCheckDefinitionPath(checkId, {checksDirectory})
        ]);
        return {
          metadataKey,
          title,
          checkMarkdownPath
        };
      } catch {
        return null;
      }
    }));

    let changed = false;
    for (const entry of entries) {
      if (!entry) {
        continue;
      }

      this.titleCache.set(entry.metadataKey, entry.title);
      this.checkMarkdownPathCache.set(entry.metadataKey, entry.checkMarkdownPath);
      changed = true;
    }

    if (changed) {
      this.renderState();
    }
  }

  private createMetadataKey(checkId: string, checksDirectory?: string): string {
    return `${checksDirectory ?? 'bundled'}::${checkId}`;
  }

  private async persistCurrentContext(): Promise<void> {
    const context = this.requireContext();
    if (!context.report || !context.request) {
      return;
    }

    const saveWarnings = await saveLastScanState({
      report: context.report,
      request: context.request,
      ...(context.scope ? {scope: context.scope} : {})
    });
    this.warnings = saveWarnings;
    saveWarnings.forEach(warning => {
      this.appendOutputLine(`Warning: ${warning}`);
    });
  }

  private async resolveActionBaseOptions(context: ScanContext): Promise<ScanCommandOptions> {
    return await resolveScanOptions({
      repoPath: context.workspace.path,
      outputFormat: 'markdown',
      ui: false,
      lastScan: false,
      scanScope: context.request?.scanScope,
      scanTarget: context.request?.scanTarget ?? undefined,
      runtimeMode: context.request?.runtimeMode,
      checkId: context.request?.checkId ?? undefined,
      policyId: context.request?.policyId ?? undefined,
      projectChecksDir: context.request?.projectChecksDir ?? undefined
    });
  }

  private async ensureReusableNativeSession(
    baseOptions: ScanCommandOptions,
    context: ScanContext
  ): Promise<NativeScanSession> {
    if (this.reusableNativeSession) {
      return this.reusableNativeSession;
    }

    const session = createNativeScanSession(
      {
        ...baseOptions,
        repoPath: context.report?.repo.path ?? context.workspace.path,
        ui: false,
        lastScan: false
      },
      {
        initialReport: context.report!,
        savedRequest: context.request!,
        ...(context.scope ? {savedScope: context.scope} : {})
      },
      {
        onUpdate: snapshot => {
          this.applyNativeSnapshot(context.workspace, context.request!, baseOptions, snapshot);
        },
        onRuntimeEvent: event => {
          this.handleRuntimeEvent(event);
        }
      }
    );
    this.reusableNativeSession = session;
    return session;
  }

  private async releaseReusableNativeSession(): Promise<void> {
    if (!this.reusableNativeSession) {
      return;
    }

    const session = this.reusableNativeSession;
    this.reusableNativeSession = null;
    await session.close().catch(() => undefined);
  }

  private requireContext(): ScanContext {
    if (!this.context) {
      throw new Error('Run or load a scan before using OpenShrike findings actions.');
    }

    return this.context;
  }

  private appendOutputLine(message: string): void {
    this.outputLines.push(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
  }

  private async resolveLastScanPath(repoPath: string): Promise<string> {
    return await resolveLastScanPaths(repoPath)
      .then(paths => paths.markdownPath)
      .catch(() => '.openshrike/last-scan.md');
  }

  private assertSettingsChangeAllowed(settingLabel: string): void {
    if (this.activeRun) {
      throw new Error(`Cannot change the ${settingLabel} while a scan is running.`);
    }
  }

  private async ensureWorkspaceContext(workspace: WorkspaceTarget): Promise<void> {
    if (this.context?.workspace.path === workspace.path) {
      return;
    }

    await this.releaseReusableNativeSession();
    this.setActiveRun(null);
    this.context = {
      workspace,
      request: null,
      scope: null,
      report: null
    };
    this.statusKind = 'idle';
    this.statusLabel = 'Ready to scan';
    this.activeOperationLabel = 'Run OpenShrike: Run Scan or Load Last Scan.';
    this.generatedAt = null;
    this.completedAtMs = null;
    this.lastDurationMs = null;
    this.tokenUsage = null;
    this.warnings = [];
    this.checkOrder = [];
    this.clearTransientCheckStates();
    this.resultsByCheckId.clear();
    this.runtimeStreams.clear();
    await this.restoreWorkspaceDefaults(workspace);
    this.lastScanPath = await this.resolveLastScanPath(workspace.path);
    await this.primeConfiguredCheckSelection(workspace);
    this.renderState();
  }

  private async resetForWorkspace(workspace: WorkspaceTarget, statusLabel: string): Promise<void> {
    if (this.activeRun) {
      throw new Error('A scan is already running. Cancel it before starting another scan.');
    }

    const sameWorkspace = this.context?.workspace.path === workspace.path;
    await this.releaseReusableNativeSession();
    this.setActiveRun(null);
    this.context = {
      workspace,
      request: null,
      scope: null,
      report: null
    };
    this.statusKind = 'idle';
    this.statusLabel = statusLabel;
    this.activeOperationLabel = statusLabel;
    this.generatedAt = null;
    this.completedAtMs = null;
    this.lastDurationMs = null;
    this.tokenUsage = null;
    this.warnings = [];
    if (!sameWorkspace) {
      this.checkOrder = [];
    }
    this.clearTransientCheckStates();
    this.resultsByCheckId.clear();
    await this.restoreWorkspaceDefaults(workspace);
    this.runtimeStreams.clear();
    this.lastScanPath = await this.resolveLastScanPath(workspace.path);
    if (!sameWorkspace) {
      await this.primeConfiguredCheckSelection(workspace);
    }
    this.renderState();
  }

  private markRunFailed(input: {
    workspace: WorkspaceTarget;
    request: SavedScanRequest;
    error: unknown;
    scope?: SavedScanScope | null;
    report?: ScanReport | null;
  }): void {
    const message = getErrorMessage(input.error);
    this.context = {
      workspace: input.workspace,
      request: input.request,
      scope: input.scope ?? null,
      report: input.report ?? null
    };
    this.statusKind = 'failed';
    this.statusLabel = message;
    this.activeOperationLabel = message;
    this.runtimeMode = input.request.runtimeMode;
    if (!this.sessionScopeSelections.has(input.workspace.path) && input.scope?.label) {
      this.scopeLabel = input.scope.label;
    }
    this.appendOutputLine(`Scan failed: ${message}`);
    this.clearTransientCheckStates();

    if (input.report) {
      this.checkOrder = input.report.checks.map(check => check.id);
      this.resultsByCheckId.clear();
      for (const check of input.report.checks) {
        this.resultsByCheckId.set(check.id, check);
      }
    }

    this.renderState(input.report?.summary.total_checks ?? this.checkOrder.length);
  }

  private async restoreWorkspaceDefaults(workspace: WorkspaceTarget): Promise<void> {
    const defaults = await resolveWorkspaceScanDefaults(workspace.path);
    this.scopeSelection = this.sessionScopeSelections.get(workspace.path) ?? defaults.scopeSelection;
    this.scopeLabel = await resolveScopeSelectionLabel(workspace.path, this.scopeSelection);
    this.runtimeMode = defaults.runtimeMode;
    this.parallelism = defaults.parallelism;
  }

  private async resolveDisplayedScopeLabel(
    repoPath: string,
    request: SavedScanRequest | null,
    scope: SavedScanScope | null
  ): Promise<string> {
    const sessionScopeSelection = this.sessionScopeSelections.get(repoPath);
    if (sessionScopeSelection) {
      return await resolveScopeSelectionLabel(repoPath, sessionScopeSelection);
    }

    return await resolvePersistedScopeLabel(repoPath, request, scope, this.scopeLabel);
  }

  private setActiveRun(activeRun: ActiveRun | null): void {
    this.activeRun = activeRun;

    if (this.activeRun) {
      if (!this.activeRunRenderTimer) {
        this.activeRunRenderTimer = setInterval(() => {
          if (!this.activeRun) {
            this.clearActiveRunRenderTimer();
            return;
          }

          this.renderState();
        }, ACTIVE_RUN_RENDER_INTERVAL_MS);
      }

      return;
    }

    this.clearActiveRunRenderTimer();
  }

  private takeActiveRun(): ActiveRun | null {
    const activeRun = this.activeRun;
    this.setActiveRun(null);
    return activeRun;
  }

  private clearActiveRunRenderTimer(): void {
    if (!this.activeRunRenderTimer) {
      return;
    }

    clearInterval(this.activeRunRenderTimer);
    this.activeRunRenderTimer = null;
  }

  private resolveTokensLabel(): string {
    if (!this.tokenUsage) {
      return 'n/a';
    }

    return `${formatTokenCount(this.tokenUsage.input)} / ${formatTokenCount(this.tokenUsage.output)}`;
  }
}

function createTokenUsageState(): TokenUsageState {
  return {
    byMessageId: {},
    input: 0,
    output: 0
  };
}

function reduceTokenUsageState(
  previous: TokenUsageState,
  event: ScanRuntimeEvent
): TokenUsageState {
  if (event.event.type !== 'message.updated') {
    return previous;
  }

  const info = (event.event.properties as {
    info?: {
      id?: string;
      role?: string;
      tokens?: {
        input?: number;
        output?: number;
      };
    };
  } | undefined)?.info;

  if (info?.role !== 'assistant' || !info.id || !info.tokens) {
    return previous;
  }

  const nextUsage = {
    input: Math.max(0, info.tokens.input ?? 0),
    output: Math.max(0, info.tokens.output ?? 0)
  };
  const previousUsage = previous.byMessageId[info.id] ?? {input: 0, output: 0};

  return {
    byMessageId: {
      ...previous.byMessageId,
      [info.id]: nextUsage
    },
    input: previous.input - previousUsage.input + nextUsage.input,
    output: previous.output - previousUsage.output + nextUsage.output
  };
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 10_000 ? 0 : 1
  }).format(value).replace('k', 'K');
}

function isMissingLastScanError(error: unknown): boolean {
  return error instanceof Error && /Run `shrike scan` first\./i.test(error.message);
}

function isNativeSessionClosedError(error: unknown): boolean {
  return error instanceof Error && /scan session closed/i.test(error.message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && /aborted|cancelled|terminated/i.test(error.message);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return 'Scan failed.';
}
