import fs from 'node:fs/promises';
import path from 'node:path';
import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import {ScrollView, type ScrollViewRef} from 'ink-scroll-view';
import {readCheckTitle} from '../lib/checks.js';
import {runScan} from '../lib/scan.js';
import type {
  CheckResult,
  CheckStatus,
  ScanCommandOptions,
  ScanProgressEvent,
  ScanReport,
  ScanRuntimeEvent
} from '../lib/types.js';

type SectionViewMode = 'detail' | 'list';
type CheckDisplayStatus = CheckStatus | 'pending' | 'running';
type ExitConfirmationChoice = 'yes' | 'no';
export type EscapeKeyAction = 'dismiss-exit-confirm' | 'back-to-list' | 'prompt-exit-confirm' | 'exit';
export type VerticalArrowAction = 'scroll' | 'navigate';

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
  fail: 'FAIL',
  unknown: 'INCONCLUSIVE',
  pass: 'PASS'
};

const RUNNING_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const RUNNING_SPINNER_INTERVAL_MS = 160;

const STATUS_MARKERS: Record<CheckDisplayStatus, string> = {
  pending: '[ ]',
  running: `[${RUNNING_SPINNER_FRAMES[0]}]`,
  fail: '[x]',
  unknown: '[~]',
  pass: '[v]'
};

const STATUS_COLORS: Record<CheckDisplayStatus, string> = {
  pending: 'gray',
  running: 'whiteBright',
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

export function runScanWithInk(options: ScanCommandOptions): Promise<ScanReport> {
  return new Promise<ScanReport>((resolve, reject) => {
    let finalReport: ScanReport | null = null;
    let finalError: Error | null = null;

    const instance = render(
      <ScanApp
        options={options}
        onDone={report => {
          finalReport = report;
        }}
        onCancel={() => {
          finalError = new ScanUiCancelledError();
        }}
        onError={error => {
          finalError = error;
        }}
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

        if (finalReport) {
          resolve(finalReport);
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

function ScanApp(props: {
  options: ScanCommandOptions;
  onDone: (report: ScanReport) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const detailScrollRef = useRef<ScrollViewRef>(null);
  const listScrollRef = useRef<ScrollViewRef>(null);
  const startedAtRef = useRef(Date.now());
  const finishedAtRef = useRef<number | null>(null);
  const [progress, setProgress] = useState<ProgressViewState>(createProgressViewState());
  const [streamedReportState, setStreamedReportState] = useState<StreamedReportState>(
    createStreamedReportState()
  );
  const [tokenUsage, setTokenUsage] = useState<TokenUsageState>(createTokenUsageState());
  const [report, setReport] = useState<ScanReport | null>(null);
  const [browser, setBrowser] = useState<BrowserState>(createInitialBrowserState(null));
  const [checkTitles, setCheckTitles] = useState<Record<string, string>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [exitConfirmChoice, setExitConfirmChoice] = useState<ExitConfirmationChoice>('no');
  const [exitAfterDismiss, setExitAfterDismiss] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const terminalWidth = stdout.columns || 80;
  const terminalHeight = Math.max(12, (stdout.rows || 24) - 1);
  const displayChecks = buildDisplayChecks({
    checkIds: progress.checkIds,
    runningCheckIds: progress.runningCheckIds,
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
  const totalChecks = report?.summary.total_checks ?? progress.totalChecks;
  const {inProgressCount, pendingCount} = deriveProgressCounts({
    isScanComplete,
    totalChecks,
    completedCount: progress.completedCount,
    runningCheckIds: progress.runningCheckIds
  });
  const metricWidth = Math.max(14, Math.floor((terminalWidth - 12) / 4));
  const progressBarWidth = Math.max(24, terminalWidth - 8);
  const metricValueWidth = Math.max(8, metricWidth - 2);
  const targetLabel = truncateMiddle(report?.repo.path ?? props.options.repoPath, metricValueWidth);
  const scopeLabel = progress.scopeLabel;
  const tokenLabel = `${formatTokenCount(tokenUsage.input)} / ${formatTokenCount(tokenUsage.output)}`;
  const parallelismLabel = report?.execution
    ? String(report.execution.effective_parallelism)
    : formatRequestedParallelism(props.options.parallelism);
  const footerText = buildFooterText({
    showExitConfirm,
    showHelp,
    viewMode: browser.viewMode
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
    props.onDone(completedReport);
    exit();
  };

  const dismissExitConfirm = () => {
    setShowExitConfirm(false);
    setExitConfirmChoice('no');
  };

  const confirmCancelExit = () => {
    dismissExitConfirm();
    setExitAfterDismiss(true);
  };

  useInput((input, key) => {
    const activeScrollRef = showHelp || browser.viewMode === 'detail'
      ? detailScrollRef.current
      : listScrollRef.current;

    if (showExitConfirm) {
      const normalizedInput = input.toLowerCase();

      if (key.escape || normalizedInput === 'n') {
        dismissExitConfirm();
        return;
      }

      if (normalizedInput === 'y') {
        confirmCancelExit();
        return;
      }

      if (key.leftArrow || key.upArrow) {
        setExitConfirmChoice('yes');
        return;
      }

      if (key.rightArrow || key.downArrow) {
        setExitConfirmChoice('no');
        return;
      }

      if (key.return) {
        if (exitConfirmChoice === 'yes') {
          confirmCancelExit();
        } else {
          dismissExitConfirm();
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
        setShowExitConfirm(true);
        setExitConfirmChoice('no');
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

    if (key.return) {
      setBrowser(previous => toggleBrowserViewMode(previous));
    }
  });

  useEffect(() => {
    if (report) {
      return undefined;
    }

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, RUNNING_SPINNER_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [report]);

  useEffect(() => {
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
          streamedResultsByCheckId: streamedReportState.resultsByCheckId,
          reportChecks: completedReport.checks
        })));
      } catch (error) {
        if (!active) {
          return;
        }

        props.onError(error instanceof Error ? error : new Error(String(error)));
        exit();
      }
    })();

    return () => {
      active = false;
    };
  }, [exit, props.onError, props.options]);

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

    dismissExitConfirm();
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
                scrollRef={listScrollRef}
              />
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{footerText}</Text>
        </Box>
      </Box>
      {showExitConfirm ? (
        <ExitConfirmationDialog
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          selectedChoice={exitConfirmChoice}
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
            runningIndicatorFrame: props.runningIndicatorFrame
          })}
        </ScrollView>
      </Box>
    </Module>
  );
}

function ExitConfirmationDialog(props: {
  terminalWidth: number;
  terminalHeight: number;
  selectedChoice: ExitConfirmationChoice;
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
}): React.ReactNode {
  if (props.checks.length === 0) {
    return (
      <Text key="empty-check-list" color="gray">
        {props.isScanComplete ? 'No checks in this report.' : 'Checks will appear when scope resolves.'}
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
    statusLabel: 'Preparing scan'
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
    runningCheckIds: [...event.runningCheckIds]
  };

  switch (event.type) {
    case 'scope-resolved':
      next.statusLabel = 'Scope resolved';
      return next;
    case 'no-changes-in-scope':
      next.statusLabel = 'No files matched the selected scope';
      return next;
    case 'check-started':
      next.statusLabel = event.checkId ? `Running ${event.checkId}` : 'Running check';
      return next;
    case 'check-completed':
      next.statusLabel = event.checkId && event.checkStatus
        ? `Completed ${event.checkId} (${event.checkStatus})`
        : 'Check completed';
      return next;
    default:
      return next;
  }
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
    statusLabel: 'Scan complete'
  };
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
  streamedResultsByCheckId: Record<string, CheckResult>;
  reportChecks: CheckResult[] | undefined;
}): DisplayCheck[] {
  const reportById = new Map((options.reportChecks ?? []).map(check => [check.id, check] as const));
  const runningCheckIds = new Set(options.runningCheckIds);
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
      status: result?.status ?? (runningCheckIds.has(checkId) ? 'running' : 'pending'),
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
  if (status === 'running') {
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
    case 'fail':
      return 'What Failed';
    case 'unknown':
      return 'What Needs Review';
    case 'pass':
      return 'What Passed';
  }
}

function formatOutcome(check: DisplayCheck): string {
  if (!check.result) {
    return check.status === 'running'
      ? 'Check is currently running.'
      : 'Check is pending execution.';
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

  const inProgressCount = options.runningCheckIds.length;
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
  showExitConfirm: boolean;
  showHelp: boolean;
  viewMode: SectionViewMode;
}): string {
  if (options.showExitConfirm) {
    return '[ESC] Stay | [ARROWS] Select | [ENTER] Confirm';
  }

  if (options.showHelp) {
    return '[ESC] Exit ';
  }

  if (options.viewMode === 'detail') {
    return '[ESC] List | [UP/DOWN] Scroll | [<- / ->] Check | [ENTER] List';
  }

  return '[ESC] Exit | [ARROWS] Navigate | [PGUP/PGDN] Page | [ENTER] Details';
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatRequestedParallelism(value: number | 'auto'): string {
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
