import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import {ScrollView, type ScrollViewRef} from 'ink-scroll-view';
import {runScan} from '../lib/scan.js';
import {
  createRuntimeStreamState,
  reduceRuntimeEvent,
  type RuntimeStreamItem,
  type RuntimeStreamState
} from '../lib/runtime-events.js';
import type {CheckStatus, ScanCommandOptions, ScanProgressEvent, ScanReport} from '../lib/types.js';

type CheckDisplayStatus = CheckStatus | 'running';

interface ProgressViewState {
  scopeLabel: string;
  scopeFileCount: number;
  scopeIsFullRepository: boolean;
  checkIndex: number;
  totalChecks: number;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  statusLabel: string;
  showDetails: boolean;
  passedChecks: string[];
  failedChecks: string[];
  unknownChecks: string[];
  checkOrder: string[];
  checkStatuses: Record<string, CheckDisplayStatus>;
  activeCheckId: string | null;
  selectedCheckIndex: number;
  followActiveCheck: boolean;
}

interface StreamLine {
  text: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
  kind: string;
}

export function runScanWithInk(options: ScanCommandOptions): Promise<ScanReport> {
  return new Promise<ScanReport>((resolve, reject) => {
    const instance = render(<ScanApp options={options} onSuccess={resolve} onError={reject} />, {
      stdout: process.stderr,
      exitOnCtrlC: true
    });

    instance.waitUntilExit().catch(error => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function ScanApp(props: {
  options: ScanCommandOptions;
  onSuccess: (report: ScanReport) => void;
  onError: (error: Error) => void;
}) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const streamRef = useRef<ScrollViewRef>(null);
  const activeCheckIdRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<ProgressViewState>(createProgressViewState());
  const [streamsByCheck, setStreamsByCheck] = useState<Record<string, RuntimeStreamState>>({});
  const [streamViewportHeight, setStreamViewportHeight] = useState(0);
  const [followStream, setFollowStream] = useState(true);

  const terminalWidth = Math.max(80, stdout.columns || 80);
  const terminalHeight = Math.max(16, (stdout.rows || 24) - 1);
  const gapWidth = 1;
  const leftWidth = Math.max(20, Math.floor((terminalWidth - gapWidth) / 2));
  const rightWidth = Math.max(20, terminalWidth - gapWidth - leftWidth);
  const selectedCheckId = getSelectedCheckId(progress);
  const selectedStreamState = selectedCheckId ? streamsByCheck[selectedCheckId] ?? null : null;
  const streamLines = useMemo(
    () => buildCombinedStreamLines(selectedStreamState?.items ?? []),
    [selectedStreamState]
  );
  const streamPanelTitle = buildStreamPanelTitle(progress);
  const streamPanelTitleColor = getCheckStatusColor(
    selectedCheckId ? progress.checkStatuses[selectedCheckId] ?? null : null
  );

  useInput((input, key) => {
    if (input === 'd' || (key.ctrl && (input === 't' || input === 'o'))) {
      setProgress(previous => ({
        ...previous,
        showDetails: !previous.showDetails
      }));
      return;
    }

    if (key.leftArrow) {
      setProgress(previous => navigateChecks(previous, -1));
      return;
    }

    if (key.rightArrow) {
      setProgress(previous => navigateChecks(previous, 1));
      return;
    }

    if (key.upArrow) {
      setFollowStream(false);
      streamRef.current?.scrollBy(-1);
      return;
    }

    if (key.downArrow) {
      streamRef.current?.scrollBy(1);
      setFollowStream(isPinnedToBottom(streamRef.current));
      return;
    }

    if (key.pageUp) {
      setFollowStream(false);
      const delta = -Math.max(3, streamViewportHeight - 2);
      streamRef.current?.scrollBy(delta);
      return;
    }

    if (key.pageDown) {
      const delta = Math.max(3, streamViewportHeight - 2);
      streamRef.current?.scrollBy(delta);
      setFollowStream(isPinnedToBottom(streamRef.current));
      return;
    }

    if (key.home) {
      setFollowStream(false);
      streamRef.current?.scrollToTop();
      return;
    }

    if (key.end) {
      streamRef.current?.scrollToBottom();
      setFollowStream(true);
    }
  });

  useEffect(() => {
    const handleResize = () => {
      streamRef.current?.remeasure();
      if (followStream) {
        streamRef.current?.scrollToBottom();
      }
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [followStream, stdout]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const report = await runScan(props.options, {
          onProgress: event => {
            if (!active) {
              return;
            }

            if (event.type === 'check-started' && event.checkId) {
              activeCheckIdRef.current = event.checkId;
              setStreamsByCheck(previous => {
                if (previous[event.checkId!]) {
                  return previous;
                }

                return {
                  ...previous,
                  [event.checkId!]: createRuntimeStreamState()
                };
              });
            } else if (event.type === 'no-changes-in-scope') {
              activeCheckIdRef.current = null;
            }

            setProgress(previous => applyProgressEvent(previous, event));
          },
          onRuntimeEvent: event => {
            if (!active) {
              return;
            }

            const targetCheckId = activeCheckIdRef.current;
            if (!targetCheckId) {
              return;
            }

            setStreamsByCheck(previous => ({
              ...previous,
              [targetCheckId]: reduceRuntimeEvent(previous[targetCheckId] ?? createRuntimeStreamState(), event)
            }));
          }
        });

        if (active) {
          props.onSuccess(report);
        }
      } catch (error) {
        if (active) {
          props.onError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        exit();
      }
    })();

    return () => {
      active = false;
    };
  }, [exit, props]);

  useEffect(() => {
    if (followStream) {
      streamRef.current?.scrollToBottom();
    }
  }, [followStream, streamLines]);

  return (
    <Box flexDirection="row" gap={1} width={terminalWidth} height={terminalHeight}>
      <Panel title="OpenShrike Scan" width={leftWidth} height={terminalHeight}>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {renderProgress(progress)}
          <Box marginTop={1} flexDirection="column">
            {renderStatus(progress)}
          </Box>
        </Box>
      </Panel>
      <Panel
        title={streamPanelTitle}
        titleColor={streamPanelTitleColor}
        width={rightWidth}
        height={terminalHeight}
      >
        <Box flexDirection="column" flexGrow={1} gap={1} overflow="hidden">
          <StreamSection
            ref={streamRef}
            title="Timeline"
            titleColor="whiteBright"
            lines={streamLines}
            onViewportHeightChange={setStreamViewportHeight}
          />
        </Box>
      </Panel>
    </Box>
  );
}

function Panel(props: {
  title: string;
  titleColor?: string;
  children: React.ReactNode;
  width: number;
  height: number;
}) {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      width={props.width}
      height={props.height}
      flexShrink={0}
    >
      <Text color={props.titleColor ?? 'cyanBright'}>{props.title}</Text>
      <Box flexGrow={1} overflow="hidden">
        {props.children}
      </Box>
    </Box>
  );
}

const StreamSection = React.forwardRef(function StreamSection(
  props: {
    title: string;
    titleColor: string;
    lines: StreamLine[];
    onViewportHeightChange?: ((height: number) => void) | undefined;
  },
  ref: React.ForwardedRef<ScrollViewRef>
) {
  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      flexBasis={0}
      flexGrow={1}
      overflow="hidden"
    >
      <Text color={props.titleColor}>{props.title}</Text>
      <Box flexGrow={1} overflow="hidden">
        <ScrollView
          ref={ref}
          flexDirection="column"
          width="100%"
          height="100%"
          onViewportSizeChange={size => {
            props.onViewportHeightChange?.(size.height);
          }}
        >
          {props.lines.map((line, index) => (
            <Text
              key={`${props.title}-${index}-${line.kind}`}
              {...(line.color ? {color: line.color} : {})}
              {...(line.bold ? {bold: line.bold} : {})}
              {...(line.dimColor ? {dimColor: line.dimColor} : {})}
            >
              {line.text}
            </Text>
          ))}
        </ScrollView>
      </Box>
    </Box>
  );
});

function renderProgress(state: ProgressViewState) {
  const total = Math.max(state.totalChecks, 1);
  const completed = Math.max(0, Math.min(state.checkIndex, total));
  const ratio = state.totalChecks <= 0 ? 0 : completed / total;
  const width = 32;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  const bar = `${'='.repeat(filled)}${'-'.repeat(width - filled)}`;

  return (
    <Box flexDirection="column">
      <Text color={state.failedCount > 0 ? 'red' : 'green'}>{bar}</Text>
      <Text>
        {Math.round(ratio * 100)}% [{state.checkIndex}/{state.totalChecks}] {state.statusLabel}
      </Text>
    </Box>
  );
}

function renderStatus(state: ProgressViewState) {
  const lines = [
    `Scope: ${state.scopeLabel} (${formatScopeFileInfo(state)})`,
    `PASS: ${state.passedCount}    FAIL: ${state.failedCount}    UNKNOWN: ${state.unknownCount}`
  ];

  const selectedCheckId = getSelectedCheckId(state);
  if (selectedCheckId) {
    lines.push(`Viewing: ${formatCheckDescriptor(state, selectedCheckId)}`);
  }

  if (state.activeCheckId && state.activeCheckId !== selectedCheckId) {
    lines.push(`Running: ${formatCheckDescriptor(state, state.activeCheckId)}`);
  }

  lines.push('Check nav: left/right    Details: d / Ctrl+T / Ctrl+O');

  if (state.showDetails) {
    lines.push(`Failed checks: ${joinChecks(state.failedChecks)}`);
    lines.push(`Passed checks: ${joinChecks(state.passedChecks)}`);
    lines.push(`Unknown checks: ${joinChecks(state.unknownChecks)}`);
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
      <Text color="cyan">Stream scroll: up/down, page up/down, home/end</Text>
    </Box>
  );
}

function createProgressViewState(): ProgressViewState {
  return {
    scopeLabel: 'resolving scope',
    scopeFileCount: 0,
    scopeIsFullRepository: false,
    checkIndex: 0,
    totalChecks: 0,
    passedCount: 0,
    failedCount: 0,
    unknownCount: 0,
    statusLabel: 'Preparing scan',
    showDetails: false,
    passedChecks: [],
    failedChecks: [],
    unknownChecks: [],
    checkOrder: [],
    checkStatuses: {},
    activeCheckId: null,
    selectedCheckIndex: 0,
    followActiveCheck: true
  };
}

function applyProgressEvent(
  previous: ProgressViewState,
  event: ScanProgressEvent
): ProgressViewState {
  const next: ProgressViewState = {
    ...previous,
    checkOrder: [...previous.checkOrder],
    checkStatuses: {...previous.checkStatuses},
    scopeLabel: event.scopeLabel,
    scopeFileCount: event.scopeFileCount,
    scopeIsFullRepository: event.isFullRepository,
    checkIndex: event.checkIndex,
    totalChecks: event.totalChecks,
    passedCount: event.passedCount,
    failedCount: event.failedCount,
    unknownCount: event.unknownCount
  };

  if (event.checkId) {
    ensureTrackedCheck(next, event.checkId);
  }

  if (event.type === 'scope-resolved') {
    next.statusLabel = 'Scope resolved';
    return next;
  }

  if (event.type === 'no-changes-in-scope') {
    next.statusLabel = 'No files matched selected scope';
    next.activeCheckId = null;
    return next;
  }

  if (event.type === 'check-started') {
    next.statusLabel = `Running ${event.checkId}`;
    if (event.checkId) {
      next.activeCheckId = event.checkId;
      next.checkStatuses[event.checkId] = 'running';
      if (next.followActiveCheck) {
        next.selectedCheckIndex = next.checkOrder.indexOf(event.checkId);
      }
    }
    return next;
  }

  next.statusLabel = `Completed ${event.checkId}=${event.checkStatus}`;
  next.activeCheckId = null;
  if (event.checkId) {
    if (event.checkStatus) {
      next.checkStatuses[event.checkId] = event.checkStatus;
    }
    next.passedChecks = next.passedChecks.filter(value => value !== event.checkId);
    next.failedChecks = next.failedChecks.filter(value => value !== event.checkId);
    next.unknownChecks = next.unknownChecks.filter(value => value !== event.checkId);

    if (event.checkStatus === 'pass') {
      next.passedChecks = [...next.passedChecks, event.checkId].sort();
    } else if (event.checkStatus === 'fail') {
      next.failedChecks = [...next.failedChecks, event.checkId].sort();
    } else if (event.checkStatus === 'unknown') {
      next.unknownChecks = [...next.unknownChecks, event.checkId].sort();
    }
  }

  return next;
}

function joinChecks(checks: string[]): string {
  return checks.length === 0 ? 'none' : checks.join(', ');
}

function navigateChecks(state: ProgressViewState, delta: -1 | 1): ProgressViewState {
  if (state.checkOrder.length === 0) {
    return state;
  }

  const nextIndex = Math.max(0, Math.min(state.checkOrder.length - 1, state.selectedCheckIndex + delta));
  return {
    ...state,
    selectedCheckIndex: nextIndex,
    followActiveCheck: state.checkOrder[nextIndex] === state.activeCheckId
  };
}

function ensureTrackedCheck(state: ProgressViewState, checkId: string): void {
  if (!state.checkOrder.includes(checkId)) {
    state.checkOrder.push(checkId);
  }
}

function getSelectedCheckId(state: ProgressViewState): string | null {
  return state.checkOrder[state.selectedCheckIndex] ?? null;
}

function buildStreamPanelTitle(state: ProgressViewState): string {
  const selectedCheckId = getSelectedCheckId(state);
  if (!selectedCheckId) {
    return 'Waiting for check';
  }

  return formatCheckDescriptor(state, selectedCheckId);
}

function formatCheckDescriptor(state: ProgressViewState, checkId: string): string {
  const position = state.checkOrder.indexOf(checkId) + 1;
  const total = Math.max(state.totalChecks, state.checkOrder.length);
  const status = formatCheckStatus(state.checkStatuses[checkId] ?? null);
  return `${position}/${total} ${checkId} [${status}]`;
}

function formatCheckStatus(status: CheckDisplayStatus | null): string {
  if (status === null) {
    return 'WAITING';
  }

  return status.toUpperCase();
}

function getCheckStatusColor(status: CheckDisplayStatus | null): string {
  switch (status) {
    case 'pass':
      return 'greenBright';
    case 'fail':
      return 'redBright';
    case 'unknown':
      return 'blueBright';
    case 'running':
      return 'yellowBright';
    default:
      return 'cyanBright';
  }
}

function formatScopeFileInfo(state: ProgressViewState): string {
  return state.scopeIsFullRepository ? 'all files' : `${state.scopeFileCount} files`;
}

export function buildCombinedStreamLines(items: RuntimeStreamItem[]): StreamLine[] {
  if (items.length === 0) {
    return [
      {
        text: '[evt] Waiting for runtime activity...',
        kind: 'event',
        color: 'gray',
        dimColor: true
      }
    ];
  }

  return items.flatMap(item => {
    const style = getStreamLineStyle(item.kind);
    return splitMultilineText(item.text).map(line => ({
      text: `${style.label} ${line}`,
      kind: item.kind,
      color: style.color,
      ...(style.bold ? {bold: style.bold} : {}),
      ...(style.dimColor ? {dimColor: style.dimColor} : {})
    }));
  });
}

function getStreamLineStyle(kind: RuntimeStreamItem['kind']): {
  label: string;
  color: string;
  bold?: boolean;
  dimColor?: boolean;
} {
  switch (kind) {
    case 'assistant':
      return {label: '[ai ]', color: 'greenBright'};
    case 'reasoning':
      return {label: '[why]', color: 'magentaBright', dimColor: true};
    case 'tool':
      return {label: '[tool]', color: 'cyanBright', bold: true};
    case 'tool-output':
      return {label: '[out]', color: 'blueBright', dimColor: true};
    case 'pty':
      return {label: '[cmd]', color: 'yellowBright'};
    case 'error':
      return {label: '[err]', color: 'redBright', bold: true};
    case 'event':
    default:
      return {label: '[evt]', color: 'gray', dimColor: true};
  }
}

function splitMultilineText(value: string): string[] {
  return value.split('\n').map(line => line || ' ');
}

function isPinnedToBottom(ref: ScrollViewRef | null): boolean {
  if (!ref) {
    return true;
  }

  return ref.getScrollOffset() >= ref.getBottomOffset();
}
