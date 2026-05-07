import path from 'node:path';
import {CommanderError} from 'commander';
import {DEFAULT_OUTPUT} from './constants.js';
import {loadProjectConfigForRepo} from './project-config.js';
import type {OutputFormat, ScanCommandOptions} from './types.js';

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  const message = normalizeCliErrorMessage(error);

  if (error instanceof CommanderError) {
    return new CliError('INVALID_ARGUMENTS', message);
  }

  if (/exactly one|scan-target|required option|missing (required )?argument|unknown (command|option)|too many arguments|argument .+ is invalid/i.test(message)) {
    return new CliError('INVALID_ARGUMENTS', message);
  }

  if (/missing required environment variable/i.test(message)) {
    return new CliError('MISSING_ENVIRONMENT', message);
  }

  if (/unknown (policy|check) id/i.test(message)) {
    return new CliError('UNKNOWN_REFERENCE', message);
  }

  if (/guardrail violation/i.test(message)) {
    return new CliError('READ_ONLY_GUARDRAIL_VIOLATION', message);
  }

  return new CliError('SCAN_FAILED', message);
}

export function renderCliError(error: CliError, format: OutputFormat): string {
  return format === 'json'
    ? renderCliErrorJson(error)
    : renderCliErrorMarkdown(error);
}

export function renderCliErrorJson(error: CliError): string {
  return JSON.stringify(
    {
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      }
    },
    null,
    2
  );
}

export function renderCliErrorMarkdown(error: CliError): string {
  const lines = [
    '# OpenShrike Error',
    '',
    error.message,
    '',
    `- Code: \`${error.code}\``
  ];
  const detailLines = renderCliErrorDetailsMarkdown(error.details);
  if (detailLines.length > 0) {
    lines.push('', ...detailLines);
  }

  return lines.join('\n');
}

export async function resolveScanOutputFormat(
  rawOptions: Partial<Pick<ScanCommandOptions, 'outputFormat' | 'repoPath'>>
): Promise<OutputFormat> {
  if (isOutputFormat(rawOptions.outputFormat)) {
    return rawOptions.outputFormat;
  }

  return await resolveProjectOutputFormat(rawOptions.repoPath);
}

export async function resolveCliOutputFormatFromArgv(argv: string[]): Promise<OutputFormat> {
  if (argv[2] !== 'scan') {
    return DEFAULT_OUTPUT;
  }

  const explicitOutput = readOptionValue(argv.slice(3), '--output');
  if (isOutputFormat(explicitOutput)) {
    return explicitOutput;
  }

  return await resolveProjectOutputFormat(readOptionValue(argv.slice(3), '--repo'));
}

function normalizeCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^error:\s*/i, '').trim();
}

function renderCliErrorDetailsMarkdown(details: unknown): string[] {
  if (details == null) {
    return [];
  }

  if (typeof details !== 'object' || Array.isArray(details)) {
    return [
      '## Details',
      '',
      `- ${formatDetailValue('details', details)}`
    ];
  }

  const entries = Object.entries(details);
  const actionsEntry = entries.find(([key, value]) => key === 'actions' && Array.isArray(value));
  const detailEntries = entries.filter(([key, value]) => {
    if (key === 'actions') {
      return false;
    }

    return value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0);
  });
  const lines: string[] = [];

  if (detailEntries.length > 0) {
    lines.push('## Details', '');
    for (const [key, value] of detailEntries) {
      lines.push(`- ${formatDetailLabel(key)}: ${formatDetailValue(key, value)}`);
    }
  }

  if (actionsEntry) {
    const actions = actionsEntry[1] as unknown[];
    if (actions.length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }

      lines.push('## Next Steps', '');
      actions.forEach((action, index) => {
        lines.push(`${index + 1}. ${String(action)}`);
      });
    }
  }

  return lines;
}

function formatDetailLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function formatDetailValue(key: string, value: unknown): string {
  if (typeof value === 'string') {
    return shouldRenderAsCode(key, value) ? `\`${value}\`` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `\`${String(value)}\``;
  }

  if (Array.isArray(value)) {
    return value.map(item => formatArrayItem(key, item)).join(', ');
  }

  if (value && typeof value === 'object') {
    return `\`${JSON.stringify(value)}\``;
  }

  return `\`${String(value)}\``;
}

function formatArrayItem(key: string, value: unknown): string {
  if (typeof value === 'string') {
    return shouldRenderAsCode(key, value) ? `\`${value}\`` : value;
  }

  return `\`${String(value)}\``;
}

function shouldRenderAsCode(key: string, value: string): boolean {
  return /path|repo|model|env/i.test(key)
    || value.includes(path.sep)
    || value.includes('/')
    || value.startsWith('.')
    || value.startsWith('--')
    || /^[A-Z0-9_]+$/.test(value);
}

async function resolveProjectOutputFormat(repoPath?: string): Promise<OutputFormat> {
  try {
    const loadedProjectConfig = await loadProjectConfigForRepo(path.resolve(repoPath ?? '.'));
    return loadedProjectConfig?.config.scan.output ?? DEFAULT_OUTPUT;
  } catch {
    return DEFAULT_OUTPUT;
  }
}

function readOptionValue(argv: string[], optionName: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === optionName) {
      return argv[index + 1];
    }

    if (token.startsWith(`${optionName}=`)) {
      return token.slice(optionName.length + 1);
    }
  }

  return undefined;
}

function isOutputFormat(value: unknown): value is OutputFormat {
  return value === 'json' || value === 'markdown';
}
