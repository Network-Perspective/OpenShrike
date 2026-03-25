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

  const message = error instanceof Error ? error.message : String(error);

  if (/exactly one|scan-target|required/i.test(message)) {
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
