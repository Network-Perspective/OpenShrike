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

export type InitScreenSelectionMode = 'single' | 'multiple';

export interface InitScreenSpec<T extends string> {
  title?: string;
  prompt: string;
  tone?: 'normal' | 'warning' | 'error';
  bodyLines?: string[];
  summaryItems?: Array<{label: string; value: string}>;
  noteLines?: string[];
  options: InitScreenOption<T>[];
  initialValue?: T | undefined;
  initialValues?: T[] | undefined;
  selectionMode?: InitScreenSelectionMode | undefined;
  minSelections?: number | undefined;
  searchable?: boolean | undefined;
  searchLabel?: string | undefined;
  allowBack?: boolean | undefined;
  allowCancel?: boolean | undefined;
  helpLines?: string[] | undefined;
}

export type InitScreenResult<T extends string> =
  | {type: 'submit'; value: T}
  | {type: 'submit'; values: T[]}
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

interface OptionNavigationState {
  selectedIndex: number;
  visibleStart: number;
}

const MAX_VISIBLE_OPTIONS = 10;

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
  const [navigation, setNavigation] = useState<OptionNavigationState>(() =>
    createInitialOptionNavigation(props.spec.options, resolveInitialNavigationValue(props.spec))
  );
  const [selectedValues, setSelectedValues] = useState<T[]>(() =>
    createInitialSelectedValues(props.spec)
  );
  const [showHelp, setShowHelp] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
  const selectionMode = props.spec.selectionMode ?? 'single';
  const minSelections = selectionMode === 'multiple'
    ? Math.max(0, props.spec.minSelections ?? 1)
    : 0;

  const filteredOptions = getFilteredOptions(props.spec.options, query, Boolean(props.spec.searchable));
  const effectiveNavigation = resolveOptionNavigation(navigation, filteredOptions.length);
  const effectiveIndex = effectiveNavigation.selectedIndex;

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

    if (selectionMode === 'multiple' && input === ' ' && filteredOptions.length > 0) {
      const toggledValue = filteredOptions[effectiveIndex]!.value;
      setSelectedValues(previous =>
        toggleSelectedValues(previous, toggledValue, props.spec.options, minSelections)
      );
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
      setNavigation(previous => moveOptionNavigation(previous, filteredOptions.length, -1));
      return;
    }

    if (key.downArrow) {
      setNavigation(previous => moveOptionNavigation(previous, filteredOptions.length, 1));
      return;
    }

    if (key.return && selectionMode === 'multiple') {
      const orderedSelection = orderSelectedValues(props.spec.options, selectedValues);
      if (orderedSelection.length < minSelections) {
        return;
      }

      setIsSettled(true);
      props.onResolve({
        type: 'submit',
        values: orderedSelection
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
      selectedValues={selectedValues}
      effectiveIndex={effectiveIndex}
      visibleStart={effectiveNavigation.visibleStart}
    />
  );
}

export function InitScreenLayout<T extends string>(props: {
  spec: InitScreenSpec<T>;
  history: InitHistoryItem[];
  query: string;
  showHelp: boolean;
  filteredOptions: InitScreenOption<T>[];
  selectedValues: T[];
  effectiveIndex: number;
  visibleStart: number;
}) {
  const hints = buildHintBar(props.spec);
  const headerRailTone: DialogRailTone = 'muted';
  const choiceRailTone: DialogRailTone = 'active';
  const visibleWindow = getVisibleOptionWindow(
    props.filteredOptions,
    props.effectiveIndex,
    props.visibleStart
  );

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
        <>
          <SelectList
            items={visibleWindow.options.map((option, index) => ({
              label: option.label,
              detail: option.detail,
              active: visibleWindow.start + index === props.effectiveIndex,
              checked: props.selectedValues.includes(option.value),
              selectionMode: props.spec.selectionMode
            }))}
            railTone={choiceRailTone}
          />
          {props.filteredOptions.length > MAX_VISIBLE_OPTIONS ? (
            <DialogLine railTone={choiceRailTone}>
              <Text color={initTheme.secondary}>
                {`Showing ${visibleWindow.start + 1}-${visibleWindow.end} of ${props.filteredOptions.length}`}
              </Text>
            </DialogLine>
          ) : null}
        </>
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
  const hints = ['↑/↓ to select'];
  if (spec.selectionMode === 'multiple') {
    hints.push('Space: toggle');
  }
  hints.push('Enter: confirm');

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

function createInitialOptionNavigation<T extends string>(
  options: InitScreenOption<T>[],
  initialValue: T | undefined
): OptionNavigationState {
  const selectedIndex = resolveInitialIndex(options, initialValue);
  return {
    selectedIndex,
    visibleStart: resolveInitialVisibleStart(selectedIndex, options.length)
  };
}

function resolveInitialNavigationValue<T extends string>(spec: InitScreenSpec<T>): T | undefined {
  if (spec.selectionMode === 'multiple') {
    return spec.initialValues?.[0] ?? spec.initialValue;
  }

  return spec.initialValue;
}

function createInitialSelectedValues<T extends string>(spec: InitScreenSpec<T>): T[] {
  const ordered = orderSelectedValues(
    spec.options,
    spec.selectionMode === 'multiple'
      ? spec.initialValues ?? (spec.initialValue ? [spec.initialValue] : [])
      : spec.initialValue
        ? [spec.initialValue]
        : []
  );

  if (spec.selectionMode === 'multiple' && ordered.length === 0 && (spec.minSelections ?? 1) > 0) {
    return spec.options[0] ? [spec.options[0].value] : [];
  }

  return ordered;
}

function orderSelectedValues<T extends string>(
  options: InitScreenOption<T>[],
  selectedValues: T[]
): T[] {
  const available = new Set(options.map(option => option.value));
  const selected = new Set(selectedValues.filter(value => available.has(value)));

  return options
    .map(option => option.value)
    .filter(value => selected.has(value));
}

function toggleSelectedValues<T extends string>(
  selectedValues: T[],
  value: T,
  options: InitScreenOption<T>[],
  minSelections: number
): T[] {
  if (selectedValues.includes(value)) {
    if (selectedValues.length <= minSelections) {
      return selectedValues;
    }

    return selectedValues.filter(candidate => candidate !== value);
  }

  return orderSelectedValues(options, [...selectedValues, value]);
}

export function moveOptionNavigation(
  navigation: OptionNavigationState,
  itemCount: number,
  direction: -1 | 1
): OptionNavigationState {
  if (itemCount <= 0) {
    return {
      selectedIndex: 0,
      visibleStart: 0
    };
  }

  const current = resolveOptionNavigation(navigation, itemCount);
  const nextIndex = direction < 0
    ? (current.selectedIndex <= 0 ? itemCount - 1 : current.selectedIndex - 1)
    : (current.selectedIndex >= itemCount - 1 ? 0 : current.selectedIndex + 1);
  const windowEnd = Math.min(itemCount, current.visibleStart + MAX_VISIBLE_OPTIONS) - 1;
  let visibleStart = current.visibleStart;

  if (nextIndex < current.visibleStart) {
    visibleStart = nextIndex;
  } else if (nextIndex > windowEnd) {
    visibleStart = nextIndex - MAX_VISIBLE_OPTIONS + 1;
  }

  return {
    selectedIndex: nextIndex,
    visibleStart: clampVisibleStart(visibleStart, itemCount)
  };
}

function resolveOptionNavigation(
  navigation: OptionNavigationState,
  itemCount: number
): OptionNavigationState {
  if (itemCount <= 0) {
    return {
      selectedIndex: 0,
      visibleStart: 0
    };
  }

  const selectedIndex = clampIndex(navigation.selectedIndex, itemCount);
  let visibleStart = clampVisibleStart(navigation.visibleStart, itemCount);
  const visibleEndExclusive = Math.min(itemCount, visibleStart + MAX_VISIBLE_OPTIONS);

  if (selectedIndex < visibleStart) {
    visibleStart = selectedIndex;
  } else if (selectedIndex >= visibleEndExclusive) {
    visibleStart = selectedIndex - MAX_VISIBLE_OPTIONS + 1;
  }

  return {
    selectedIndex,
    visibleStart: clampVisibleStart(visibleStart, itemCount)
  };
}

function resolveInitialVisibleStart(selectedIndex: number, itemCount: number): number {
  if (itemCount <= MAX_VISIBLE_OPTIONS) {
    return 0;
  }

  return clampVisibleStart(Math.max(0, selectedIndex - MAX_VISIBLE_OPTIONS + 1), itemCount);
}

function getVisibleOptionWindow<T extends string>(
  options: InitScreenOption<T>[],
  selectedIndex: number,
  visibleStart: number
): {
  start: number;
  end: number;
  options: InitScreenOption<T>[];
} {
  const {visibleStart: start} = resolveOptionNavigation(
    {selectedIndex, visibleStart},
    options.length
  );
  const end = Math.min(options.length, start + MAX_VISIBLE_OPTIONS);

  return {
    start,
    end,
    options: options.slice(start, end)
  };
}

function clampIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, itemCount - 1));
}

function clampVisibleStart(visibleStart: number, itemCount: number): number {
  const maxVisibleStart = Math.max(0, itemCount - MAX_VISIBLE_OPTIONS);
  return Math.max(0, Math.min(visibleStart, maxVisibleStart));
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
