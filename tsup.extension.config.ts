import {defineConfig} from 'tsup';

export default defineConfig({
  entry: {
    extension: 'src/vscode/extension.ts'
  },
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  clean: false,
  outDir: 'dist/vscode',
  external: ['vscode'],
  noExternal: ['@opencode-ai/sdk'],
  sourcemap: true,
  esbuildOptions(options) {
    options.packages = 'bundle';
  },
  outExtension() {
    return {
      js: '.cjs'
    };
  }
});
