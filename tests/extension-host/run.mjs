import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runTests} from '@vscode/test-electron';

const workspaceRoot = path.resolve(new URL('../..', import.meta.url).pathname);

try {
  const fixturePath = await createFixtureRepository();
  process.env.OPENSHRIKE_EXTENSION_TEST_REPO = fixturePath;

  await runTests({
    extensionDevelopmentPath: workspaceRoot,
    extensionTestsPath: path.join(workspaceRoot, 'tests', 'extension-host', 'suite.mjs'),
    launchArgs: [fixturePath, '--disable-extensions'],
    extensionTestsEnv: {
      OPENSHRIKE_EXTENSION_TEST_REPO: fixturePath
    }
  });
} catch (error) {
  console.error('Extension-host tests failed');
  console.error(error);
  process.exit(1);
}

async function createFixtureRepository() {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-vscode-test-'));
  await fs.mkdir(path.join(fixtureRoot, '.openshrike', 'checks'), {recursive: true});

  await fs.writeFile(path.join(fixtureRoot, 'README.md'), '# Fixture Repo\n\nOpenShrike extension host test fixture.\n', 'utf8');
  await fs.writeFile(path.join(fixtureRoot, 'package.json'), JSON.stringify({name: 'fixture-repo', private: true}, null, 2), 'utf8');
  await fs.writeFile(path.join(fixtureRoot, '.openshrike', 'project.json'), `${JSON.stringify({
    $schema: 'https://openshrike.dev/schema/project.json',
    version: 1,
    init: {
      projectType: 'typescript',
      detectedFrom: ['package.json'],
      opencodeSetup: 'existing-config',
      seedPolicyId: 'shared-baseline'
    },
    runtime: {
      configPath: '.openshrike/opencode.json',
      scanAgent: 'shrike-checker',
      scanModel: 'mock/model',
      fixAgent: 'shrike-fixer',
      fixModel: 'mock/model',
      mode: 'native',
      parallelism: 1
    },
    scan: {
      defaultKind: 'project-checks',
      defaultId: '.openshrike/checks',
      repo: '.',
      scope: 'full',
      output: 'markdown',
      ui: true,
      artifactsDir: null
    }
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(fixtureRoot, '.openshrike', 'opencode.json'), `${JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    model: 'mock/model',
    permission: {
      bash: 'allow',
      edit: 'deny',
      webfetch: 'deny',
      doom_loop: 'deny',
      external_directory: 'deny'
    },
    agent: {
      'shrike-checker': {
        description: 'Runs checks.',
        model: 'mock/model'
      },
      'shrike-fixer': {
        description: 'Fixes checks.',
        model: 'mock/model'
      }
    }
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(fixtureRoot, '.openshrike', 'checks', 'bp-test-001-sample.md'), [
    '# BP-TEST-001: Sample Check',
    '',
    'Ensure the repository includes a README.',
    '',
    '## Why',
    '',
    'Developers should see basic project documentation.',
    '',
    '## Review steps',
    '',
    '- Verify that README.md exists.',
    '',
    '## Pass criteria',
    '',
    '- README.md is present.'
  ].join('\n'), 'utf8');
  await initializeGitRepository(fixtureRoot);
  return fixtureRoot;
}

async function initializeGitRepository(repoPath) {
  const {spawn} = await import('node:child_process');

  for (const args of [
    ['init'],
    ['config', 'user.email', 'openshrike-tests@example.com'],
    ['config', 'user.name', 'OpenShrike Tests'],
    ['add', '.'],
    ['commit', '-m', 'Initial fixture']
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: repoPath,
        stdio: 'ignore'
      });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`git ${args.join(' ')} failed with code ${code}`));
      });
    });
  }
}
