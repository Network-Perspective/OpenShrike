import fs from 'node:fs/promises';
import path from 'node:path';
import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import {ScrollView, type ScrollViewRef} from 'ink-scroll-view';
import {readCheckTitle} from '../lib/checks.js';
import {CliError} from '../lib/cli-error.js';
import {
  buildEmptyScopeFallbackOptions,
  resolveDefaultEmptyScopeFallbackAction,
  type EmptyScopeFallbackAction,
  type EmptyScopeFallbackContext,
  type EmptyScopeFallbackOption
} from '../lib/empty-scope-fallback.js';
import {fixAndRecheckCheck, recheckSingleCheck, updateReportCheck} from '../lib/fix.js';
import {createSavedScanRequest, saveLastScanState} from '../lib/last-scan.js';
import {createNativeScanSession, runScan, type ScanSessionSnapshot} from '../lib/scan.js';
import type {
  CheckResult,
  CheckStatus,
  SavedScanRequest,
  SavedScanScope,
  ScanCommandOptions,
  ScanProgressEvent,
  ScanReport,
  ScanRuntimeEvent
} from '../lib/types.js';

type SectionViewMode = 'detail' | 'list';
type CheckDisplayStatus = CheckStatus | 'pending' | 'running' | 'fixing';
type ConfirmationChoice = 'yes' | 'no';
type ConfirmationDialogKind = 'exit';
export type EscapeKeyAction = 'dismiss-exit-confirm' | 'back-to-list' | 'prompt-exit-confirm' | 'exit';
export type VerticalArrowAction = 'scroll' | 'navigate';

interface ConfirmationDialogState {
  kind: ConfirmationDialogKind;
  selectedChoice: ConfirmationChoice;
}

interface EmptyScopeFallbackDialogState {
  selectedIndex: number;
  context: EmptyScopeFallbackContext;
}

export interface DisplayCheck {
  id: string;
  status: CheckDisplayStatus;
  result: CheckResult | null;
}

export interface ScanSection {
  status: CheckStatus;
  title: string;
  items: CheckResult[];
}

export interface BrowserState {
  selectedCheckIndex: number;
  viewMode: SectionViewMode;
}

export interface StreamedReportState {
  checkOrder: string[];
  resultsByCheckId: Record<string, CheckResult>;
}

interface TokenUsageState {
  byMessageId: Record<string, {input: number; output: number}>;
  input: number;
  output: number;
}

export interface EvidenceLocation {
  filePath: string;
  startLine: number;
  endLine: number;
}

interface EvidencePreview {
  raw: string;
  location: EvidenceLocation | null;
  displayLabel: string;
  lines: Array<{number: number; text: string}> | null;
}

interface ProgressViewState {
  scopeLabel: string;
  scopeFileCount: number;
  scopeIsFullRepository: boolean;
  checkIds: string[];
  completedCount: number;
  totalChecks: number;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  runningCheckIds: string[];
  statusLabel: string;
  detailLines: string[];
}

interface ActionState {
  runningCheckIds: string[];
  fixingCheckIds: string[];
  message: string | null;
}

interface AutomationMode {
  kind: 'fix-all-failures';
}

interface SummaryMetricProps {
  label: string;
  value: string;
  width: number;
}

interface CheckListModuleProps {
  checks: DisplayCheck[];
  browser: BrowserState;
  isScanComplete: boolean;
  checkTitles: Record<string, string>;
  runningIndicatorFrame: string;
  statusLabel: string;
  detailLines: string[];
  scrollRef: React.RefObject<ScrollViewRef | null>;
}

const SECTION_ORDER: readonly CheckStatus[] = ['fail', 'unknown', 'pass'];

const SECTION_LABELS: Record<CheckStatus, string> = {
  fail: 'Failed Checks',
  unknown: 'Inconclusive Checks',
  pass: 'Passed Checks'
};

const STATUS_BADGES: Record<CheckDisplayStatus, string> = {
  pending: 'PENDING',
  running: 'RUNNING',
  fixing: 'FIXING',
  fail: 'FAIL',
  unknown: 'INCONCLUSIVE',
  pass: 'PASS'
};

const RUNNING_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const RUNNING_SPINNER_INTERVAL_MS = 160;

const STATUS_MARKERS: Record<CheckDisplayStatus, string> = {
  pending: '[ ]',
  running: `[${RUNNING_SPINNER_FRAMES[0]}]`,
  fixing: '[>]',
  fail: '[x]',
  unknown: '[~]',
  pass: '[v]'
};

const STATUS_COLORS: Record<CheckDisplayStatus, string> = {
  pending: 'gray',
  running: 'whiteBright',
  fixing: 'cyanBright',
  fail: 'redBright',
  unknown: 'yellowBright',
  pass: 'greenBright'
};

const HELP_INPUTS = new Set(['\u001bop', '\u001b[[a', '\u001b[11~', '?']);

type ScrollVisibilityMetrics = Pick<ScrollViewRef, 'getItemPosition' | 'getScrollOffset' | 'getViewportHeight'>;
type ScrollPageMetrics = ScrollVisibilityMetrics & Pick<ScrollViewRef, 'getBottomOffset'>;

export class ScanUiCancelledError extends Error {
  constructor() {
    super('Scan cancelled by user.');
    this.name = 'ScanUiCancelledError';
  }
}

export class ScanUiEmptyScopeFallbackSelectionError extends Error {
  readonly action: EmptyScopeFallbackAction;

  constructor(action: EmptyScopeFallbackAction) {
    super(`Selected empty-scope fallback action: ${action}.`);
    this.name = 'ScanUiEmptyScopeFallbackSelectionError';
    this.action = action;
  }
}

export interface ScanUiCompletion {
  report: ScanReport;
  scope?: SavedScanScope | undefined;
}

export function runScanWithInk(
  options: ScanCommandOptions,
  initialState?: {
    initialReport: ScanReport;
    savedRequest: SavedScanRequest;
    savedScope?: SavedScanScope;
  },
  behavior: {
    allowEmptyScopeFallbackPrompt?: boolean;
    emptyScopeFallbackContext?: EmptyScopeFallbackContext;
  } = {}
): Promise<ScanReport> {
  return new Promise<ScanReport>((resolve, reject) => {
    let completion: ScanUiCompletion | null = null;
    let finalError: Error | null = null;

    const instance = render(
      <ScanApp
        options={options}
        {...(initialState ? {initialState} : {})}
        onDone={nextCompletion => {
          completion = nextCompletion;
        }}
        onCancel={() => {
          finalError = new ScanUiCancelledError();
        }}
        onSelectEmptyScopeFallback={action => {
          finalError = new ScanUiEmptyScopeFallbackSelectionError(action);
        }}
        onError={error => {
          finalError = error;
        }}
        allowEmptyScopeFallbackPrompt={Boolean(behavior.allowEmptyScopeFallbackPrompt)}
        emptyScopeFallbackContext={behavior.emptyScopeFallbackContext ?? {defaultBranchTarget: null}}
      />,
      {
        stdout: process.stderr,
        exitOnCtrlC: true
      }
    );

    instance.waitUntilExit().then(
      () => {
        if (finalError) {
          reject(finalError);
          return;
        }

        if (completion) {
          resolve(completion.report);
          return;
        }

        reject(new Error('Ink scan UI exited without producing a report.'));
      },
      error => {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

export function runFixWithInk(
  options: ScanCommandOptions,
  initialState?: {
    initialReport: ScanReport;
    savedRequest: SavedScanRequest;
    savedScope?: SavedScanScope;
  }
): Promise<ScanUiCompletion> {
  return new Promise<ScanUiCompletion>((resolve, reject) => {
    let completion: ScanUiCompletion | null = null;
    let finalError: Error | null = null;

    const instance = render(
      <ScanApp
        options={options}
        {...(initialState ? {initialState} : {})}
        onDone={nextCompletion => {
          completion = nextCompletion;
        }}
        onCancel={() => {
          finalError = new ScanUiCancelledError();
        }}
        onSelectEmptyScopeFallback={action => {
          finalError = new ScanUiEmptyScopeFallbackSelectionError(action);
        }}
        onError={error => {
          finalError = error;
        }}
        allowEmptyScopeFallbackPrompt={false}
        emptyScopeFallbackContext={{defaultBranchTarget: null}}
        automation={{kind: 'fix-all-failures'}}
      />,
      {
        stdout: process.stderr,
        exitOnCtrlC: true
      }
    );

    instance.waitUntilExit().then(
      () => {
        if (finalError) {
          reject(finalError);
          return;
        }

        if (completion) {
          resolve(completion);
          return;
        }

        reject(new Error('Ink fix UI exited without producing a report.'));
      },
      error => {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

function ScanApp(props: {
  options: ScanCommandOptions;
  initialState?: {
    initialReport: ScanReport;
    savedRequest: SavedScanRequest;
    savedScope?: SavedScanScope;
  };
  onDone: (completion: ScanUiCompletion) => void;
  onCancel: () => void;
  onSelectEmptyScopeFallback: (action: EmptyScopeFallbackAction) => void;
  onError: (error: Error) => void;
  allowEmptyScopeFallbackPrompt: boolean;
  emptyScopeFallbackContext: EmptyScopeFallbackContext;
  automation?: AutomationMode;
}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const detailScrollRef = useRef<ScrollViewRef>(null);
  const listScrollRef = useRef<ScrollViewRef>(null);
  const sessionRef = useRef<ReturnType<typeof createNativeScanSession> | null>(null);
  const startedAtRef = useRef(Date.now());
  const finishedAtRef = useRef<number | null>(null);
  const actionRequest = props.initialState?.savedRequest ?? createSavedScanRequest(props.options);
  const useNativeSession = (props.initialState?.savedRequest.runtimeMode ?? props.options.runtimeMode) === 'native';
  const [progress, setProgress] = useState<ProgressViewState>(() => props.initialState?.initialReport
    ? syncProgressWithReport(createProgressViewState(), props.initialState.initialReport)
    : createProgressViewState());
  const [streamedReportState, setStreamedReportState] = useState<StreamedReportState>(
    createStreamedReportState()
  );
  const [tokenUsage, setTokenUsage] = useState<TokenUsageState>(createTokenUsageState());
  const [report, setReport] = useState<ScanReport | null>(props.initialState?.initialReport ?? null);
  const [browser, setBrowser] = useState<BrowserState>(createInitialBrowserState(props.initialState?.initialReport ?? null));
  const [checkTitles, setCheckTitles] = useState<Record<string, string>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialogState | null>(null);
  const [emptyScopeFallbackDialog, setEmptyScopeFallbackDialog] = useState<EmptyScopeFallbackDialogState | null>(null);
  const [exitAfterDismiss, setExitAfterDismiss] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [actionState, setActionState] = useState<ActionState>({
    runningCheckIds: [],
    fixingCheckIds: [],
    message: null
  });
  const reportRef = useRef<ScanReport | null>(props.initialState?.initialReport ?? null);
  const [isSessionReady, setIsSessionReady] = useState(!useNativeSession);

  const terminalWidth = stdout.columns || 80;
  const terminalHeight = Math.max(12, (stdout.rows || 24) - 1);
  const displayChecks = buildDisplayChecks({
    checkIds: progress.checkIds,
    runningCheckIds: [...progress.runningCheckIds, ...actionState.runningCheckIds],
    fixingCheckIds: actionState.fixingCheckIds,
    streamedResultsByCheckId: streamedReportState.resultsByCheckId,
    reportChecks: report?.checks
  });
  const displayChecksKey = displayChecks
    .map(check => `${check.id}:${check.status}:${check.result?.version ?? ''}`)
    .join('\u0000');
  const loadedTitleCount = Object.keys(checkTitles).length;
  const selectedCheck = getSelectedCheck(displayChecks, browser);
  const reportReady = displayChecks.length > 0;
  const isScanComplete = report !== null;
  const durationMs = finishedAtRef.current === null
    ? elapsedMs
    : finishedAtRef.current - startedAtRef.current;
  const runningIndicatorFrame = getRunningIndicatorFrame(elapsedMs);
  const hasAnimatedChecks = progress.runningCheckIds.length > 0
    || actionState.runningCheckIds.length > 0
    || actionState.fixingCheckIds.length > 0;
  const totalChecks = report?.summary.total_checks ?? progress.totalChecks;
  const {inProgressCount, pendingCount} = deriveProgressCounts({
    isScanComplete,
    totalChecks,
    completedCount: progress.completedCount,
    runningCheckIds: [...progress.runningCheckIds, ...actionState.runningCheckIds, ...actionState.fixingCheckIds]
  });
  const metricWidth = Math.max(14, Math.floor((terminalWidth - 12) / 4));
  const progressBarWidth = Math.max(24, terminalWidth - 8);
  const metricValueWidth = Math.max(8, metricWidth - 2);
  const targetLabel = truncateMiddle(report?.repo.path ?? props.options.repoPath, metricValueWidth);
  const scopeLabel = progress.scopeLabel;
  const tokenLabel = `${formatTokenCount(tokenUsage.input)} / ${formatTokenCount(tokenUsage.output)}`;
  const summaryStatusLabel = resolveSummaryStatusLabel(progress.statusLabel, actionState.message);
  const parallelismLabel = report?.execution
    ? String(report.execution.effective_parallelism)
    : formatRequestedParallelism(props.options.parallelism);
  const showExitConfirm = confirmationDialog?.kind === 'exit';
  const footerText = buildFooterText({
    confirmationDialogKind: confirmationDialog?.kind ?? null,
    showEmptyScopeFallbackDialog: emptyScopeFallbackDialog !== null,
    showHelp,
    viewMode: browser.viewMode,
    reportReady
  });

  const cancelAndExit = () => {
    props.onCancel();
    process.exitCode = 130;
    exit();
    setImmediate(() => {
      process.exit(130);
    });
  };

  const completeAndExit = (completedReport: ScanReport) => {
    const scope = sessionRef.current?.getScope() ?? props.initialState?.savedScope;
    props.onDone({
      report: completedReport,
      ...(scope ? {scope} : {})
    });
    exit();
  };

  const dismissExitConfirm = () => {
    setConfirmationDialog(previous => previous?.kind === 'exit' ? null : previous);
  };

  const selectEmptyScopeFallback = (action: EmptyScopeFallbackAction) => {
    props.onSelectEmptyScopeFallback(action);
    exit();
  };

  const setConfirmationChoice = (selectedChoice: ConfirmationChoice) => {
    setConfirmationDialog(previous => previous ? {
      ...previous,
      selectedChoice
    } : previous);
  };

  const acceptConfirmationDialog = () => {
    if (confirmationDialog?.kind === 'exit') {
      confirmCancelExit();
    }
  };

  const declineConfirmationDialog = () => {
    if (confirmationDialog?.kind === 'exit') {
      dismissExitConfirm();
    }
  };

  const confirmCancelExit = () => {
    dismissExitConfirm();
    setExitAfterDismiss(true);
  };

  const setActionMessage = (message: string | null) => {
    setActionState(previous => ({
      ...previous,
      message
    }));
  };

  const handleScanError = (error: unknown) => {
    const scanError = error instanceof Error ? error : new Error(String(error));

    if (props.allowEmptyScopeFallbackPrompt && isNoChangesInScopeError(scanError)) {
      finishedAtRef.current ??= Date.now();
      setElapsedMs(finishedAtRef.current - startedAtRef.current);
      setProgress(previous => ({
        ...previous,
        runningCheckIds: [],
        statusLabel: 'No uncommitted changes detected',
        detailLines: []
      }));
      setActionState({
        runningCheckIds: [],
        fixingCheckIds: [],
        message: null
      });
      setEmptyScopeFallbackDialog({
        selectedIndex: resolveDefaultEmptyScopeFallbackOptionIndex(props.emptyScopeFallbackContext),
        context: props.emptyScopeFallbackContext
      });
      return;
    }

    props.onError(scanError);
    exit();
  };

  const resolvePersistedScope = (): SavedScanScope | undefined => {
    return sessionRef.current?.getScope() ?? props.initialState?.savedScope;
  };

  const persistReportState = async (nextReport: ScanReport): Promise<string | null> => {
    const scope = resolvePersistedScope();
    const warnings = await saveLastScanState({
      report: nextReport,
      request: actionRequest,
      ...(scope ? {scope} : {})
    });

    return warnings[0] ?? null;
  };

  const focusCheckById = (checkId: string): void => {
    setBrowser(previous => {
      const targetIndex = displayChecks.findIndex(check => check.id === checkId);
      return targetIndex >= 0
        ? {
            ...previous,
            selectedCheckIndex: targetIndex
          }
        : previous;
    });
  };

  const formatBatchFixActionMessage = (
    checkId: string,
    sequence?: {index: number; total: number}
  ): string => {
    return sequence
      ? `Fixing ${checkId} (${sequence.index} of ${sequence.total})...`
      : `Fixing ${checkId}...`;
  };

  const runFixForCheckId = async (
    checkId: string,
    options?: {
      sequence?: {
        index: number;
        total: number;
      };
    }
  ): Promise<void> => {
    focusCheckById(checkId);

    if (useNativeSession && sessionRef.current) {
      setActionState({
        runningCheckIds: [],
        fixingCheckIds: [checkId],
        message: formatBatchFixActionMessage(checkId, options?.sequence)
      });

      try {
        await sessionRef.current.requestFix(checkId);
        const nextReport = sessionRef.current.getPersistableReport();
        if (nextReport) {
          reportRef.current = nextReport;
          const warning = await persistReportState(nextReport);
          if (warning) {
            setActionState({
              runningCheckIds: [],
              fixingCheckIds: [],
              message: warning
            });
            return;
          }
        }

        setActionState({
          runningCheckIds: [],
          fixingCheckIds: [],
          message: `Fixed and rechecked ${checkId}.`
        });
      } catch (error) {
        setActionState({
          runningCheckIds: [],
          fixingCheckIds: [],
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      return;
    }

    const currentReport = reportRef.current;
    const failedCheck = (currentReport?.checks ?? []).find(check => check.id === checkId);

    if (!currentReport || !failedCheck || failedCheck.status !== 'fail') {
      const message = !currentReport
        ? 'Actions are available after the current scan completes.'
        : 'Fix is only available for failed checks.';
      setActionMessage(message);
      return;
    }

    setActionState({
      runningCheckIds: [],
      fixingCheckIds: [checkId],
      message: formatBatchFixActionMessage(checkId, options?.sequence)
    });

    try {
      const nextCheck = await fixAndRecheckCheck({
        base: {
          ...props.options,
          repoPath: currentReport.repo.path,
          ui: false,
          lastScan: false
        },
        request: actionRequest,
        report: currentReport,
        check: failedCheck,
        onRuntimeEvent: event => {
          setTokenUsage(previous => reduceTokenUsageState(previous, event));
        },
        ...(props.initialState?.savedScope ? {scope: props.initialState.savedScope} : {})
      });
      const nextReport = updateReportCheck(currentReport, nextCheck);
      reportRef.current = nextReport;
      setReport(nextReport);
      setProgress(previous => syncProgressWithReport(previous, nextReport));
      const warning = await persistReportState(nextReport);
      if (warning) {
        setActionState({
          runningCheckIds: [],
          fixingCheckIds: [],
          message: warning
        });
        return;
      }
      setActionState({
        runningCheckIds: [],
        fixingCheckIds: [],
        message: `Fixed and rechecked ${checkId}.`
      });
    } catch (error) {
      setActionState({
        runningCheckIds: [],
        fixingCheckIds: [],
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };

  const performRecheck = () => {
    if (useNativeSession && sessionRef.current && selectedCheck) {
      setActionState({
        runningCheckIds: [selectedCheck.id],
        fixingCheckIds: [],
        message: `Rechecking ${selectedCheck.id}...`
      });
      void (async () => {
        try {
          await sessionRef.current?.requestRecheck(selectedCheck.id);
          const nextReport = sessionRef.current?.getPersistableReport();
          if (nextReport) {
            reportRef.current = nextReport;
            const warning = await persistReportState(nextReport);
            if (warning) {
              setActionState({
                runningCheckIds: [],
                fixingCheckIds: [],
                message: warning
              });
              return;
            }
          }
          setActionState({
            runningCheckIds: [],
            fixingCheckIds: [],
            message: `Rechecked ${selectedCheck.id}.`
          });
        } catch (error) {
          setActionState({
            runningCheckIds: [],
            fixingCheckIds: [],
            message: error instanceof Error ? error.message : String(error)
          });
        }
      })();
      return;
    }

    if (!report || !selectedCheck) {
      setActionMessage('Actions are available after the current scan completes.');
      return;
    }

    if (actionState.runningCheckIds.length > 0 || actionState.fixingCheckIds.length > 0) {
      setActionMessage('Another action is already running.');
      return;
    }

    setActionState({
      runningCheckIds: [selectedCheck.id],
      fixingCheckIds: [],
      message: `Rechecking ${selectedCheck.id}...`
    });

    void (async () => {
      try {
        const nextCheck = await recheckSingleCheck({
          base: {
            ...props.options,
            repoPath: report.repo.path,
            ui: false,
            lastScan: false
          },
          request: actionRequest,
          repoPath: report.repo.path,
          checkId: selectedCheck.id,
          onRuntimeEvent: event => {
            setTokenUsage(previous => reduceTokenUsageState(previous, event));
          }
        });
        const nextReport = updateReportCheck(report, nextCheck);
        reportRef.current = nextReport;
        setReport(nextReport);
        setProgress(previous => syncProgressWithReport(previous, nextReport));
        const warning = await persistReportState(nextReport);
        if (warning) {
          setActionState({
            runningCheckIds: [],
            fixingCheckIds: [],
            message: warning
          });
          return;
        }
        setActionState({
          runningCheckIds: [],
          fixingCheckIds: [],
          message: `Rechecked ${selectedCheck.id}.`
        });
      } catch (error) {
        setActionState({
          runningCheckIds: [],
          fixingCheckIds: [],
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })();
  };

  const performFix = () => {
    if (!report || !selectedCheck) {
      setActionMessage('Actions are available after the current scan completes.');
      return;
    }

    const failedCheck = selectedCheck.result;
    if (selectedCheck.status !== 'fail' || !failedCheck || failedCheck.status !== 'fail') {
      setActionMessage('Fix is only available for failed checks.');
      return;
    }

    if (actionState.runningCheckIds.length > 0 || actionState.fixingCheckIds.length > 0) {
      setActionMessage('Another action is already running.');
      return;
    }

    void (async () => {
      try {
        await runFixForCheckId(selectedCheck.id);
      } catch {}
    })();
  };

  useInput((input, key) => {
    const activeScrollRef = showHelp || browser.viewMode === 'detail'
      ? detailScrollRef.current
      : listScrollRef.current;

    if (emptyScopeFallbackDialog) {
      const options = buildEmptyScopeFallbackOptions(emptyScopeFallbackDialog.context);
      const normalizedInput = input.toLowerCase();

      if (key.escape) {
        selectEmptyScopeFallback('skip');
        return;
      }

      if (normalizedInput.length === 1 && /[1-4]/u.test(normalizedInput)) {
        const selectedIndex = Number.parseInt(normalizedInput, 10) - 1;
        const selectedOption = options[selectedIndex];
        if (selectedOption) {
          selectEmptyScopeFallback(selectedOption.action);
        }
        return;
      }

      if (key.leftArrow || key.upArrow) {
        setEmptyScopeFallbackDialog(previous => previous ? {
          ...previous,
          selectedIndex: moveWrappingIndex(previous.selectedIndex, options.length, -1)
        } : previous);
        return;
      }

      if (key.rightArrow || key.downArrow) {
        setEmptyScopeFallbackDialog(previous => previous ? {
          ...previous,
          selectedIndex: moveWrappingIndex(previous.selectedIndex, options.length, 1)
        } : previous);
        return;
      }

      if (key.return) {
        const selectedOption = options[clampSelectableIndex(emptyScopeFallbackDialog.selectedIndex, options.length)];
        selectEmptyScopeFallback(selectedOption?.action ?? 'skip');
      }

      return;
    }

    if (confirmationDialog) {
      const normalizedInput = input.toLowerCase();

      if (key.escape || normalizedInput === 'n') {
        declineConfirmationDialog();
        return;
      }

      if (normalizedInput === 'y') {
        acceptConfirmationDialog();
        return;
      }

      if (key.leftArrow || key.upArrow) {
        setConfirmationChoice('yes');
        return;
      }

      if (key.rightArrow || key.downArrow) {
        setConfirmationChoice('no');
        return;
      }

      if (key.return) {
        if (confirmationDialog.selectedChoice === 'yes') {
          acceptConfirmationDialog();
        } else {
          declineConfirmationDialog();
        }
      }

      return;
    }

    if (isHelpInput(input)) {
      setShowHelp(previous => !previous);
      detailScrollRef.current?.scrollToTop();
      return;
    }

    if (key.escape) {
      const escapeAction = resolveEscapeKeyAction({
        showExitConfirm,
        showHelp,
        viewMode: browser.viewMode,
        isScanComplete
      });

      if (escapeAction === 'back-to-list') {
        setBrowser(previous => setBrowserViewMode(previous, 'list'));
        return;
      }

      if (escapeAction === 'prompt-exit-confirm') {
        setConfirmationDialog({
          kind: 'exit',
          selectedChoice: 'no'
        });
        return;
      }

      if (escapeAction === 'exit') {
        if (report) {
          completeAndExit(report);
        }

        return;
      }

      return;
    }

    if (key.upArrow) {
      if (resolveVerticalArrowAction({
        reportReady,
        showHelp,
        viewMode: browser.viewMode
      }) === 'scroll') {
        activeScrollRef?.scrollBy(-1);
      } else {
        setBrowser(previous => moveBrowserSelection(previous, displayChecks, -1));
      }

      return;
    }

    if (key.downArrow) {
      if (resolveVerticalArrowAction({
        reportReady,
        showHelp,
        viewMode: browser.viewMode
      }) === 'scroll') {
        activeScrollRef?.scrollBy(1);
      } else {
        setBrowser(previous => moveBrowserSelection(previous, displayChecks, 1));
      }

      return;
    }

    if (key.pageUp) {
      if (!showHelp && browser.viewMode === 'list' && reportReady) {
        const target = resolvePagedListNavigation({
          metrics: listScrollRef.current,
          itemCount: displayChecks.length,
          currentIndex: browser.selectedCheckIndex,
          direction: -1
        });

        if (target) {
          listScrollRef.current?.scrollTo(target.scrollOffset);
          setBrowser(previous => ({
            ...previous,
            selectedCheckIndex: target.selectedIndex
          }));
        }
      } else {
        activeScrollRef?.scrollBy(-getScrollPageDelta(activeScrollRef?.getViewportHeight() ?? 0));
      }

      return;
    }

    if (key.pageDown) {
      if (!showHelp && browser.viewMode === 'list' && reportReady) {
        const target = resolvePagedListNavigation({
          metrics: listScrollRef.current,
          itemCount: displayChecks.length,
          currentIndex: browser.selectedCheckIndex,
          direction: 1
        });

        if (target) {
          listScrollRef.current?.scrollTo(target.scrollOffset);
          setBrowser(previous => ({
            ...previous,
            selectedCheckIndex: target.selectedIndex
          }));
        }
      } else {
        activeScrollRef?.scrollBy(getScrollPageDelta(activeScrollRef?.getViewportHeight() ?? 0));
      }

      return;
    }

    if (key.home) {
      if (!showHelp && browser.viewMode === 'list' && reportReady) {
        listScrollRef.current?.scrollToTop();
        setBrowser(previous => ({
          ...previous,
          selectedCheckIndex: 0
        }));
      } else {
        activeScrollRef?.scrollToTop();
      }

      return;
    }

    if (key.end) {
      if (!showHelp && browser.viewMode === 'list' && reportReady) {
        listScrollRef.current?.scrollToBottom();
        setBrowser(previous => ({
          ...previous,
          selectedCheckIndex: Math.max(0, displayChecks.length - 1)
        }));
      } else {
        activeScrollRef?.scrollToBottom();
      }

      return;
    }

    if (!reportReady || showHelp) {
      return;
    }

    if (key.leftArrow) {
      setBrowser(previous => moveBrowserSelection(previous, displayChecks, -1));
      return;
    }

    if (key.rightArrow) {
      setBrowser(previous => moveBrowserSelection(previous, displayChecks, 1));
      return;
    }

    const normalizedInput = input.toLowerCase();

    if (normalizedInput === 'd') {
      setBrowser(previous => setBrowserViewMode(previous, 'detail'));
      return;
    }

    if (normalizedInput === 'l') {
      setBrowser(previous => setBrowserViewMode(previous, 'list'));
      return;
    }

    if (normalizedInput === 'r') {
      performRecheck();
      return;
    }

    if (normalizedInput === 'f') {
      performFix();
      return;
    }

    if (key.return) {
      setBrowser(previous => toggleBrowserViewMode(previous));
    }
  });

  useEffect(() => {
    if (report && !hasAnimatedChecks) {
      return undefined;
    }

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, RUNNING_SPINNER_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [hasAnimatedChecks, report]);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  useEffect(() => {
    if (useNativeSession) {
      let active = true;
      const session = createNativeScanSession(
        props.options,
        props.initialState,
        {
          onUpdate: snapshot => {
            if (!active) {
              return;
            }

            applySessionSnapshot(snapshot, {
              setProgress,
              setStreamedReportState,
              setReport,
              setActionState
            });
          },
          onRuntimeEvent: event => {
            if (!active) {
              return;
            }

            setTokenUsage(previous => reduceTokenUsageState(previous, event));
          }
        }
      );
      sessionRef.current = session;
      setIsSessionReady(true);

      if (props.initialState?.initialReport) {
        finishedAtRef.current = startedAtRef.current;
        setElapsedMs(0);
      }

      void session.start().then(
        completedReport => {
          if (!active) {
            return;
          }

          finishedAtRef.current ??= Date.now();
          setElapsedMs(finishedAtRef.current - startedAtRef.current);
          setProgress(previous => syncProgressWithReport(previous, completedReport));
          setReport(completedReport);
        },
        error => {
          if (!active) {
            return;
          }

          handleScanError(error);
        }
      );

      return () => {
        active = false;
        sessionRef.current = null;
        setIsSessionReady(false);
        void session.close().catch(error => {
          props.onError(error instanceof Error ? error : new Error(String(error)));
        });
      };
    }

    if (props.initialState?.initialReport) {
      finishedAtRef.current = startedAtRef.current;
      setElapsedMs(0);
      return undefined;
    }

    let active = true;

    void (async () => {
      try {
        const completedReport = await runScan(props.options, {
          onProgress: event => {
            if (!active) {
              return;
            }

            setProgress(previous => applyProgressEvent(previous, event));
            setStreamedReportState(previous => reduceStreamedReportState(previous, event));
          },
          onRuntimeEvent: event => {
            if (!active) {
              return;
            }

            setTokenUsage(previous => reduceTokenUsageState(previous, event));
          }
        });

        if (!active) {
          return;
        }

        finishedAtRef.current = Date.now();
        setElapsedMs(finishedAtRef.current - startedAtRef.current);
        setProgress(previous => syncProgressWithReport(previous, completedReport));
        setReport(completedReport);
        setBrowser(previous => syncBrowserState(previous, buildDisplayChecks({
          checkIds: completedReport.checks.map(check => check.id),
          runningCheckIds: [],
          fixingCheckIds: [],
          streamedResultsByCheckId: streamedReportState.resultsByCheckId,
          reportChecks: completedReport.checks
        })));
      } catch (error) {
        if (!active) {
          return;
        }

        handleScanError(error);
      }
    })();

    return () => {
      active = false;
    };
  }, [exit, props.initialState, props.onError, props.options, useNativeSession]);

  useEffect(() => {
    if (props.automation?.kind !== 'fix-all-failures' || !isScanComplete || !reportRef.current || !isSessionReady) {
      return undefined;
    }

    let active = true;

    void (async () => {
      try {
        const failedCheckIds = (reportRef.current?.checks ?? [])
          .filter(check => check.status === 'fail')
          .map(check => check.id);

        for (const [index, checkId] of failedCheckIds.entries()) {
          if (!active) {
            return;
          }

          const currentCheck = (reportRef.current?.checks ?? []).find(check => check.id === checkId);
          if (!currentCheck || currentCheck.status !== 'fail') {
            continue;
          }

          await runFixForCheckId(checkId, {
            sequence: {
              index: index + 1,
              total: failedCheckIds.length
            }
          });
        }

        const completedReport = reportRef.current;
        if (!active || !completedReport) {
          return;
        }

        completeAndExit(completedReport);
      } catch (error) {
        if (!active) {
          return;
        }

        handleScanError(error);
      }
    })();

    return () => {
      active = false;
    };
  }, [isScanComplete, isSessionReady, props.automation]);

  useEffect(() => {
    if (displayChecks.length === 0) {
      return undefined;
    }

    let active = true;

    void (async () => {
      const entries = await Promise.all(
        displayChecks
          .filter(check => !checkTitles[check.id])
          .map(async check => {
          try {
            return [check.id, await readCheckTitle(check.id)] as const;
          } catch {
            return null;
          }
          })
      );

      if (!active) {
        return;
      }

      const resolvedTitles = Object.fromEntries(entries.filter(entry => entry !== null));
      if (Object.keys(resolvedTitles).length === 0) {
        return;
      }

      setCheckTitles(previous => ({
        ...previous,
        ...resolvedTitles
      }));
    })();

    return () => {
      active = false;
    };
  }, [checkTitles, displayChecksKey]);

  useEffect(() => {
    if (!reportReady) {
      return;
    }

    setBrowser(previous => syncBrowserState(previous, displayChecks));
  }, [displayChecksKey, reportReady]);

  useEffect(() => {
    if (!report) {
      return;
    }

    setConfirmationDialog(previous => previous?.kind === 'exit' ? null : previous);
    setEmptyScopeFallbackDialog(null);
    setExitAfterDismiss(false);
  }, [report]);

  useEffect(() => {
    if (!exitAfterDismiss || showExitConfirm) {
      return;
    }

    setExitAfterDismiss(false);
    cancelAndExit();
  }, [exitAfterDismiss, showExitConfirm]);

  useEffect(() => {
    const handleResize = () => {
      detailScrollRef.current?.remeasure();
      listScrollRef.current?.remeasure();

      if (showHelp || browser.viewMode !== 'list' || !reportReady) {
        return;
      }

      const targetOffset = resolveVisibleItemScrollOffset(
        listScrollRef.current,
        clampSelectedIndex(browser.selectedCheckIndex, displayChecks.length)
      );

      if (targetOffset !== null) {
        listScrollRef.current?.scrollTo(targetOffset);
      }
    };

    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [browser.selectedCheckIndex, browser.viewMode, displayChecks.length, reportReady, showHelp, stdout]);

  useEffect(() => {
    if (showHelp) {
      detailScrollRef.current?.scrollToTop();
      return;
    }

    if (browser.viewMode === 'detail') {
      detailScrollRef.current?.scrollToTop();
      return;
    }

    if (!reportReady) {
      return;
    }

    listScrollRef.current?.remeasure();
    const targetOffset = resolveVisibleItemScrollOffset(
      listScrollRef.current,
      clampSelectedIndex(browser.selectedCheckIndex, displayChecks.length)
    );

    if (targetOffset !== null) {
      listScrollRef.current?.scrollTo(targetOffset);
    }
  }, [browser.selectedCheckIndex, browser.viewMode, displayChecks.length, displayChecksKey, loadedTitleCount, reportReady, showHelp]);

  return (
    <Box width={terminalWidth} height={terminalHeight}>
      <Box
        width={terminalWidth}
        height={terminalHeight}
        flexDirection="column"
        paddingX={1}
      >
        <Text color="cyanBright" bold>
          OpenShrike Scan
        </Text>
        <Box flexGrow={1} overflow="hidden" marginTop={1} minHeight={0}>
          {showHelp ? (
            <ScrollView
              ref={detailScrollRef}
              flexDirection="column"
              width="100%"
              height="100%"
            >
              <HelpModule key="help" />
            </ScrollView>
          ) : browser.viewMode === 'detail' ? (
            <DetailModule
              key="detail"
              check={selectedCheck}
              selectedIndex={browser.selectedCheckIndex}
              totalChecks={displayChecks.length}
              checkTitles={checkTitles}
              repoPath={report?.repo.path ?? path.resolve(props.options.repoPath)}
              scrollRef={detailScrollRef}
            />
          ) : (
            <Box width="100%" height="100%" flexDirection="column" minHeight={0}>
              <SummaryModule
                metricWidth={metricWidth}
                progressBarWidth={progressBarWidth}
                targetLabel={targetLabel}
                durationLabel={formatDuration(durationMs)}
                tokenLabel={tokenLabel}
                parallelismLabel={parallelismLabel}
                scopeLabel={scopeLabel}
                statusLabel={summaryStatusLabel}
                totalChecks={totalChecks}
                failedCount={report?.summary.failed ?? progress.failedCount}
                unknownCount={report?.summary.unknown ?? progress.unknownCount}
                passedCount={report?.summary.passed ?? progress.passedCount}
                inProgressCount={inProgressCount}
                pendingCount={pendingCount}
              />
              <CheckListModule
                checks={displayChecks}
                browser={browser}
                isScanComplete={isScanComplete}
                checkTitles={checkTitles}
                runningIndicatorFrame={runningIndicatorFrame}
                statusLabel={progress.statusLabel}
                detailLines={progress.detailLines}
                scrollRef={listScrollRef}
              />
            </Box>
          )}
        </Box>
      <Box marginTop={1}>
          <Text color="gray">{footerText}</Text>
        </Box>
      </Box>
      {emptyScopeFallbackDialog ? (
        <EmptyScopeFallbackDialog
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          dialog={emptyScopeFallbackDialog}
        />
      ) : null}
      {confirmationDialog ? (
        <ConfirmationDialog
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          selectedChoice={confirmationDialog.selectedChoice}
        />
      ) : null}
    </Box>
  );
}

function SummaryModule(props: {
  metricWidth: number;
  progressBarWidth: number;
  targetLabel: string;
  durationLabel: string;
  tokenLabel: string;
  parallelismLabel: string;
  scopeLabel: string;
  statusLabel: string;
  totalChecks: number;
  failedCount: number;
  unknownCount: number;
  passedCount: number;
  inProgressCount: number;
  pendingCount: number;
}) {
  const progressSegments = buildProgressSegments({
    failedCount: props.failedCount,
    unknownCount: props.unknownCount,
    passedCount: props.passedCount,
    inProgressCount: props.inProgressCount,
    pendingCount: props.pendingCount,
    width: props.progressBarWidth
  });

  return (
    <Module borderColor="gray" marginBottom={1}>
      <Box flexWrap="wrap" gap={1}>
        <SummaryMetric label="Target" value={props.targetLabel} width={props.metricWidth} />
        <SummaryMetric label="Duration" value={props.durationLabel} width={props.metricWidth} />
        <SummaryMetric label="Tokens In / Out" value={props.tokenLabel} width={props.metricWidth} />
        <SummaryMetric label="Parallelism" value={props.parallelismLabel} width={props.metricWidth} />
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text bold>{props.totalChecks} TOTAL CHECKS</Text>
          <Text color="gray"> scanned</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Box flexDirection="row" flexWrap="nowrap">
          {progressSegments.map(segment => (
            <Text
              key={segment.key}
              color={segment.color}
              backgroundColor={segment.backgroundColor}
            >
              {segment.text}
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <ScoreRow
          cellWidth={props.metricWidth}
          failedCount={props.failedCount}
          unknownCount={props.unknownCount}
          passedCount={props.passedCount}
          inProgressCount={props.inProgressCount}
        />
      </Box>

      <Box marginTop={1}>
        <Text>Scope: {props.scopeLabel}</Text>
      </Box>

      <Box marginTop={1}>
        <Text>Status: {props.statusLabel}</Text>
      </Box>
    </Module>
  );
}

function SummaryMetric(props: SummaryMetricProps) {
  return (
    <Box flexDirection="column" width={props.width} flexShrink={0}>
      <Text color="gray">{props.label}</Text>
      <Text bold>{props.value}</Text>
    </Box>
  );
}

function CheckListModule(props: CheckListModuleProps) {
  const title = buildChecksPaneTitle(props.checks, props.browser);

  return (
    <Module flexGrow={1} minHeight={0}>
      <Box justifyContent="space-between" gap={1}>
        <Text color="cyanBright" bold>
          {title}
        </Text>        
      </Box>

      <Box marginTop={1} flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        <ScrollView
          ref={props.scrollRef}
          flexDirection="column"
          width="100%"
          height="100%"
        >
          {renderCheckListRows({
            checks: props.checks,
            browser: props.browser,
            isScanComplete: props.isScanComplete,
            checkTitles: props.checkTitles,
            runningIndicatorFrame: props.runningIndicatorFrame,
            statusLabel: props.statusLabel,
            detailLines: props.detailLines
          })}
        </ScrollView>
      </Box>
    </Module>
  );
}

function ConfirmationDialog(props: {
  terminalWidth: number;
  terminalHeight: number;
  selectedChoice: ConfirmationChoice;
}) {
  const dialogWidth = Math.min(
    props.terminalWidth,
    Math.max(24, Math.min(props.terminalWidth - 4, 76))
  );

  return (
    <Box
      position="absolute"
      width={props.terminalWidth}
      height={props.terminalHeight}
      justifyContent="center"
      alignItems="center"
      backgroundColor="black"
    >
      <Box width={dialogWidth} flexDirection="column" backgroundColor="black">
        <Module borderColor="yellowBright">
          <Text color="yellowBright" bold>
            Exit Running Scan?
          </Text>

          <Box marginTop={1} flexDirection="column">
            <Text>Scan is currently running.</Text>
            <Text>Are you sure you want to exit and abandon the current scan?</Text>
          </Box>

          <Box marginTop={1} gap={1}>
            <ConfirmChoice label="Yes" isSelected={props.selectedChoice === 'yes'} />
            <ConfirmChoice label="No" isSelected={props.selectedChoice === 'no'} />
          </Box>

          <Box marginTop={1}>
            <Text color="gray">Left / Right / Up / Down to select. Enter to confirm. Esc to stay.</Text>
          </Box>
        </Module>
      </Box>
    </Box>
  );
}

function ConfirmChoice(props: {label: string; isSelected: boolean}) {
  return props.isSelected ? (
    <Text color="black" backgroundColor="whiteBright">{` ${props.label} `}</Text>
  ) : (
    <Text color="gray">{` ${props.label} `}</Text>
  );
}

function EmptyScopeFallbackDialog(props: {
  terminalWidth: number;
  terminalHeight: number;
  dialog: EmptyScopeFallbackDialogState;
}) {
  const dialogWidth = Math.min(
    props.terminalWidth,
    Math.max(32, Math.min(props.terminalWidth - 4, 84))
  );
  const options = buildEmptyScopeFallbackOptions(props.dialog.context);
  const selectedIndex = clampSelectableIndex(props.dialog.selectedIndex, options.length);

  return (
    <Box
      position="absolute"
      width={props.terminalWidth}
      height={props.terminalHeight}
      justifyContent="center"
      alignItems="center"
      backgroundColor="black"
    >
      <Box width={dialogWidth} flexDirection="column" backgroundColor="black">
        <Module borderColor="cyanBright">
          <Text color="cyanBright" bold>
            No Uncommitted Changes
          </Text>

          <Box marginTop={1} flexDirection="column">
            <Text>There are no uncommitted changes in the current folder.</Text>
            <Text>Choose what to scan next.</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            {options.map((option, index) => (
              <EmptyScopeFallbackOptionRow
                key={option.action}
                option={option}
                index={index}
                isSelected={selectedIndex === index}
              />
            ))}
          </Box>

          <Box marginTop={1}>
            <Text color="gray">1-4 or Up / Down to select. Enter to confirm. Esc to skip.</Text>
          </Box>
        </Module>
      </Box>
    </Box>
  );
}

function EmptyScopeFallbackOptionRow(props: {
  option: EmptyScopeFallbackOption;
  index: number;
  isSelected: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={props.index === 0 ? 0 : 1}>
      <Box flexDirection="row" flexWrap="wrap">
        <Text color={props.isSelected ? 'cyanBright' : 'gray'}>{props.isSelected ? '>' : ' '}</Text>
        <Text> </Text>
        <Text color={props.isSelected ? 'whiteBright' : 'gray'} bold={props.isSelected}>
          {`${props.index + 1}. ${props.option.label}`}
        </Text>
      </Box>
      <Box marginLeft={4}>
        <Text color="gray">{props.option.detail}</Text>
      </Box>
    </Box>
  );
}

function DetailModule(props: {
  check: DisplayCheck | null;
  selectedIndex: number;
  totalChecks: number;
  checkTitles: Record<string, string>;
  repoPath: string;
  scrollRef: React.RefObject<ScrollViewRef | null>;
}) {
  const shortId = props.check ? formatCheckIdDisplay(props.check.id) : 'No Check';
  const title = props.check ? formatCheckTitle(props.check, props.checkTitles) : 'No check selected';
  const status = props.check?.status ?? 'pending';
  const indexLabel = props.totalChecks > 0 ? `${props.selectedIndex + 1} of ${props.totalChecks}` : '0';

  return (
    <Module flexGrow={1} minHeight={0}>
      <Box justifyContent="space-between" gap={1}>
        <Text color={STATUS_COLORS[status]} bold>
          {`> ${shortId} (${indexLabel})`}
        </Text>
        {props.totalChecks > 0 ? (
          <Text color="gray">{'<- / -> Check | Up / Down Scroll | [ENTER] List'}</Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        <ScrollView
          ref={props.scrollRef}
          flexDirection="column"
          width="100%"
          height="100%"
        >
          {props.check ? (
            <DetailView
              check={props.check}
              checkTitles={props.checkTitles}
              repoPath={props.repoPath}
            />
          ) : (
            <Text key="empty-detail-view" color="gray">No check selected.</Text>
          )}
        </ScrollView>
      </Box>
    </Module>
  );
}

function DetailView(props: {
  check: DisplayCheck;
  checkTitles: Record<string, string>;
  repoPath: string;
}) {
  const title = formatCheckTitle(props.check, props.checkTitles);
  const shortId = formatCheckIdDisplay(props.check.id);
  const outcomeLabel = getOutcomeLabel(props.check.status);
  const result = props.check.result;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={STATUS_COLORS[props.check.status]} bold>
          [{STATUS_BADGES[props.check.status]}]
        </Text>
        {result ? <Text>[Confidence: {formatConfidence(result.confidence)}]</Text> : null}
      </Box>

      <Box marginTop={1}>
        <Box flexDirection="row" flexWrap="wrap">
          <Text color="gray">{shortId}: </Text>
          <Text bold>{title}</Text>
        </Box>
      </Box>

      <DetailBlock label={outcomeLabel}>
        <Text>{formatOutcome(props.check)}</Text>
      </DetailBlock>

      <DetailBlock label="Why">
        {renderMultilineText(
          result?.rationale ?? 'Check is pending execution or still running.'
        )}
      </DetailBlock>

      <DetailBlock label="Evidence">
        <EvidenceBlock evidence={result?.evidence ?? []} repoPath={props.repoPath} />
      </DetailBlock>

      <DetailBlock label="Remediation">
        {result && result.remediation.length > 0 ? (
          <Box flexDirection="column">
            {result.remediation.map((item, index) => (
              <Text key={`${props.check.id}-remediation-${index}`}>- {item}</Text>
            ))}
          </Box>
        ) : (
          <Text>
            {result ? 'No remediation provided.' : 'No remediation available until the check completes.'}
          </Text>
        )}
      </DetailBlock>
    </Box>
  );
}

function DetailBlock(props: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">{props.label}:</Text>
      <Box marginTop={0} flexDirection="column">
        {props.children}
      </Box>
    </Box>
  );
}

function CodeBlock(props: {lines: Array<{number: number; text: string}>}) {
  const lineNumberWidth = String(props.lines[props.lines.length - 1]?.number ?? 0).length;

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
      {props.lines.map(line => (
        <Text key={`code-${line.number}`} color="gray">
          {`${String(line.number).padStart(lineNumberWidth, ' ')} | ${line.text}`}
        </Text>
      ))}
    </Box>
  );
}

function renderCheckListRows(props: {
  checks: DisplayCheck[];
  browser: BrowserState;
  isScanComplete: boolean;
  checkTitles: Record<string, string>;
  runningIndicatorFrame: string;
  statusLabel: string;
  detailLines: string[];
}): React.ReactNode {
  if (props.checks.length === 0) {
    if (!props.isScanComplete) {
      return (
        <Box key="empty-check-list" flexDirection="column">
          <Text color="yellowBright">{`[${props.runningIndicatorFrame}] ${props.statusLabel}`}</Text>
          {props.detailLines.length > 0 ? (
            <Box marginTop={1} flexDirection="column">
              {props.detailLines.map((line, index) => (
                <Text key={`empty-check-list-line-${index}`} color="gray">
                  {line}
                </Text>
              ))}
            </Box>
          ) : (
            <Text color="gray">Checks will appear once the runtime is ready.</Text>
          )}
        </Box>
      );
    }

    return (
      <Text key="empty-check-list" color="gray">
        No checks in this report.
      </Text>
    );
  }

  const selectedIndex = clampSelectedIndex(props.browser.selectedCheckIndex, props.checks.length);

  return props.checks.map((check, index) => {
    const isActiveRow = selectedIndex === index;
    const prefix = isActiveRow ? '>' : ' ';
    const display = buildCheckListEntryDisplay(check, props.checkTitles, {
      runningIndicatorFrame: props.runningIndicatorFrame
    });

    return (
      <Box key={check.id} flexDirection="row" flexWrap="wrap">
        <Text color={isActiveRow ? 'cyanBright' : 'gray'}>{`${prefix} `}</Text>
        <Text color={display.statusColor}>{`${display.marker} `}</Text>
        <Text color={display.statusColor} bold={isActiveRow}>{display.title}</Text>
        <Text color="gray">{` (${display.idLabel})`}</Text>
      </Box>
    );
  });
}

function EvidenceBlock(props: {
  evidence: string[];
  repoPath: string;
}) {
  const evidenceKey = props.evidence.join('\u0000');
  const [previews, setPreviews] = useState<EvidencePreview[]>(() => buildEvidenceFallbackPreviews(props.evidence));

  useEffect(() => {
    let active = true;
    setPreviews(buildEvidenceFallbackPreviews(props.evidence));

    void (async () => {
      const nextPreviews = await Promise.all(
        props.evidence.map(evidence => buildEvidencePreview(evidence, props.repoPath))
      );

      if (!active) {
        return;
      }

      setPreviews(nextPreviews);
    })();

    return () => {
      active = false;
    };
  }, [evidenceKey, props.repoPath]);

  if (props.evidence.length === 0) {
    return <Text>No evidence was captured.</Text>;
  }

  return (
    <Box flexDirection="column">
      {previews.map((preview, index) => (
        <Box
          key={`${preview.raw}-${index}`}
          flexDirection="column"
          marginTop={index === 0 ? 0 : 1}
        >
          <Text color="gray">{preview.displayLabel}</Text>
          {preview.lines ? (
            <Box marginTop={1}>
              <CodeBlock lines={preview.lines} />
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

function HelpModule() {
  return (
    <Module borderColor="gray" marginBottom={1}>
      <Text color="cyanBright" bold>
        Help
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>List view: Left / Right / Up / Down move to the previous or next check and auto-scroll the checks pane.</Text>
        <Text>Detail view and Help: Up / Down scroll the report one line at a time.</Text>
        <Text>Page Up / Page Down: page through the checks pane or the current report.</Text>
        <Text>D: open detail view for the current check.</Text>
        <Text>L: switch detail view back to list view.</Text>
        <Text>Enter: toggle between detail and list for the current section.</Text>
        <Text>Esc: return to the list from detail view. While a scan is running, Esc asks for confirmation before exiting.</Text>
        <Text>F1: toggle this help screen.</Text>
      </Box>
    </Module>
  );
}

function Module(props: {
  borderColor?: string;
  marginBottom?: number | undefined;
  flexGrow?: number | undefined;
  minHeight?: number | string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Box
      borderStyle={props.borderColor ? "round" : undefined}
      borderColor={props.borderColor}
      paddingX={1}
      paddingY={0}
      marginBottom={props.marginBottom}
      flexDirection="column"
      flexGrow={props.flexGrow}
      minHeight={props.minHeight}
    >
      {props.children}
    </Box>
  );
}

function ScoreRow(props: {
  cellWidth: number;
  failedCount: number;
  unknownCount: number;
  passedCount: number;
  inProgressCount: number;
}) {
  return (
    <Box flexWrap="wrap">
      <ScoreCell label={`${props.failedCount} Failed`} color="redBright" width={props.cellWidth} />
      <ScoreCell label={`${props.unknownCount} Inconclusive`} color="yellowBright" width={props.cellWidth} />
      <ScoreCell label={`${props.passedCount} Passed`} color="greenBright" width={props.cellWidth} />
      <ScoreCell label={`${props.inProgressCount} In progress`} color="whiteBright" width={props.cellWidth} />
    </Box>
  );
}

function ScoreCell(props: {label: string; color: string; width: number}) {
  return (
    <Box width={props.width} flexShrink={0}>
      <Text color={props.color}>{props.label}</Text>
    </Box>
  );
}

function createProgressViewState(): ProgressViewState {
  return {
    scopeLabel: 'Resolving scope',
    scopeFileCount: 0,
    scopeIsFullRepository: false,
    checkIds: [],
    completedCount: 0,
    totalChecks: 0,
    passedCount: 0,
    failedCount: 0,
    unknownCount: 0,
    runningCheckIds: [],
    statusLabel: 'Preparing scan',
    detailLines: []
  };
}

function applyProgressEvent(
  previous: ProgressViewState,
  event: ScanProgressEvent
): ProgressViewState {
  const next: ProgressViewState = {
    ...previous,
    scopeLabel: event.scopeLabel,
    scopeFileCount: event.scopeFileCount,
    scopeIsFullRepository: event.isFullRepository,
    checkIds: [...event.checkIds],
    completedCount: event.completedCount,
    totalChecks: event.totalChecks,
    passedCount: event.passedCount,
    failedCount: event.failedCount,
    unknownCount: event.unknownCount,
    runningCheckIds: [...event.runningCheckIds],
    statusLabel: event.statusLabel,
    detailLines: [...event.detailLines]
  };
  return next;
}

function syncProgressWithReport(
  previous: ProgressViewState,
  report: ScanReport
): ProgressViewState {
  return {
    ...previous,
    completedCount: report.summary.total_checks,
    totalChecks: report.summary.total_checks,
    passedCount: report.summary.passed,
    failedCount: report.summary.failed,
    unknownCount: report.summary.unknown,
    runningCheckIds: [],
    statusLabel: 'Scan complete',
    detailLines: []
  };
}

function syncProgressWithSessionSnapshot(
  previous: ProgressViewState,
  snapshot: ScanSessionSnapshot
): ProgressViewState {
  return {
    ...previous,
    scopeLabel: snapshot.scopeLabel,
    scopeFileCount: snapshot.scopeFileCount,
    scopeIsFullRepository: snapshot.isFullRepository,
    checkIds: [...snapshot.checkOrder],
    completedCount: snapshot.completedCount,
    totalChecks: snapshot.totalChecks,
    passedCount: snapshot.passedCount,
    failedCount: snapshot.failedCount,
    unknownCount: snapshot.unknownCount,
    runningCheckIds: [...snapshot.runningCheckIds],
    statusLabel: snapshot.statusLabel,
    detailLines: [...snapshot.detailLines]
  };
}

function applySessionSnapshot(
  snapshot: ScanSessionSnapshot,
  setters: {
    setProgress: React.Dispatch<React.SetStateAction<ProgressViewState>>;
    setStreamedReportState: React.Dispatch<React.SetStateAction<StreamedReportState>>;
    setReport: React.Dispatch<React.SetStateAction<ScanReport | null>>;
    setActionState: React.Dispatch<React.SetStateAction<ActionState>>;
  }
): void {
  setters.setProgress(previous => syncProgressWithSessionSnapshot(previous, snapshot));
  setters.setStreamedReportState({
    checkOrder: [...snapshot.checkOrder],
    resultsByCheckId: {...snapshot.resultsByCheckId}
  });
  setters.setReport(snapshot.report);
  setters.setActionState(previous => syncActionStateWithSessionSnapshot(previous, snapshot));
}

function dedupeActionCheckIds(checkIds: string[]): string[] {
  return [...new Set(checkIds)];
}

export function syncActionStateWithSessionSnapshot(
  previous: ActionState,
  snapshot: Pick<ScanSessionSnapshot, 'runningCheckIds' | 'fixingCheckId'>
): ActionState {
  const acknowledgedCheckIds = new Set([
    ...snapshot.runningCheckIds,
    ...(snapshot.fixingCheckId ? [snapshot.fixingCheckId] : [])
  ]);

  return {
    ...previous,
    // Keep only optimistic actions that the session has not taken ownership of yet.
    runningCheckIds: dedupeActionCheckIds(previous.runningCheckIds.filter(checkId =>
      !acknowledgedCheckIds.has(checkId)
    )),
    fixingCheckIds: snapshot.fixingCheckId
      ? [snapshot.fixingCheckId]
      : dedupeActionCheckIds(previous.fixingCheckIds.filter(checkId =>
        !acknowledgedCheckIds.has(checkId)
      ))
  };
}

export function resolveSummaryStatusLabel(
  progressStatusLabel: string,
  actionMessage: string | null
): string {
  return actionMessage ?? progressStatusLabel;
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

export function createStreamedReportState(): StreamedReportState {
  return {
    checkOrder: [],
    resultsByCheckId: {}
  };
}

export function reduceStreamedReportState(
  previous: StreamedReportState,
  event: ScanProgressEvent
): StreamedReportState {
  const next: StreamedReportState = {
    checkOrder: [...previous.checkOrder],
    resultsByCheckId: {...previous.resultsByCheckId}
  };

  if (event.checkId && !next.checkOrder.includes(event.checkId)) {
    next.checkOrder.push(event.checkId);
  }

  if (event.type === 'check-completed' && event.checkResult) {
    next.resultsByCheckId[event.checkResult.id] = event.checkResult;
  }

  return next;
}

export function buildStreamedReport(
  state: StreamedReportState
): Pick<ScanReport, 'checks'> | null {
  const checks = state.checkOrder
    .map(checkId => state.resultsByCheckId[checkId])
    .filter((check): check is CheckResult => check !== undefined);

  return checks.length > 0 ? {checks} : null;
}

export function buildScanSections(report: Pick<ScanReport, 'checks'> | null): ScanSection[] {
  const checks = report?.checks ?? [];

  return SECTION_ORDER.map(status => ({
    status,
    title: SECTION_LABELS[status],
    items: checks.filter(check => check.status === status)
  }));
}

function buildDisplayChecks(options: {
  checkIds: string[];
  runningCheckIds: string[];
  fixingCheckIds: string[];
  streamedResultsByCheckId: Record<string, CheckResult>;
  reportChecks: CheckResult[] | undefined;
}): DisplayCheck[] {
  const reportById = new Map((options.reportChecks ?? []).map(check => [check.id, check] as const));
  const runningCheckIds = new Set(options.runningCheckIds);
  const fixingCheckIds = new Set(options.fixingCheckIds);
  const checkIds: string[] = [];
  const seen = new Set<string>();

  const appendId = (checkId: string) => {
    if (seen.has(checkId)) {
      return;
    }

    seen.add(checkId);
    checkIds.push(checkId);
  };

  options.checkIds.forEach(appendId);
  (options.reportChecks ?? []).forEach(check => appendId(check.id));
  Object.keys(options.streamedResultsByCheckId).forEach(appendId);

  return checkIds.map(checkId => {
    const result = reportById.get(checkId) ?? options.streamedResultsByCheckId[checkId] ?? null;
    return {
      id: checkId,
      status: fixingCheckIds.has(checkId)
        ? 'fixing'
        : runningCheckIds.has(checkId)
          ? 'running'
          : result?.status ?? 'pending',
      result
    };
  });
}

export function createInitialBrowserState(report: Pick<ScanReport, 'checks'> | null): BrowserState {
  const checks = report?.checks ?? [];
  const firstFailureIndex = checks.findIndex(check => check.status === 'fail');

  return {
    selectedCheckIndex: firstFailureIndex >= 0 ? firstFailureIndex : 0,
    viewMode: 'list'
  };
}

export function syncBrowserState(
  state: BrowserState,
  checks: readonly DisplayCheck[]
): BrowserState {
  if (checks.length === 0) {
    return {
      ...state,
      selectedCheckIndex: 0
    };
  }

  return {
    ...state,
    selectedCheckIndex: clampSelectedIndex(state.selectedCheckIndex, checks.length)
  };
}

export function moveBrowserSelection(
  state: BrowserState,
  checks: readonly DisplayCheck[],
  direction: -1 | 1
): BrowserState {
  if (checks.length === 0) {
    return {
      ...state,
      selectedCheckIndex: 0
    };
  }

  const currentIndex = clampSelectedIndex(state.selectedCheckIndex, checks.length);
  const nextIndex = clampSelectedIndex(currentIndex + direction, checks.length);

  return {
    ...state,
    selectedCheckIndex: nextIndex
  };
}

export function toggleBrowserViewMode(state: BrowserState): BrowserState {
  return {
    ...state,
    viewMode: state.viewMode === 'detail' ? 'list' : 'detail'
  };
}

function setBrowserViewMode(state: BrowserState, viewMode: SectionViewMode): BrowserState {
  return {
    ...state,
    viewMode
  };
}

function getSelectedCheck(
  checks: readonly DisplayCheck[],
  browser: BrowserState
): DisplayCheck | null {
  if (checks.length === 0) {
    return null;
  }

  const index = clampSelectedIndex(browser.selectedCheckIndex, checks.length);
  return checks[index] ?? null;
}

function buildChecksPaneTitle(checks: readonly DisplayCheck[], browser: BrowserState): string {
  if (checks.length === 0) {
    return 'Checks';
  }

  const selectedIndex = clampSelectedIndex(browser.selectedCheckIndex, checks.length);
  return `Checks (${selectedIndex + 1} of ${checks.length})`;
}

function formatCheckTitle(
  check: DisplayCheck,
  checkTitles: Record<string, string>
): string {
  return checkTitles[check.id] ?? check.id;
}

export function formatCheckListLabel(
  check: DisplayCheck,
  checkTitles: Record<string, string>
): string {
  return `${formatCheckTitle(check, checkTitles)} (${formatCheckIdDisplay(check.id)})`;
}

export function formatStatusMarker(
  status: CheckDisplayStatus,
  runningIndicatorFrame: string = RUNNING_SPINNER_FRAMES[0]
): string {
  if (status === 'running' || status === 'fixing') {
    return `[${runningIndicatorFrame}]`;
  }

  return STATUS_MARKERS[status];
}

export function buildCheckListEntryDisplay(
  check: DisplayCheck,
  checkTitles: Record<string, string>,
  options: {runningIndicatorFrame: string}
): {
  marker: string;
  statusColor: string;
  title: string;
  idLabel: string;
  label: string;
} {
  const title = formatCheckTitle(check, checkTitles);
  const idLabel = formatCheckIdDisplay(check.id);

  return {
    marker: formatStatusMarker(check.status, options.runningIndicatorFrame),
    statusColor: STATUS_COLORS[check.status],
    title,
    idLabel,
    label: `${title} (${idLabel})`
  };
}

function getRunningIndicatorFrame(elapsedMs: number): string {
  const frameIndex = Math.floor(elapsedMs / RUNNING_SPINNER_INTERVAL_MS) % RUNNING_SPINNER_FRAMES.length;
  return RUNNING_SPINNER_FRAMES[frameIndex] ?? RUNNING_SPINNER_FRAMES[0];
}

export function formatCheckIdDisplay(checkId: string): string {
  const parts = checkId
    .split('-')
    .map(part => part.trim())
    .filter(Boolean);
  const numericIndex = parts.findIndex(part => /^\d+$/u.test(part));
  const visibleParts = numericIndex >= 0
    ? parts.slice(0, numericIndex + 1)
    : parts.slice(0, Math.min(parts.length, 3));

  return visibleParts.join('-').toUpperCase();
}

function formatConfidence(value: CheckResult['confidence']): string {
  return value.slice(0, 1) + value.slice(1).toLowerCase();
}

function getOutcomeLabel(status: CheckDisplayStatus): string {
  switch (status) {
    case 'pending':
      return 'What Is Pending';
    case 'running':
      return 'What Is Running';
    case 'fixing':
      return 'What Is Being Fixed';
    case 'fail':
      return 'What Failed';
    case 'unknown':
      return 'What Needs Review';
    case 'pass':
      return 'What Passed';
  }
}

function formatOutcome(check: DisplayCheck): string {
  if (check.status === 'fixing') {
    return 'Check is currently being fixed.';
  }

  if (check.status === 'running') {
    return 'Check is currently running.';
  }

  if (!check.result) {
    return 'Check is pending execution.';
  }

  switch (check.result.status) {
    case 'fail':
      return `Returned FAIL with ${formatConfidence(check.result.confidence)} confidence.`;
    case 'unknown':
      return `Returned INCONCLUSIVE with ${formatConfidence(check.result.confidence)} confidence.`;
    case 'pass':
      return `Returned PASS with ${formatConfidence(check.result.confidence)} confidence.`;
  }
}

function renderMultilineText(value: string): React.ReactNode {
  return (
    <Box flexDirection="column">
      {splitMultilineText(value).map((line, index) => (
        <Text key={`text-${index}`}>{line}</Text>
      ))}
    </Box>
  );
}

function splitMultilineText(value: string): string[] {
  return value.split(/\r?\n/u).map(line => line || ' ');
}

export function parseEvidenceLocation(value: string): EvidenceLocation | null {
  const match = /^(?<file>.+?):(?<start>\d+)(?::\d+)?(?:-(?<end>\d+)(?::\d+)?)?$/u.exec(value.trim());
  if (!match?.groups?.file || !match.groups.start) {
    return null;
  }

  const startLine = Number.parseInt(match.groups.start, 10);
  const endLine = Number.parseInt(match.groups.end ?? match.groups.start, 10);
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
    return null;
  }

  return {
    filePath: match.groups.file,
    startLine: Math.max(1, Math.min(startLine, endLine)),
    endLine: Math.max(1, Math.max(startLine, endLine))
  };
}

export function resolveEvidenceWindow(
  location: EvidenceLocation,
  totalLines: number
): {startLine: number; endLine: number} | null {
  const span = location.endLine - location.startLine + 1;
  if (span > 3) {
    return null;
  }

  if (span === 1) {
    return {
      startLine: Math.max(1, location.startLine - 1),
      endLine: Math.min(totalLines, location.endLine + 1)
    };
  }

  return {
    startLine: Math.max(1, location.startLine),
    endLine: Math.min(totalLines, location.endLine)
  };
}

async function buildEvidencePreview(
  evidence: string,
  repoPath: string
): Promise<EvidencePreview> {
  const location = parseEvidenceLocation(evidence);
  if (!location) {
    return {
      raw: evidence,
      location: null,
      displayLabel: evidence,
      lines: null
    };
  }

  try {
    const fileContents = await fs.readFile(path.resolve(repoPath, location.filePath), 'utf8');
    const sourceLines = fileContents.split(/\r?\n/u);
    const window = resolveEvidenceWindow(location, sourceLines.length);

    return {
      raw: evidence,
      location,
      displayLabel: formatEvidenceLabel(location),
      lines: window
        ? buildPreviewLines(sourceLines, window.startLine, window.endLine)
        : null
    };
  } catch {
    return {
      raw: evidence,
      location,
      displayLabel: formatEvidenceLabel(location),
      lines: null
    };
  }
}

function buildEvidenceFallbackPreviews(evidence: string[]): EvidencePreview[] {
  return evidence.map(item => {
    const location = parseEvidenceLocation(item);
    return {
      raw: item,
      location,
      displayLabel: location ? formatEvidenceLabel(location) : item,
      lines: null
    };
  });
}

function buildPreviewLines(
  sourceLines: string[],
  startLine: number,
  endLine: number
): Array<{number: number; text: string}> {
  const lines: Array<{number: number; text: string}> = [];

  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    lines.push({
      number: lineNumber,
      text: sourceLines[lineNumber - 1] ?? ''
    });
  }

  return lines;
}

function formatEvidenceLabel(location: EvidenceLocation): string {
  return location.startLine === location.endLine
    ? `${location.filePath}:${location.startLine}`
    : `${location.filePath}:${location.startLine}-${location.endLine}`;
}

export function buildProgressSegments(options: {
  failedCount: number;
  unknownCount: number;
  passedCount: number;
  inProgressCount: number;
  pendingCount: number;
  width: number;
}): Array<{key: string; text: string; color: string; backgroundColor: string}> {
  const total = (
    options.failedCount +
    options.unknownCount +
    options.passedCount +
    options.inProgressCount +
    options.pendingCount
  );

  if (total <= 0) {
    return [
      {
        key: 'empty',
        text: ' '.repeat(options.width),
        color: 'black',
        backgroundColor: 'gray'
      }
    ];
  }

  const rawSegments = [
    {key: 'failed', count: options.failedCount, color: 'redBright', backgroundColor: 'red'},
    {key: 'unknown', count: options.unknownCount, color: 'yellowBright', backgroundColor: 'yellow'},
    {key: 'passed', count: options.passedCount, color: 'greenBright', backgroundColor: 'green'},
    {key: 'running', count: options.inProgressCount, color: 'black', backgroundColor: 'whiteBright'},
    {key: 'pending', count: options.pendingCount, color: 'gray', backgroundColor: 'blackBright'}
  ];

  let consumedCount = 0;
  let consumedWidth = 0;

  return rawSegments.map((segment, index) => {
    consumedCount += segment.count;
    const targetWidth = index === rawSegments.length - 1
      ? options.width
      : Math.round((consumedCount / total) * options.width);
    const width = Math.max(0, targetWidth - consumedWidth);
    consumedWidth += width;

    return {
      key: segment.key,
      text: width > 0 ? ' '.repeat(width) : '',
      color: segment.color,
      backgroundColor: segment.backgroundColor
    };
  });
}

export function deriveProgressCounts(options: {
  isScanComplete: boolean;
  totalChecks: number;
  completedCount: number;
  runningCheckIds: string[];
}): {inProgressCount: number; pendingCount: number} {
  if (options.isScanComplete) {
    return {
      inProgressCount: 0,
      pendingCount: 0
    };
  }

  const inProgressCount = new Set(options.runningCheckIds).size;
  const pendingCount = Math.max(0, options.totalChecks - options.completedCount - inProgressCount);

  return {
    inProgressCount,
    pendingCount
  };
}

export function getScrollPageDelta(viewportHeight: number): number {
  return Math.max(3, viewportHeight - 3);
}

export function resolveVisibleItemScrollOffset(
  metrics: ScrollVisibilityMetrics | null,
  itemIndex: number
): number | null {
  if (!metrics) {
    return null;
  }

  const position = metrics.getItemPosition(itemIndex);
  if (!position) {
    return null;
  }

  const viewportHeight = metrics.getViewportHeight();
  if (viewportHeight <= 0 || position.height <= 0) {
    return null;
  }

  const viewportTop = metrics.getScrollOffset();
  const viewportBottom = viewportTop + viewportHeight;
  const itemBottom = position.top + position.height;

  if (position.height >= viewportHeight) {
    return position.top;
  }

  if (position.top < viewportTop) {
    return position.top;
  }

  if (itemBottom > viewportBottom) {
    return Math.max(0, itemBottom - viewportHeight);
  }

  return null;
}

export function findFirstVisibleItemIndex(
  metrics: Pick<ScrollVisibilityMetrics, 'getItemPosition'> | null,
  itemCount: number,
  scrollOffset: number
): number | null {
  if (!metrics || itemCount <= 0) {
    return null;
  }

  let lastMeasuredIndex: number | null = null;

  for (let index = 0; index < itemCount; index += 1) {
    const position = metrics.getItemPosition(index);
    if (!position || position.height <= 0) {
      continue;
    }

    lastMeasuredIndex = index;
    if (position.top + position.height > scrollOffset) {
      return index;
    }
  }

  return lastMeasuredIndex;
}

export function resolvePagedListNavigation(options: {
  metrics: ScrollPageMetrics | null;
  itemCount: number;
  currentIndex: number;
  direction: -1 | 1;
}): {selectedIndex: number; scrollOffset: number} | null {
  if (!options.metrics || options.itemCount <= 0) {
    return null;
  }

  const viewportHeight = options.metrics.getViewportHeight();
  if (viewportHeight <= 0) {
    return null;
  }

  const pageDelta = getScrollPageDelta(viewportHeight);
  const targetOffset = clampOffset(
    options.metrics.getScrollOffset() + (options.direction * pageDelta),
    options.metrics.getBottomOffset()
  );
  const visibleIndex = findFirstVisibleItemIndex(options.metrics, options.itemCount, targetOffset);

  return {
    selectedIndex: visibleIndex ?? clampSelectedIndex(options.currentIndex, options.itemCount),
    scrollOffset: targetOffset
  };
}

function clampSelectedIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(itemCount - 1, index));
}

function clampSelectableIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(itemCount - 1, index));
}

function moveWrappingIndex(index: number, itemCount: number, direction: -1 | 1): number {
  if (itemCount <= 0) {
    return 0;
  }

  const currentIndex = clampSelectableIndex(index, itemCount);
  return direction < 0
    ? (currentIndex <= 0 ? itemCount - 1 : currentIndex - 1)
    : (currentIndex >= itemCount - 1 ? 0 : currentIndex + 1);
}

function resolveDefaultEmptyScopeFallbackOptionIndex(context: EmptyScopeFallbackContext): number {
  const options = buildEmptyScopeFallbackOptions(context);
  const defaultAction = resolveDefaultEmptyScopeFallbackAction();
  const selectedIndex = options.findIndex(option => option.action === defaultAction);
  return selectedIndex >= 0 ? selectedIndex : 0;
}

function clampOffset(offset: number, bottomOffset: number): number {
  return Math.max(0, Math.min(bottomOffset, offset));
}

function isHelpInput(input: string): boolean {
  return HELP_INPUTS.has(input.toLowerCase());
}

export function resolveEscapeKeyAction(options: {
  showExitConfirm: boolean;
  showHelp: boolean;
  viewMode: SectionViewMode;
  isScanComplete: boolean;
}): EscapeKeyAction {
  if (options.showExitConfirm) {
    return 'dismiss-exit-confirm';
  }

  if (!options.showHelp && options.viewMode === 'detail') {
    return 'back-to-list';
  }

  return options.isScanComplete ? 'exit' : 'prompt-exit-confirm';
}

export function resolveVerticalArrowAction(options: {
  reportReady: boolean;
  showHelp: boolean;
  viewMode: SectionViewMode;
}): VerticalArrowAction {
  if (!options.reportReady || options.showHelp || options.viewMode === 'detail') {
    return 'scroll';
  }

  return 'navigate';
}

function buildFooterText(options: {
  confirmationDialogKind: ConfirmationDialogKind | null;
  showEmptyScopeFallbackDialog: boolean;
  showHelp: boolean;
  viewMode: SectionViewMode;
  reportReady: boolean;
}): string {
  if (options.confirmationDialogKind === 'exit') {
    return '[ESC] Stay | [ARROWS] Select | [ENTER] Confirm';
  }

  if (options.showEmptyScopeFallbackDialog) {
    return '[ESC] Skip scan | [UP/DOWN] Select | [ENTER] Confirm';
  }

  if (options.showHelp) {
    return '[ESC] Exit ';
  }

  if (options.viewMode === 'detail') {
    return options.reportReady
      ? '[ESC] List | [UP/DOWN] Scroll | [<- / ->] Check | [R] Recheck | [F] Fix | [ENTER] List'
      : '[ESC] List | [UP/DOWN] Scroll | [<- / ->] Check | [ENTER] List';
  }

  return options.reportReady
    ? '[ESC] Exit | [ARROWS] Navigate | [PGUP/PGDN] Page | [R] Recheck | [F] Fix | [ENTER] Details'
    : '[ESC] Exit | [ARROWS] Navigate | [PGUP/PGDN] Page | [ENTER] Details';
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function isNoChangesInScopeError(error: unknown): boolean {
  return error instanceof CliError && error.code === 'NO_CHANGES_IN_SCOPE';
}

function formatRequestedParallelism(value: number | 'auto' | 'full'): string {
  return typeof value === 'number' ? String(value) : value;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (maxLength < 5 || value.length <= maxLength) {
    return value;
  }

  const sideLength = Math.floor((maxLength - 3) / 2);
  const start = value.slice(0, sideLength);
  const end = value.slice(value.length - sideLength);
  return `${start}...${end}`;
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 10_000 ? 0 : 1
  }).format(value).replace('k', 'K');
}
