import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, render, useApp, useInput, useStdout} from 'ink';
import {ScrollView, type ScrollViewRef} from 'ink-scroll-view';
import {runScan} from '../lib/scan.js';
import {createRuntimeStreamState, reduceRuntimeEvent, type RuntimeStreamState} from '../lib/runtime-events.js';
import type {ScanCommandOptions, ScanProgressEvent, ScanReport} from '../lib/types.js';

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
}

interface StreamLine {
  text: string;
  color?: string;
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
  const eventStreamRef = useRef<ScrollViewRef>(null);
  const outputStreamRef = useRef<ScrollViewRef>(null);
  const reasoningStreamRef = useRef<ScrollViewRef>(null);
  const [progress, setProgress] = useState<ProgressViewState>(createProgressViewState());
  const [streamState, setStreamState] = useState<RuntimeStreamState>(createRuntimeStreamState());
  const [streamViewportHeight, setStreamViewportHeight] = useState(0);
  const [followStream, setFollowStream] = useState(true);

  const terminalWidth = Math.max(80, stdout.columns || 80);
  const terminalHeight = Math.max(16, (stdout.rows || 24) - 1);
  const gapWidth = 1;
  const leftWidth = Math.max(20, Math.floor((terminalWidth - gapWidth) / 2));
  const rightWidth = Math.max(20, terminalWidth - gapWidth - leftWidth);
  const streamSections = useMemo(() => buildStreamSections(streamState), [streamState]);

  useInput((input, key) => {
    if (input === 'd' || (key.ctrl && (input === 't' || input === 'o'))) {
      setProgress(previous => ({
        ...previous,
        showDetails: !previous.showDetails
      }));
      return;
    }

    if (key.upArrow) {
      setFollowStream(false);
      scrollAllStreams([-1, -1, -1], [eventStreamRef, outputStreamRef, reasoningStreamRef]);
      return;
    }

    if (key.downArrow) {
      scrollAllStreams([1, 1, 1], [eventStreamRef, outputStreamRef, reasoningStreamRef]);
      setFollowStream(
        areAllStreamsPinnedToBottom([eventStreamRef.current, outputStreamRef.current, reasoningStreamRef.current])
      );
      return;
    }

    if (key.pageUp) {
      setFollowStream(false);
      const delta = -Math.max(3, streamViewportHeight - 2);
      scrollAllStreams([delta, delta, delta], [eventStreamRef, outputStreamRef, reasoningStreamRef]);
      return;
    }

    if (key.pageDown) {
      const delta = Math.max(3, streamViewportHeight - 2);
      scrollAllStreams([delta, delta, delta], [eventStreamRef, outputStreamRef, reasoningStreamRef]);
      setFollowStream(
        areAllStreamsPinnedToBottom([eventStreamRef.current, outputStreamRef.current, reasoningStreamRef.current])
      );
      return;
    }

    if (key.home) {
      setFollowStream(false);
      eventStreamRef.current?.scrollToTop();
      outputStreamRef.current?.scrollToTop();
      reasoningStreamRef.current?.scrollToTop();
      return;
    }

    if (key.end) {
      eventStreamRef.current?.scrollToBottom();
      outputStreamRef.current?.scrollToBottom();
      reasoningStreamRef.current?.scrollToBottom();
      setFollowStream(true);
    }
  });

  useEffect(() => {
    const handleResize = () => {
      eventStreamRef.current?.remeasure();
      outputStreamRef.current?.remeasure();
      reasoningStreamRef.current?.remeasure();
      if (followStream) {
        eventStreamRef.current?.scrollToBottom();
        outputStreamRef.current?.scrollToBottom();
        reasoningStreamRef.current?.scrollToBottom();
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

            setProgress(previous => applyProgressEvent(previous, event));
          },
          onRuntimeEvent: event => {
            if (!active) {
              return;
            }

            setStreamState(previous => reduceRuntimeEvent(previous, event));
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
      eventStreamRef.current?.scrollToBottom();
      outputStreamRef.current?.scrollToBottom();
      reasoningStreamRef.current?.scrollToBottom();
    }
  }, [followStream, streamSections]);

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
      <Panel title="OpenCode Stream" width={rightWidth} height={terminalHeight}>
        <Box flexDirection="column" flexGrow={1} gap={1} overflow="hidden">
          <StreamSection
            ref={eventStreamRef}
            title="Events"
            titleColor="yellowBright"
            lines={streamSections.events}
            onViewportHeightChange={setStreamViewportHeight}
          />
          <StreamSection
            ref={outputStreamRef}
            title="Assistant Output"
            titleColor="greenBright"
            lines={streamSections.output}
          />
          <StreamSection
            ref={reasoningStreamRef}
            title="Reasoning"
            titleColor="magentaBright"
            lines={streamSections.reasoning}
          />
        </Box>
      </Panel>
    </Box>
  );
}

function Panel(props: {title: string; children: React.ReactNode; width: number; height: number}) {
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
      <Text color="cyanBright">{props.title}</Text>
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
            <Text key={`${props.title}-${index}-${line.kind}`} {...(line.color ? {color: line.color} : {})}>
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
    `PASS: ${state.passedCount}    FAIL: ${state.failedCount}    UNKNOWN: ${state.unknownCount}`,
    'Toggle details: d / Ctrl+T / Ctrl+O'
  ];

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
      <Text color="cyan">
        Stream scroll: up/down, page up/down, home/end (all panes)
      </Text>
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
    unknownChecks: []
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
    checkIndex: event.checkIndex,
    totalChecks: event.totalChecks,
    passedCount: event.passedCount,
    failedCount: event.failedCount,
    unknownCount: event.unknownCount
  };

  if (event.type === 'scope-resolved') {
    next.statusLabel = 'Scope resolved';
    return next;
  }

  if (event.type === 'no-changes-in-scope') {
    next.statusLabel = 'No files matched selected scope';
    return next;
  }

  if (event.type === 'check-started') {
    next.statusLabel = `Running ${event.checkId}`;
    return next;
  }

  next.statusLabel = `Completed ${event.checkId}=${event.checkStatus}`;
  if (event.checkId) {
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

function formatScopeFileInfo(state: ProgressViewState): string {
  return state.scopeIsFullRepository ? 'all files' : `${state.scopeFileCount} files`;
}

export function buildStreamSections(state: RuntimeStreamState): {
  events: StreamLine[];
  output: StreamLine[];
  reasoning: StreamLine[];
} {
  return {
    events: (state.entries.length === 0 ? ['Waiting for OpenCode events...'] : state.entries).map(line => ({
      text: line,
      kind: 'event'
    })),
    output: splitMultilineText(state.output || '(no assistant text yet)').map(line => ({
      text: line,
      kind: 'output'
    })),
    reasoning: splitMultilineText(state.reasoning || '(no reasoning stream yet)').map(line => ({
      text: line,
      kind: 'reasoning'
    }))
  };
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

function areAllStreamsPinnedToBottom(refs: Array<ScrollViewRef | null>): boolean {
  return refs.every(isPinnedToBottom);
}

function scrollAllStreams(
  deltas: [number, number, number],
  refs: readonly [
    React.RefObject<ScrollViewRef | null>,
    React.RefObject<ScrollViewRef | null>,
    React.RefObject<ScrollViewRef | null>
  ]
): void {
  refs[0].current?.scrollBy(deltas[0]);
  refs[1].current?.scrollBy(deltas[1]);
  refs[2].current?.scrollBy(deltas[2]);
}
