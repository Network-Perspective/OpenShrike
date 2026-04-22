import type {CheckResult, CheckStatus} from './types.js';

export const CHECK_STATUS_DISPLAY_ORDER: readonly CheckStatus[] = ['fail', 'unknown', 'pass'];

const CHECK_STATUS_HEADERS: Record<CheckStatus, string> = {
  fail: 'Failing Checks',
  unknown: 'Unknown Checks',
  pass: 'Passing Checks'
};

export function sortChecksByStatus(checks: readonly CheckResult[]): CheckResult[] {
  const groupedChecks: Record<CheckStatus, CheckResult[]> = {
    fail: [],
    unknown: [],
    pass: []
  };

  for (const check of checks) {
    groupedChecks[check.status].push(check);
  }

  return CHECK_STATUS_DISPLAY_ORDER.flatMap(status => groupedChecks[status]);
}

export function getCheckStatusHeader(status: CheckStatus): string {
  return CHECK_STATUS_HEADERS[status];
}
