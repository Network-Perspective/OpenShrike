export interface InitEnvironmentState {
  statusKind: 'checking' | 'ready' | 'missing' | 'unsupported' | 'cli-missing' | 'error';
  requiredNodeRange: '>=22';
  detectedNodeVersion: string | null;
  detectedNodePath: string | null;
  detectedShrikePath: string | null;
  message: string;
  checkedAtMs: number | null;
}

export const REQUIRED_NODE_RANGE = '>=22';
export const REQUIRED_NODE_MAJOR = 22;
export const SHRIKE_CLI_INSTALL_COMMAND = 'npm install -g @networkperspective/openshrike';

export function createCheckingInitEnvironmentState(): InitEnvironmentState {
  return {
    statusKind: 'checking',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedNodeVersion: null,
    detectedNodePath: null,
    detectedShrikePath: null,
    message: 'Checking Node.js and shrike CLI on the workspace host...',
    checkedAtMs: null
  };
}

export function createReadyInitEnvironmentState(input: {
  detectedNodeVersion: string;
  detectedNodePath: string;
  detectedShrikePath: string;
  checkedAtMs?: number;
}): InitEnvironmentState {
  return {
    statusKind: 'ready',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedNodeVersion: input.detectedNodeVersion,
    detectedNodePath: input.detectedNodePath,
    detectedShrikePath: input.detectedShrikePath,
    message: `Node.js ${input.detectedNodeVersion} and shrike CLI detected`,
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function createMissingInitEnvironmentState(checkedAtMs = Date.now()): InitEnvironmentState {
  return {
    statusKind: 'missing',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedNodeVersion: null,
    detectedNodePath: null,
    detectedShrikePath: null,
    message: 'Node.js was not found on the workspace host',
    checkedAtMs
  };
}

export function createUnsupportedInitEnvironmentState(input: {
  detectedNodeVersion: string;
  detectedNodePath: string | null;
  checkedAtMs?: number;
}): InitEnvironmentState {
  return {
    statusKind: 'unsupported',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedNodeVersion: input.detectedNodeVersion,
    detectedNodePath: input.detectedNodePath,
    detectedShrikePath: null,
    message: `Found Node.js ${input.detectedNodeVersion}, but OpenShrike requires 22+`,
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function createMissingShrikeInitEnvironmentState(input: {
  detectedNodeVersion: string;
  detectedNodePath: string;
  checkedAtMs?: number;
}): InitEnvironmentState {
  return {
    statusKind: 'cli-missing',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedNodeVersion: input.detectedNodeVersion,
    detectedNodePath: input.detectedNodePath,
    detectedShrikePath: null,
    message: 'shrike CLI was not found on the workspace host',
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function createErrorInitEnvironmentState(input: {
  detectedNodeVersion?: string | null;
  detectedNodePath?: string | null;
  detectedShrikePath?: string | null;
  message?: string;
  checkedAtMs?: number;
} = {}): InitEnvironmentState {
  return {
    statusKind: 'error',
    requiredNodeRange: REQUIRED_NODE_RANGE,
    detectedNodeVersion: input.detectedNodeVersion ?? null,
    detectedNodePath: input.detectedNodePath ?? null,
    detectedShrikePath: input.detectedShrikePath ?? null,
    message: input.message ?? 'Could not verify Node.js and shrike CLI on the workspace host',
    checkedAtMs: input.checkedAtMs ?? Date.now()
  };
}

export function isInitEnvironmentReady(state: InitEnvironmentState): state is InitEnvironmentState & {
  statusKind: 'ready';
  detectedNodePath: string;
  detectedNodeVersion: string;
  detectedShrikePath: string;
} {
  return state.statusKind === 'ready'
    && state.detectedNodePath !== null
    && state.detectedShrikePath !== null;
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
