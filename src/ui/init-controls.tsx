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
  selected: boolean;
}

export function DialogFrame(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box flexDirection="column">
      <Box>
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
}) {
  const color = props.tone === 'error'
    ? initTheme.danger
    : props.tone === 'warning'
      ? initTheme.warning
      : initTheme.primary;

  return (
    <Box>
      <Box>
        <Text color={initTheme.accent}>◆</Text>
        <Text>  </Text>
        <Text color={color}>{props.prompt}</Text>
      </Box>
    </Box>
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
  return (
    <>
      {props.items.map(item => (
        <DialogLine key={item.label} railTone={props.railTone}>
          <Box>
            <Text color={item.selected ? initTheme.selected : initTheme.secondary}>
              {item.selected ? '●' : '○'}
            </Text>
            <Text>  </Text>
            <Text color={item.selected ? initTheme.primary : initTheme.secondary}>{item.label}</Text>
            {item.detail ? (
              <>
                <Text color={initTheme.secondary}>  </Text>
                <Text color={initTheme.secondary}>{item.detail}</Text>
              </>
            ) : null}
          </Box>
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
