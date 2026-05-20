import React from 'react';
import {Box, Text} from 'ink';
import {initTheme} from './init-theme.js';

export type DialogRailTone = 'muted' | 'active' | 'none';

export interface SummaryItem {
  label: string;
  value: string;
}

export interface SelectListItem {
  label: string;
  detail?: string | undefined;
  active: boolean;
  checked?: boolean | undefined;
  selectionMode?: 'single' | 'multiple' | undefined;
}

const MAX_DETAIL_LABEL_WIDTH = 20;

export interface HistoryStep {
  prompt: string;
  responseLines: string[];
  tone?: 'normal' | 'warning' | 'error' | undefined;
}

export function DialogFrame(props: {
  title: string;
  children: React.ReactNode;
  prefix?: string | undefined;
}) {
  const prefix = props.prefix ?? '';

  return (
    <Box flexDirection="column">
      <Box>
        {prefix ? <Text color={initTheme.secondary}>{prefix}</Text> : null}
        <Text color={initTheme.railMuted}>┌</Text>
        <Text>  </Text>
        <Text color={initTheme.title}>{props.title}</Text>
      </Box>
      {props.children}
      <Text color={initTheme.railActive}>└</Text>
    </Box>
  );
}

export function DialogLine(props: {
  children?: React.ReactNode;
  railTone?: DialogRailTone | undefined;
}) {
  const railCharacter = props.railTone === 'none' ? ' ' : '│';
  const railColor = props.railTone === 'muted'
    ? initTheme.railMuted
    : initTheme.railActive;

  return (
    <Box>
      {props.railTone === 'none' ? <Text>{railCharacter}</Text> : <Text color={railColor}>{railCharacter}</Text>}
      <Box marginLeft={2}>
        {props.children ?? <Text> </Text>}
      </Box>
    </Box>
  );
}

export function DialogPrompt(props: {
  prompt: string;
  tone?: 'normal' | 'warning' | 'error' | undefined;
  symbol?: string | undefined;
  symbolColor?: string | undefined;
}) {
  const color = props.tone === 'error'
    ? initTheme.danger
    : props.tone === 'warning'
      ? initTheme.warning
      : initTheme.primary;
  const symbol = props.symbol ?? '◆';
  const symbolColor = props.symbolColor ?? initTheme.accent;

  return (
    <Box>
      <Box>
        <Text color={symbolColor}>{symbol}</Text>
        <Text>  </Text>
        <Text color={color}>{props.prompt}</Text>
      </Box>
    </Box>
  );
}

export function DialogHistoryStep(props: HistoryStep) {
  return (
    <>
      <DialogPrompt
        prompt={props.prompt}
        tone={props.tone}
        symbol="◇"
        symbolColor={initTheme.selected}
      />
      {props.responseLines.map((line, index) => (
        <DialogLine key={`${props.prompt}:${index}`} railTone="muted">
          <Text color={line.trim().length > 0 ? initTheme.primary : initTheme.secondary}>{line || ' '}</Text>
        </DialogLine>
      ))}
    </>
  );
}

export function SummaryBlock(props: {
  items: SummaryItem[];
  railTone?: DialogRailTone | undefined;
}) {
  const labelWidth = props.items.reduce((width, item) => Math.max(width, item.label.length), 0);

  return (
    <>
      {props.items.map(item => (
        <DialogLine key={item.label} railTone={props.railTone}>
          <Text color={initTheme.secondary}>
            {`${item.label.padEnd(labelWidth)}: `}
          </Text>
          <Text color={initTheme.primary}>{item.value}</Text>
        </DialogLine>
      ))}
    </>
  );
}

export function SelectList(props: {
  items: SelectListItem[];
  railTone?: DialogRailTone | undefined;
}) {
  const detailLabelWidth = Math.min(
    props.items.reduce((width, item) => Math.max(width, item.detail ? item.label.length : 0), 0),
    MAX_DETAIL_LABEL_WIDTH
  );

  return (
    <>
      {props.items.map(item => (
        <DialogLine key={item.label} railTone={props.railTone}>
          {item.selectionMode === 'multiple' ? (
            <Box>
              <Text color={item.active ? initTheme.selected : initTheme.secondary}>
                {item.active ? '›' : ' '}
              </Text>
              <Text> </Text>
              <Text color={item.checked ? initTheme.selected : initTheme.secondary}>
                {item.checked ? '[x]' : '[ ]'}
              </Text>
              <Text>  </Text>
              <Text color={item.active ? initTheme.primary : item.checked ? initTheme.selected : initTheme.secondary}>
                {item.label.padEnd(detailLabelWidth)}
              </Text>
              {item.detail ? (
                <>
                  <Text color={initTheme.secondary}>  </Text>
                  <Text color={initTheme.secondary}>{item.detail}</Text>
                </>
              ) : null}
            </Box>
          ) : (
            <Box>
              <Text color={item.active ? initTheme.selected : initTheme.secondary}>
                {item.active ? '●' : '○'}
              </Text>
              <Text>  </Text>
              <Text color={item.active ? initTheme.primary : initTheme.secondary}>
                {item.label.padEnd(detailLabelWidth)}
              </Text>
              {item.detail ? (
                <>
                  <Text color={initTheme.secondary}>  </Text>
                  <Text color={initTheme.secondary}>{item.detail}</Text>
                </>
              ) : null}
            </Box>
          )}
        </DialogLine>
      ))}
    </>
  );
}

export function KeyHintBar(props: {
  hints: string[];
  railTone?: DialogRailTone | undefined;
}) {
  return (
    <DialogLine railTone={props.railTone}>
      <Text color={initTheme.secondary}>{props.hints.join(' • ')}</Text>
    </DialogLine>
  );
}
