export interface InitEnvironmentState {
  statusKind: 'checking' | 'ready' | 'missing' | 'unsupported' | 'error';
  requiredNodeRange: '>=22';
  detectedVersion: string | null;
  detectedPath: string | null;
  message: string;
  checkedAtMs: number | null;
}

export const REQUIRED_NODE_RANGE = '>=22';
export const REQUIRED_NODE_MAJOR = 22;

export function createCheckingInitEnvironmentState(): InitEnvironmentState {
  return {
    statusKind: 'checking',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedVersion: null,
    detectedPath: null,
    message: 'Checking Node.js on the workspace host...',
    checkedAtMs: null
  };
}

export function createReadyInitEnvironmentState(input: {
  detectedVersion: string;
  detectedPath: string;
  checkedAtMs?: number;
}): InitEnvironmentState {
  return {
    statusKind: 'ready',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedVersion: input.detectedVersion,
    detectedPath: input.detectedPath,
    message: `Node.js ${input.detectedVersion} detected`,
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function createMissingInitEnvironmentState(checkedAtMs = Date.now()): InitEnvironmentState {
  return {
    statusKind: 'missing',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedVersion: null,
    detectedPath: null,
    message: 'Node.js was not found on the workspace host',
    checkedAtMs
  };
}

export function createUnsupportedInitEnvironmentState(input: {
  detectedVersion: string;
  detectedPath: string | null;
  checkedAtMs?: number;
}): InitEnvironmentState {
  return {
    statusKind: 'unsupported',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedVersion: input.detectedVersion,
    detectedPath: input.detectedPath,
    message: `Found Node.js ${input.detectedVersion}, but OpenShrike requires 22+`,
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function createErrorInitEnvironmentState(input: {
  detectedVersion?: string | null;
  detectedPath?: string | null;
  message?: string;
  checkedAtMs?: number;
} = {}): InitEnvironmentState {
  return {
    statusKind: 'error',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedVersion: input.detectedVersion ?? null,
    detectedPath: input.detectedPath ?? null,
    message: input.message ?? 'Could not verify Node.js on the workspace host',
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function isInitEnvironmentReady(
  state: InitEnvironmentState
): state is InitEnvironmentState & {statusKind: 'ready'; detectedPath: string; detectedVersion: string} {
  return state.statusKind === 'ready' && state.detectedPath !== null;
}

export function isNodeVersionSupported(version: string): boolean {
  const majorVersion = parseNodeMajorVersion(version);
  return majorVersion !== null && majorVersion >= REQUIRED_NODE_MAJOR;
}

export function parseNodeMajorVersion(version: string): number | null {
  const match = /^v?(\d+)(?:\.\d+){0,2}$/u.exec(version.trim());
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1] ?? '', 10);
}
