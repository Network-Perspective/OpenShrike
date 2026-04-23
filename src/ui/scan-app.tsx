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

export interface ScanSection {
  status: CheckStatus;
  title: string;
  items: CheckResult[];
}

export interface BrowserState {
  activeStatus: CheckStatus;
  selectedByStatus: Record<CheckStatus, number>;
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

interface SectionModuleProps {
  section: ScanSection;
  browser: BrowserState;
  count: number;
  isScanComplete: boolean;
  checkTitles: Record<string, string>;
  repoPath: string;
}

const SECTION_ORDER: readonly CheckStatus[] = ['fail', 'unknown', 'pass'];

const SECTION_LABELS: Record<CheckStatus, string> = {
  fail: 'Failed Checks',
  unknown: 'Inconclusive Checks',
  pass: 'Passed Checks'
};

const STATUS_BADGES: Record<CheckStatus, string> = {
  fail: 'FAIL',
  unknown: 'INCONCLUSIVE',
  pass: 'PASS'
};

const STATUS_MARKERS: Record<CheckStatus, string> = {
  fail: '[x]',
  unknown: '[~]',
  pass: '[ok]'
};

const STATUS_COLORS: Record<CheckStatus, string> = {
  fail: 'redBright',
  unknown: 'yellowBright',
  pass: 'greenBright'
};

const HELP_INPUTS = new Set(['\u001bop', '\u001b[[a', '\u001b[11~', '?']);

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
  const scrollRef = useRef<ScrollViewRef>(null);
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
  const [viewportHeight, setViewportHeight] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const terminalWidth = stdout.columns || 80;
  const terminalHeight = Math.max(12, (stdout.rows || 24) - 1);
  const streamedReport = buildStreamedReport(streamedReportState);
  const displayReport = report ?? streamedReport;
  const displayChecks = displayReport?.checks ?? [];
  const displayChecksKey = displayChecks
    .map(check => `${check.id}:${check.status}:${check.version}`)
    .join('\u0000');
  const sections = buildScanSections(displayReport);
  const activeSection = getActiveSection(sections, browser);
  const reportReady = displayReport !== null;
  const isScanComplete = report !== null;
  const durationMs = finishedAtRef.current === null
    ? elapsedMs
    : finishedAtRef.current - startedAtRef.current;
  const pendingCount = isScanComplete
    ? 0
    : Math.max(0, progress.totalChecks - progress.completedCount);
  const totalChecks = report?.summary.total_checks ?? progress.totalChecks;
  const metricWidth = Math.max(14, Math.floor((terminalWidth - 12) / 4));
  const progressBarWidth = Math.max(24, terminalWidth - 8);
  const metricValueWidth = Math.max(8, metricWidth - 2);
  const targetLabel = truncateMiddle(report?.repo.path ?? props.options.repoPath, metricValueWidth);
  const scopeLabel = progress.scopeLabel;
  const tokenLabel = `${formatTokenCount(tokenUsage.input)} / ${formatTokenCount(tokenUsage.output)}`;
  const parallelismLabel = report?.execution
    ? String(report.execution.effective_parallelism)
    : formatRequestedParallelism(props.options.parallelism);
  const footerText = showHelp
    ? '[ESC] Exit | [F1] Help'
    : '[ESC] Exit | [F1] Help | [ARROWS] Navigate | [ENTER] Details or List';

  useInput((input, key) => {
    if (isHelpInput(input)) {
      setShowHelp(previous => !previous);
      scrollRef.current?.scrollToTop();
      return;
    }

    if (key.escape) {
      if (report) {
        props.onDone(report);
        exit();
      } else {
        props.onCancel();
        process.exitCode = 130;
        exit();
        setImmediate(() => {
          process.exit(130);
        });
      }

      return;
    }

    if (key.upArrow) {
      scrollRef.current?.scrollBy(-1);
      return;
    }

    if (key.downArrow) {
      scrollRef.current?.scrollBy(1);
      return;
    }

    if (key.pageUp) {
      scrollRef.current?.scrollBy(-Math.max(3, viewportHeight - 3));
      return;
    }

    if (key.pageDown) {
      scrollRef.current?.scrollBy(Math.max(3, viewportHeight - 3));
      return;
    }

    if (key.home) {
      scrollRef.current?.scrollToTop();
      return;
    }

    if (key.end) {
      scrollRef.current?.scrollToBottom();
      return;
    }

    if (!reportReady || showHelp) {
      return;
    }

    if (key.leftArrow) {
      setBrowser(previous => moveBrowserSelection(previous, sections, -1));
      return;
    }

    if (key.rightArrow) {
      setBrowser(previous => moveBrowserSelection(previous, sections, 1));
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
    }, 250);

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
        setBrowser(previous => syncBrowserState(previous, completedReport));
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

    setBrowser(previous => syncBrowserState(previous, displayReport));
  }, [displayChecksKey, reportReady]);

  useEffect(() => {
    const handleResize = () => {
      scrollRef.current?.remeasure();
      if (!showHelp && reportReady) {
        ensureActiveSectionVisible(scrollRef.current, browser.activeStatus);
      }
    };

    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [browser.activeStatus, reportReady, showHelp, stdout]);

  useEffect(() => {
    if (showHelp) {
      scrollRef.current?.scrollToTop();
      return;
    }

    if (reportReady) {
      ensureActiveSectionVisible(scrollRef.current, browser.activeStatus);
    }
  }, [browser.activeStatus, browser.viewMode, reportReady, showHelp]);

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
        <Box flexGrow={1} overflow="hidden" marginTop={1}>
          <ScrollView
            ref={scrollRef}
            flexDirection="column"
            width="100%"
            height="100%"
            onViewportSizeChange={size => {
              setViewportHeight(size.height);
            }}
          >
            {showHelp ? (
              <HelpModule key="help" />
            ) : (
              <>
                <SummaryModule
                  key="summary"
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
                  pendingCount={pendingCount}
                />
                {sections.map(section => (
                  <SectionModule
                    key={section.status}
                    section={section}
                    browser={browser}
                    count={getSectionCount(section.status, report, progress)}
                    isScanComplete={isScanComplete}
                    checkTitles={checkTitles}
                    repoPath={report?.repo.path ?? path.resolve(props.options.repoPath)}
                  />
                ))}
              </>
            )}
          </ScrollView>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">{footerText}</Text>
        </Box>
      </Box>
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
  pendingCount: number;
}) {
  const progressSegments = buildProgressSegments({
    failedCount: props.failedCount,
    unknownCount: props.unknownCount,
    passedCount: props.passedCount,
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
          pendingCount={props.pendingCount}
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

function SectionModule(props: SectionModuleProps) {
  const isActive = props.section.status === props.browser.activeStatus;
  const borderColor = isActive ? 'cyan' : 'gray';
  const titleColor = STATUS_COLORS[props.section.status];
  const title = buildSectionTitle(props.section, props.browser, props.count);
  const shouldRenderDetail = (
    isActive &&
    props.browser.viewMode === 'detail' &&
    props.section.items.length > 0
  );

  return (
    <Module borderColor={borderColor} marginBottom={1}>
      <Box justifyContent="space-between" gap={1}>
        <Text color={titleColor} bold={isActive}>
          {title}
        </Text>
        {isActive && props.count > 0 ? (
          <Text color="gray">
            {'<- Prev | Next -> | [L]ist | [D]etails'}
          </Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {shouldRenderDetail ? (
          <DetailView
            check={getSelectedCheck(props.section, props.browser)!}
            checkTitles={props.checkTitles}
            repoPath={props.repoPath}
          />
        ) : (
          <ListView
            section={props.section}
            browser={props.browser}
            count={props.count}
            isScanComplete={props.isScanComplete}
            checkTitles={props.checkTitles}
          />
        )}
      </Box>
    </Module>
  );
}

function DetailView(props: {
  check: CheckResult;
  checkTitles: Record<string, string>;
  repoPath: string;
}) {
  const title = formatCheckTitle(props.check, props.checkTitles);
  const shortId = formatCheckIdDisplay(props.check.id);
  const outcomeLabel = getOutcomeLabel(props.check.status);

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={STATUS_COLORS[props.check.status]} bold>
          [{STATUS_BADGES[props.check.status]}]
        </Text>
        <Text>[Confidence: {formatConfidence(props.check.confidence)}]</Text>
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
        {renderMultilineText(props.check.rationale)}
      </DetailBlock>

      <DetailBlock label="Evidence">
        <EvidenceBlock evidence={props.check.evidence} repoPath={props.repoPath} />
      </DetailBlock>

      <DetailBlock label="Remediation">
        {props.check.remediation.length > 0 ? (
          <Box flexDirection="column">
            {props.check.remediation.map((item, index) => (
              <Text key={`${props.check.id}-remediation-${index}`}>- {item}</Text>
            ))}
          </Box>
        ) : (
          <Text>No remediation provided.</Text>
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

function ListView(props: {
  section: ScanSection;
  browser: BrowserState;
  count: number;
  isScanComplete: boolean;
  checkTitles: Record<string, string>;
}) {
  if (props.section.items.length === 0) {
    return (
      <Text color="gray">
        {props.isScanComplete
          ? `No ${props.section.title.toLowerCase()} in this report.`
          : `No ${props.section.title.toLowerCase()} yet.`}
      </Text>
    );
  }

  const selectedIndex = clampSelectedIndex(
    props.browser.selectedByStatus[props.section.status],
    props.section.items.length
  );

  return (
    <Box flexDirection="column">
      {props.section.items.map((check, index) => {
        const isActiveRow = props.section.status === props.browser.activeStatus && selectedIndex === index;
        const prefix = isActiveRow ? '>' : ' ';
        const shortId = formatCheckIdDisplay(check.id);
        const title = formatCheckTitle(check, props.checkTitles);

        return (
          <Box key={check.id} flexDirection="row" flexWrap="wrap">
            <Text color={isActiveRow ? 'cyanBright' : 'gray'}>{`${prefix} `}</Text>
            <Text color={STATUS_COLORS[check.status]}>{`${STATUS_MARKERS[check.status]} `}</Text>
            <Text color="gray">{`${shortId}: `}</Text>
            <Text bold={isActiveRow}>{title}</Text>
          </Box>
        );
      })}
    </Box>
  );
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
        <Text>Left / Right: move to the previous or next check.</Text>
        <Text>Up / Down: scroll the report one line at a time.</Text>
        <Text>Page Up / Page Down: scroll the report by a page.</Text>
        <Text>D: open detail view for the current check.</Text>
        <Text>L: switch detail view back to list view.</Text>
        <Text>Enter: toggle between detail and list for the current section.</Text>
        <Text>Esc: exit the scan UI.</Text>
        <Text>F1: toggle this help screen.</Text>
      </Box>
    </Module>
  );
}

function Module(props: {
  borderColor: string;
  marginBottom?: number | undefined;
  children: React.ReactNode;
}) {
  return (
    <Box
      borderStyle="round"
      borderColor={props.borderColor}
      paddingX={1}
      paddingY={0}
      marginBottom={props.marginBottom}
      flexDirection="column"
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
  pendingCount: number;
}) {
  return (
    <Box flexWrap="wrap">
      <ScoreCell label={`${props.failedCount} Failed`} color="redBright" width={props.cellWidth} />
      <ScoreCell label={`${props.unknownCount} Inconclusive`} color="yellowBright" width={props.cellWidth} />
      <ScoreCell label={`${props.passedCount} Passed`} color="greenBright" width={props.cellWidth} />
      <ScoreCell label={`${props.pendingCount} Pending`} color="gray" width={props.cellWidth} />
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

export function createInitialBrowserState(report: Pick<ScanReport, 'checks'> | null): BrowserState {
  const sections = buildScanSections(report);
  const firstNonEmptySection = sections.find(section => section.items.length > 0);

  return {
    activeStatus: firstNonEmptySection?.status ?? 'fail',
    selectedByStatus: {
      fail: 0,
      unknown: 0,
      pass: 0
    },
    viewMode: 'detail'
  };
}

export function syncBrowserState(
  state: BrowserState,
  report: Pick<ScanReport, 'checks'> | null
): BrowserState {
  const sections = buildScanSections(report);
  const firstNonEmptySection = sections.find(section => section.items.length > 0);
  if (!firstNonEmptySection) {
    return state;
  }

  const selectedByStatus = {
    fail: clampSelectedIndex(
      state.selectedByStatus.fail,
      sections.find(section => section.status === 'fail')!.items.length
    ),
    unknown: clampSelectedIndex(
      state.selectedByStatus.unknown,
      sections.find(section => section.status === 'unknown')!.items.length
    ),
    pass: clampSelectedIndex(
      state.selectedByStatus.pass,
      sections.find(section => section.status === 'pass')!.items.length
    )
  };
  const activeSection = sections.find(section => section.status === state.activeStatus);

  return {
    ...state,
    activeStatus: activeSection && activeSection.items.length > 0
      ? activeSection.status
      : firstNonEmptySection.status,
    selectedByStatus
  };
}

export function moveBrowserSelection(
  state: BrowserState,
  sections: readonly ScanSection[],
  direction: -1 | 1
): BrowserState {
  const nonEmptySections = sections.filter(section => section.items.length > 0);
  if (nonEmptySections.length === 0) {
    return state;
  }

  const currentStatus = nonEmptySections.some(section => section.status === state.activeStatus)
    ? state.activeStatus
    : nonEmptySections[0]!.status;
  const currentSectionIndex = nonEmptySections.findIndex(section => section.status === currentStatus);
  const currentSection = nonEmptySections[currentSectionIndex]!;
  const currentIndex = clampSelectedIndex(
    state.selectedByStatus[currentStatus],
    currentSection.items.length
  );

  if (direction === 1) {
    if (currentIndex < currentSection.items.length - 1) {
      return {
        ...state,
        activeStatus: currentStatus,
        selectedByStatus: {
          ...state.selectedByStatus,
          [currentStatus]: currentIndex + 1
        }
      };
    }

    const nextSection = nonEmptySections[currentSectionIndex + 1];
    if (!nextSection) {
      return state;
    }

    return {
      ...state,
      activeStatus: nextSection.status,
      selectedByStatus: {
        ...state.selectedByStatus,
        [currentStatus]: currentIndex,
        [nextSection.status]: 0
      }
    };
  }

  if (currentIndex > 0) {
    return {
      ...state,
      activeStatus: currentStatus,
      selectedByStatus: {
        ...state.selectedByStatus,
        [currentStatus]: currentIndex - 1
      }
    };
  }

  const previousSection = nonEmptySections[currentSectionIndex - 1];
  if (!previousSection) {
    return state;
  }

  return {
    ...state,
    activeStatus: previousSection.status,
    selectedByStatus: {
      ...state.selectedByStatus,
      [currentStatus]: currentIndex,
      [previousSection.status]: Math.max(0, previousSection.items.length - 1)
    }
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

function getActiveSection(
  sections: readonly ScanSection[],
  browser: BrowserState
): ScanSection {
  return sections.find(section => section.status === browser.activeStatus) ?? sections[0]!;
}

function getSelectedCheck(
  section: ScanSection,
  browser: BrowserState
): CheckResult | null {
  if (section.items.length === 0) {
    return null;
  }

  const index = clampSelectedIndex(browser.selectedByStatus[section.status], section.items.length);
  return section.items[index] ?? null;
}

function getSectionCount(
  status: CheckStatus,
  report: ScanReport | null,
  progress: ProgressViewState
): number {
  if (report) {
    switch (status) {
      case 'fail':
        return report.summary.failed;
      case 'unknown':
        return report.summary.unknown;
      case 'pass':
        return report.summary.passed;
    }
  }

  switch (status) {
    case 'fail':
      return progress.failedCount;
    case 'unknown':
      return progress.unknownCount;
    case 'pass':
      return progress.passedCount;
  }
}

function buildSectionTitle(
  section: ScanSection,
  browser: BrowserState,
  count: number
): string {
  const isActive = section.status === browser.activeStatus;
  const prefix = isActive ? '> ' : '';

  if (!isActive || count === 0) {
    return `${prefix}${section.title} (${count})`;
  }

  const selectedIndex = clampSelectedIndex(browser.selectedByStatus[section.status], count);
  return `${prefix}${section.title} (${selectedIndex + 1} of ${count})`;
}

function formatCheckTitle(
  check: CheckResult,
  checkTitles: Record<string, string>
): string {
  return checkTitles[check.id] ?? check.id;
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

function getOutcomeLabel(status: CheckStatus): string {
  switch (status) {
    case 'fail':
      return 'What Failed';
    case 'unknown':
      return 'What Needs Review';
    case 'pass':
      return 'What Passed';
  }
}

function formatOutcome(check: CheckResult): string {
  switch (check.status) {
    case 'fail':
      return `Returned FAIL with ${formatConfidence(check.confidence)} confidence.`;
    case 'unknown':
      return `Returned INCONCLUSIVE with ${formatConfidence(check.confidence)} confidence.`;
    case 'pass':
      return `Returned PASS with ${formatConfidence(check.confidence)} confidence.`;
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

function buildProgressSegments(options: {
  failedCount: number;
  unknownCount: number;
  passedCount: number;
  pendingCount: number;
  width: number;
}): Array<{key: string; text: string; color: string; backgroundColor: string}> {
  const total = (
    options.failedCount +
    options.unknownCount +
    options.passedCount +
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

function ensureActiveSectionVisible(
  ref: ScrollViewRef | null,
  activeStatus: CheckStatus
): void {
  if (!ref) {
    return;
  }

  const targetIndex = 1 + SECTION_ORDER.indexOf(activeStatus);
  const position = ref.getItemPosition(targetIndex);
  if (!position) {
    return;
  }

  const viewportTop = ref.getScrollOffset();
  const viewportBottom = viewportTop + ref.getViewportHeight();
  if (position.top < viewportTop) {
    ref.scrollTo(position.top);
    return;
  }

  if (position.top + position.height > viewportBottom) {
    ref.scrollTo(Math.max(0, position.top + position.height - ref.getViewportHeight()));
  }
}

function clampSelectedIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(itemCount - 1, index));
}

function isHelpInput(input: string): boolean {
  return HELP_INPUTS.has(input.toLowerCase());
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
