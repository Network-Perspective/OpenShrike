import {describe, expect, it} from 'vitest';
import {isNodeVersionSupported, parseNodeMajorVersion} from '../src/vscode/init-environment-state.js';

describe('VS Code init environment', () => {
  it('rejects Node.js 21.x for the bundled init flow', () => {
    expect(parseNodeMajorVersion('v21.7.3')).toBe(21);
    expect(isNodeVersionSupported('v21.7.3')).toBe(false);
  });

  it('accepts Node.js 22.x for the bundled init flow', () => {
    expect(parseNodeMajorVersion('v22.0.0')).toBe(22);
    expect(isNodeVersionSupported('v22.0.0')).toBe(true);
  });

  it('accepts bare version strings as well as v-prefixed strings', () => {
    expect(parseNodeMajorVersion('22.18.0')).toBe(22);
    expect(isNodeVersionSupported('22.18.0')).toBe(true);
  });
});
