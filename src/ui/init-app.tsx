import React, {useState} from 'react';
import {Box, Text, render, useInput} from 'ink';
import {
  DialogFrame,
  DialogHistoryStep,
  DialogLine,
  DialogPrompt,
  KeyHintBar,
  SelectList,
  SummaryBlock,
  type DialogRailTone
} from './init-controls.js';
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

export interface InitHistoryItem {
  screen: string;
  prompt: string;
  responseLines: string[];
  tone?: 'normal' | 'warning' | 'error' | undefined;
}

export interface InitUiSession {
  showScreen<T extends string>(
    spec: InitScreenSpec<T>,
    history: InitHistoryItem[]
  ): Promise<InitScreenResult<T>>;
  suspend(): void;
  close(): void;
}

class InkInitUiSession implements InitUiSession {
  private instance: ReturnType<typeof render> | null = null;
  private screenVersion = 0;

  async showScreen<T extends string>(
    spec: InitScreenSpec<T>,
    history: InitHistoryItem[]
  ): Promise<InitScreenResult<T>> {
    this.screenVersion += 1;

    return await new Promise<InitScreenResult<T>>((resolve, reject) => {
      const node = (
        <InitScreenView
          key={this.screenVersion}
          spec={spec}
          history={history}
          onResolve={result => {
            resolve(result);
          }}
          onCancel={() => {
            reject(new InitUiCancelledError());
          }}
        />
      );

      if (this.instance) {
        this.instance.rerender(node);
        return;
      }

      this.instance = render(node, {
        stdout: process.stderr,
        exitOnCtrlC: false
      });
    });
  }

  suspend(): void {
    if (!this.instance) {
      return;
    }

    this.instance.clear();
    this.instance.unmount();
    this.instance.cleanup();
    this.instance = null;
  }

  close(): void {
    this.suspend();
  }
}

export function createInitUiSession(): InitUiSession {
  return new InkInitUiSession();
}

export async function runInitScreen<T extends string>(
  spec: InitScreenSpec<T>
): Promise<InitScreenResult<T>> {
  const session = createInitUiSession();

  try {
    return await session.showScreen(spec, []);
  } finally {
    session.close();
  }
}

function InitScreenView<T extends string>(props: {
  spec: InitScreenSpec<T>;
  history: InitHistoryItem[];
  onResolve: (result: InitScreenResult<T>) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(() =>
    resolveInitialIndex(props.spec.options, props.spec.initialValue)
  );
  const [showHelp, setShowHelp] = useState(false);
  const [isSettled, setIsSettled] = useState(false);

  const filteredOptions = getFilteredOptions(props.spec.options, query, Boolean(props.spec.searchable));
  const effectiveIndex = filteredOptions.length === 0
    ? 0
    : Math.min(selectedIndex, filteredOptions.length - 1);

  useInput((input, key) => {
    if (isSettled) {
      return;
    }

    if (key.ctrl && input === 'c') {
      setIsSettled(true);
      props.onCancel();
      return;
    }

    if (key.escape && props.spec.allowCancel !== false) {
      setIsSettled(true);
      props.onCancel();
      return;
    }

    if ((input === 'b' || input === 'B') && props.spec.allowBack) {
      setIsSettled(true);
      props.onResolve({type: 'back'});
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
      setIsSettled(true);
      props.onResolve({
        type: 'submit',
        value: filteredOptions[effectiveIndex]!.value
      });
    }
  });

  return (
    <InitScreenLayout
      spec={props.spec}
      history={props.history}
      query={query}
      showHelp={showHelp}
      filteredOptions={filteredOptions}
      effectiveIndex={effectiveIndex}
    />
  );
}

export function InitScreenLayout<T extends string>(props: {
  spec: InitScreenSpec<T>;
  history: InitHistoryItem[];
  query: string;
  showHelp: boolean;
  filteredOptions: InitScreenOption<T>[];
  effectiveIndex: number;
}) {
  const hints = buildHintBar(props.spec);
  const headerRailTone: DialogRailTone = 'muted';
  const choiceRailTone: DialogRailTone = 'active';

  return (
    <DialogFrame
      title={props.spec.title ?? INIT_DIALOG_TITLE}
      prefix={undefined}
    >
      <DialogLine railTone={headerRailTone} />
      {props.history.map((item, index) => (
        <React.Fragment key={`${index}:${item.screen}:${item.prompt}`}>
          <DialogHistoryStep
            prompt={item.prompt}
            responseLines={item.responseLines}
            tone={item.tone}
          />
          <DialogLine railTone={headerRailTone} />
        </React.Fragment>
      ))}
      <DialogPrompt prompt={props.spec.prompt} tone={props.spec.tone} />
      <DialogLine railTone={headerRailTone} />
      {renderTextLines(props.spec.bodyLines, headerRailTone)}
      {props.spec.summaryItems && props.spec.summaryItems.length > 0 ? (
        <SummaryBlock items={props.spec.summaryItems} railTone={headerRailTone} />
      ) : null}
      <DialogLine railTone="none" />
      {props.spec.searchable ? (
        <DialogLine railTone={choiceRailTone}>
          <Text color={initTheme.secondary}>{`${props.spec.searchLabel ?? 'Search'}: `}</Text>
          {props.query.length > 0 ? <Text color={initTheme.primary}>{props.query}</Text> : null}
          <Text backgroundColor={initTheme.cursor}> </Text>
        </DialogLine>
      ) : null}
      {props.filteredOptions.length > 0 ? (
        <SelectList
          items={props.filteredOptions.map((option, index) => ({
            label: option.label,
            detail: option.detail,
            selected: index === props.effectiveIndex
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
      {props.showHelp && props.spec.helpLines && props.spec.helpLines.length > 0 ? (
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
