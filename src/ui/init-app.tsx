import React, {useState} from 'react';
import {Box, Text, render, useApp, useInput} from 'ink';
import {DialogFrame, DialogLine, DialogPrompt, KeyHintBar, SelectList, SummaryBlock, type DialogRailTone} from './init-controls.js';
import {INIT_DIALOG_TITLE, initTheme} from './init-theme.js';

export class InitUiCancelledError extends Error {
  constructor() {
    super('Init cancelled by user.');
    this.name = 'InitUiCancelledError';
  }
}

export interface InitScreenOption<T extends string> {
  value: T;
  label: string;
  detail?: string | undefined;
  searchText?: string | undefined;
}

export interface InitScreenSpec<T extends string> {
  title?: string;
  prompt: string;
  tone?: 'normal' | 'warning' | 'error';
  bodyLines?: string[];
  summaryItems?: Array<{label: string; value: string}>;
  noteLines?: string[];
  options: InitScreenOption<T>[];
  initialValue?: T | undefined;
  searchable?: boolean | undefined;
  searchLabel?: string | undefined;
  allowBack?: boolean | undefined;
  allowCancel?: boolean | undefined;
  helpLines?: string[] | undefined;
}

export type InitScreenResult<T extends string> =
  | {type: 'submit'; value: T}
  | {type: 'back'};

export async function runInitScreen<T extends string>(
  spec: InitScreenSpec<T>
): Promise<InitScreenResult<T>> {
  return await new Promise<InitScreenResult<T>>((resolve, reject) => {
    const instance = render(
      <InitScreenView
        spec={spec}
        onResolve={result => {
          resolve(result);
        }}
        onCancel={() => {
          reject(new InitUiCancelledError());
        }}
      />,
      {
        stdout: process.stderr,
        exitOnCtrlC: false
      }
    );

    instance.waitUntilExit().catch(error => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function InitScreenView<T extends string>(props: {
  spec: InitScreenSpec<T>;
  onResolve: (result: InitScreenResult<T>) => void;
  onCancel: () => void;
}) {
  const {exit} = useApp();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(() =>
    resolveInitialIndex(props.spec.options, props.spec.initialValue)
  );
  const [showHelp, setShowHelp] = useState(false);

  const filteredOptions = getFilteredOptions(props.spec.options, query, Boolean(props.spec.searchable));
  const effectiveIndex = filteredOptions.length === 0
    ? 0
    : Math.min(selectedIndex, filteredOptions.length - 1);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      props.onCancel();
      exit();
      return;
    }

    if (key.escape && props.spec.allowCancel !== false) {
      props.onCancel();
      exit();
      return;
    }

    if ((input === 'b' || input === 'B') && props.spec.allowBack) {
      props.onResolve({type: 'back'});
      exit();
      return;
    }

    if (input === '?' && props.spec.helpLines && props.spec.helpLines.length > 0) {
      setShowHelp(previous => !previous);
      return;
    }

    if (props.spec.searchable && isBackspace(input, key)) {
      setQuery(previous => previous.slice(0, -1));
      return;
    }

    if (props.spec.searchable && isPrintableInput(input, key)) {
      setQuery(previous => previous + input);
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(previous => {
        if (filteredOptions.length === 0) {
          return 0;
        }

        return previous <= 0 ? filteredOptions.length - 1 : previous - 1;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(previous => {
        if (filteredOptions.length === 0) {
          return 0;
        }

        return previous >= filteredOptions.length - 1 ? 0 : previous + 1;
      });
      return;
    }

    if (key.return && filteredOptions.length > 0) {
      props.onResolve({
        type: 'submit',
        value: filteredOptions[effectiveIndex]!.value
      });
      exit();
    }
  });

  const hints = buildHintBar(props.spec);
  const headerRailTone: DialogRailTone = 'muted';
  const choiceRailTone: DialogRailTone = 'active';

  return (
    <DialogFrame title={props.spec.title ?? INIT_DIALOG_TITLE}>
      <DialogLine railTone={headerRailTone} />
      <DialogPrompt prompt={props.spec.prompt} tone={props.spec.tone} />
      <DialogLine railTone="muted" />
      {renderTextLines(props.spec.bodyLines, headerRailTone)}
      {props.spec.summaryItems && props.spec.summaryItems.length > 0 ? (
        <SummaryBlock items={props.spec.summaryItems} railTone={headerRailTone} />
      ) : null}
      <DialogLine railTone="none" />
      {props.spec.searchable ? (
        <DialogLine railTone={choiceRailTone}>
          <Text color={initTheme.secondary}>{`${props.spec.searchLabel ?? 'Search'}: `}</Text>
          {query.length > 0 ? <Text color={initTheme.primary}>{query}</Text> : null}
          <Text backgroundColor={initTheme.cursor}> </Text>
        </DialogLine>
      ) : null}
      {filteredOptions.length > 0 ? (
        <SelectList
          items={filteredOptions.map((option, index) => ({
            label: option.label,
            detail: option.detail,
            selected: index === effectiveIndex
          }))}
          railTone={choiceRailTone}
        />
      ) : (
        <DialogLine railTone={choiceRailTone}>
          <Text color={initTheme.secondary}>No matching options.</Text>
        </DialogLine>
      )}
      {renderTextLines(props.spec.noteLines, choiceRailTone)}
      <DialogLine railTone={choiceRailTone} />
      {showHelp && props.spec.helpLines && props.spec.helpLines.length > 0 ? (
        <>
          {renderTextLines(props.spec.helpLines, choiceRailTone)}
          <DialogLine railTone={choiceRailTone} />
        </>
      ) : null}
      <KeyHintBar hints={hints} railTone={choiceRailTone} />
    </DialogFrame>
  );
}

function renderTextLines(
  lines: string[] | undefined,
  railTone: DialogRailTone
): React.ReactNode {
  if (!lines || lines.length === 0) {
    return null;
  }

  return (
    <>
      {lines.map((line, index) => (
        <DialogLine key={`${index}:${line}`} railTone={railTone}>
          <Text color={initTheme.secondary}>{line || ' '}</Text>
        </DialogLine>
      ))}
    </>
  );
}

function buildHintBar<T extends string>(spec: InitScreenSpec<T>): string[] {
  const hints = ['↑/↓ to select', 'Enter: confirm'];

  if (spec.searchable) {
    hints.push('Type: to search');
  }

  if (spec.allowBack) {
    hints.push('b: back');
  }

  if (spec.allowCancel !== false) {
    hints.push('Esc: cancel');
  }

  if (spec.helpLines && spec.helpLines.length > 0) {
    hints.push('?: help');
  }

  return hints;
}

function getFilteredOptions<T extends string>(
  options: InitScreenOption<T>[],
  query: string,
  searchable: boolean
): InitScreenOption<T>[] {
  if (!searchable || !query.trim()) {
    return options;
  }

  const normalized = query.trim().toLowerCase();
  return options.filter(option =>
    [option.label, option.detail, option.searchText]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLowerCase().includes(normalized))
  );
}

function resolveInitialIndex<T extends string>(
  options: InitScreenOption<T>[],
  initialValue: T | undefined
): number {
  if (!initialValue) {
    return 0;
  }

  const foundIndex = options.findIndex(option => option.value === initialValue);
  return foundIndex >= 0 ? foundIndex : 0;
}

function isPrintableInput(input: string, key: {ctrl: boolean; meta: boolean; shift: boolean}): boolean {
  return !key.ctrl && !key.meta && input.length === 1 && /[\x20-\x7E]/u.test(input);
}

function isBackspace(
  input: string,
  key: {backspace: boolean; delete: boolean}
): boolean {
  return key.backspace || key.delete || input === '\u007f';
}
