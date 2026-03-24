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

    void instance.waitUntilExit();
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
  const [progress, setProgress] = useState<ProgressViewState>(createProgressViewState());
  const [streamState, setStreamState] = useState<RuntimeStreamState>(createRuntimeStreamState());
  const [streamViewportHeight, setStreamViewportHeight] = useState(0);

  const terminalWidth = Math.max(80, stdout.columns || 80);
  const terminalHeight = Math.max(16, (stdout.rows || 24) - 1);
  const gapWidth = 1;
  const leftWidth = Math.max(20, Math.floor((terminalWidth - gapWidth) / 2));
  const rightWidth = Math.max(20, terminalWidth - gapWidth - leftWidth);
  const streamLines = useMemo(() => buildStreamLines(streamState), [streamState]);

  useInput((input, key) => {
    if (input === 'd' || (key.ctrl && (input === 't' || input === 'o'))) {
      setProgress(previous => ({
        ...previous,
        showDetails: !previous.showDetails
      }));
      return;
    }

    if (key.upArrow) {
      streamRef.current?.scrollBy(-1);
      return;
    }

    if (key.downArrow) {
      streamRef.current?.scrollBy(1);
      return;
    }

    if (key.pageUp) {
      streamRef.current?.scrollBy(-Math.max(3, streamViewportHeight - 2));
      return;
    }

    if (key.pageDown) {
      streamRef.current?.scrollBy(Math.max(3, streamViewportHeight - 2));
      return;
    }

    if (key.home) {
      streamRef.current?.scrollToTop();
      return;
    }

    if (key.end) {
      streamRef.current?.scrollToBottom();
    }
  });

  useEffect(() => {
    const handleResize = () => {
      streamRef.current?.remeasure();
      streamRef.current?.scrollToBottom();
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

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
    streamRef.current?.scrollToBottom();
  }, [streamLines]);

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
        <Box flexGrow={1} overflow="hidden">
          <ScrollView
            ref={streamRef}
            flexDirection="column"
            width="100%"
            height="100%"
            onViewportSizeChange={size => {
              setStreamViewportHeight(size.height);
            }}
          >
            {streamLines.map((line, index) => (
              <Text key={`${index}-${line.kind}`} {...(line.color ? {color: line.color} : {})}>
                {line.text}
              </Text>
            ))}
          </ScrollView>
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

function buildStreamLines(state: RuntimeStreamState): StreamLine[] {
  const eventLines = state.entries.length === 0 ? ['Waiting for OpenCode events...'] : state.entries;
  const outputLines = splitMultilineText(state.output || '(no assistant text yet)');
  const reasoningLines = splitMultilineText(state.reasoning || '(no reasoning stream yet)');

  return [
    {text: 'Events', color: 'yellowBright', kind: 'header'},
    ...eventLines.map(line => ({text: line, kind: 'event'})),
    {text: '', kind: 'spacer'},
    {text: 'Assistant Output', color: 'greenBright', kind: 'header'},
    ...outputLines.map(line => ({text: line, kind: 'output'})),
    {text: '', kind: 'spacer'},
    {text: 'Reasoning', color: 'magentaBright', kind: 'header'},
    ...reasoningLines.map(line => ({text: line, kind: 'reasoning'}))
  ];
}

function splitMultilineText(value: string): string[] {
  return value.split('\n').map(line => line || ' ');
}
