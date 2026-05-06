import fs from 'node:fs/promises';
import path from 'node:path';
import type {ProjectType} from '../types.js';

interface ProjectMarkerState {
  files: Set<string>;
  packageJsonDependencies: Set<string>;
  pythonDependencies: Set<string>;
  counts: {
    ts: number;
    js: number;
    py: number;
    go: number;
    java: number;
    cs: number;
    ipynb: number;
  };
}

export interface DetectedProjectCandidate {
  projectType: ProjectType;
  label: string;
  defaultPolicyId: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

export interface DetectedProjectSummary {
  recommended: DetectedProjectCandidate;
  candidates: DetectedProjectCandidate[];
  ambiguous: boolean;
}

const DIRECTORY_SKIP = new Set([
  '.git',
  '.openshrike',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'bin',
  'obj'
]);

const PROJECT_LABELS: Record<ProjectType, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  'python-ml': 'Python ML',
  pytorch: 'PyTorch',
  csharp: 'C#',
  go: 'Go',
  java: 'Java',
  shared: 'Shared / Mixed'
};

const DEFAULT_POLICIES: Record<ProjectType, string> = {
  typescript: 'typescript-baseline',
  javascript: 'javascript-baseline',
  python: 'python-baseline',
  'python-ml': 'python-ml-baseline',
  pytorch: 'pytorch-baseline',
  csharp: 'csharp-baseline',
  go: 'go-baseline',
  java: 'java-baseline',
  shared: 'shared-foundation'
};

export async function detectProjectType(repoRoot: string): Promise<DetectedProjectSummary> {
  const markers = await collectProjectMarkers(repoRoot);
  const candidates = buildProjectCandidates(markers)
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  const topCandidate = candidates[0] ?? buildSharedFallback([]);
  const secondCandidate = candidates[1] ?? null;
  const ambiguous = topCandidate.projectType !== 'shared'
    && secondCandidate !== null
    && secondCandidate.score >= Math.max(8, topCandidate.score - 2);

  if (ambiguous || topCandidate.score < 8) {
    const evidence = [...new Set(candidates.flatMap(candidate => candidate.evidence))].slice(0, 6);
    const sharedFallback = buildSharedFallback(evidence.length > 0 ? evidence : ['repository layout']);

    return {
      recommended: sharedFallback,
      candidates: [sharedFallback, ...candidates.filter(candidate => candidate.projectType !== 'shared')],
      ambiguous: true
    };
  }

  return {
    recommended: topCandidate,
    candidates,
    ambiguous: false
  };
}

export function rankPoliciesForProject(
  policyIds: string[],
  detection: DetectedProjectSummary
): string[] {
  const preferred = new Set<string>([
    detection.recommended.defaultPolicyId,
    ...getAdjacentPolicies(detection.recommended.projectType),
    'shared-foundation'
  ]);

  const existingPreferred = policyIds.filter(policyId => preferred.has(policyId));
  const remaining = policyIds.filter(policyId => !preferred.has(policyId)).sort((left, right) => left.localeCompare(right));

  return [
    ...sortByPreferredOrder(existingPreferred, [
      detection.recommended.defaultPolicyId,
      ...getAdjacentPolicies(detection.recommended.projectType),
      'shared-foundation'
    ]),
    ...remaining
  ];
}

function buildProjectCandidates(markers: ProjectMarkerState): DetectedProjectCandidate[] {
  const candidates: Array<{projectType: ProjectType; score: number; evidence: string[]}> = [];

  candidates.push(buildCandidate('typescript', markers, candidate => {
    addScore(candidate, hasFile(markers, 'tsconfig.json'), 12, 'tsconfig.json');
    addScore(candidate, hasDependency(markers.packageJsonDependencies, 'typescript'), 8, 'package.json');
    addScore(candidate, markers.counts.ts > 0, Math.min(6, markers.counts.ts), 'src/**/*.ts');
  }));

  candidates.push(buildCandidate('javascript', markers, candidate => {
    addScore(candidate, hasFile(markers, 'package.json'), 5, 'package.json');
    addScore(candidate, markers.counts.js > 0, Math.min(5, markers.counts.js), 'src/**/*.js');
    if (hasFile(markers, 'tsconfig.json')) {
      candidate.score -= 6;
    }
  }));

  candidates.push(buildCandidate('python', markers, candidate => {
    addScore(candidate, hasFile(markers, 'pyproject.toml'), 10, 'pyproject.toml');
    addScore(candidate, hasFile(markers, 'requirements.txt'), 8, 'requirements.txt');
    addScore(candidate, hasFile(markers, 'setup.py'), 7, 'setup.py');
    addScore(candidate, markers.counts.py > 0, Math.min(5, markers.counts.py), '*.py');
  }));

  candidates.push(buildCandidate('python-ml', markers, candidate => {
    addScore(candidate, hasDependency(markers.pythonDependencies, 'jupyter'), 5, 'pyproject.toml');
    addScore(candidate, hasDependency(markers.pythonDependencies, 'pandas'), 4, 'pyproject.toml');
    addScore(candidate, hasDependency(markers.pythonDependencies, 'scikit-learn'), 4, 'pyproject.toml');
    addScore(candidate, hasDependency(markers.pythonDependencies, 'mlflow'), 4, 'pyproject.toml');
    addScore(candidate, hasDependency(markers.pythonDependencies, 'xgboost'), 4, 'pyproject.toml');
    addScore(candidate, hasFile(markers, 'notebooks'), 4, 'notebooks/');
    addScore(candidate, hasFile(markers, 'train.py'), 3, 'train.py');
    addScore(candidate, hasFile(markers, 'evaluate.py'), 3, 'evaluate.py');
    addScore(candidate, markers.counts.ipynb > 0, Math.min(4, markers.counts.ipynb), '*.ipynb');
  }));

  candidates.push(buildCandidate('pytorch', markers, candidate => {
    addScore(candidate, hasDependency(markers.pythonDependencies, 'torch'), 8, 'pyproject.toml');
    addScore(candidate, hasDependency(markers.pythonDependencies, 'lightning'), 4, 'pyproject.toml');
    addScore(candidate, hasDependency(markers.pythonDependencies, 'accelerate'), 4, 'pyproject.toml');
  }));

  candidates.push(buildCandidate('csharp', markers, candidate => {
    addScore(candidate, hasFileWithSuffix(markers, '.sln'), 12, '*.sln');
    addScore(candidate, hasFileWithSuffix(markers, '.csproj'), 10, '*.csproj');
    addScore(candidate, hasFile(markers, 'Directory.Build.props'), 8, 'Directory.Build.props');
    addScore(candidate, markers.counts.cs > 0, Math.min(4, markers.counts.cs), '*.cs');
  }));

  candidates.push(buildCandidate('go', markers, candidate => {
    addScore(candidate, hasFile(markers, 'go.mod'), 12, 'go.mod');
    addScore(candidate, markers.counts.go > 0, Math.min(5, markers.counts.go), '*.go');
  }));

  candidates.push(buildCandidate('java', markers, candidate => {
    addScore(candidate, hasFile(markers, 'pom.xml'), 10, 'pom.xml');
    addScore(candidate, hasFile(markers, 'build.gradle'), 9, 'build.gradle');
    addScore(candidate, hasFile(markers, 'settings.gradle'), 5, 'settings.gradle');
    addScore(candidate, markers.counts.java > 0, Math.min(4, markers.counts.java), '*.java');
  }));

  return candidates.map(candidate => ({
    projectType: candidate.projectType,
    label: PROJECT_LABELS[candidate.projectType],
    defaultPolicyId: DEFAULT_POLICIES[candidate.projectType],
    score: candidate.score,
    confidence: candidate.score >= 14 ? 'high' : candidate.score >= 8 ? 'medium' : 'low',
    evidence: unique(candidate.evidence).slice(0, 6)
  }));
}

async function collectProjectMarkers(repoRoot: string): Promise<ProjectMarkerState> {
  const files = new Set<string>();
  const packageJsonDependencies = new Set<string>();
  const pythonDependencies = new Set<string>();
  const counts = {
    ts: 0,
    js: 0,
    py: 0,
    go: 0,
    java: 0,
    cs: 0,
    ipynb: 0
  };

  await walk(repoRoot, async relativePath => {
    files.add(relativePath);
    const lower = relativePath.toLowerCase();

    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
      counts.ts += 1;
    } else if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
      counts.js += 1;
    } else if (lower.endsWith('.py')) {
      counts.py += 1;
    } else if (lower.endsWith('.go')) {
      counts.go += 1;
    } else if (lower.endsWith('.java')) {
      counts.java += 1;
    } else if (lower.endsWith('.cs')) {
      counts.cs += 1;
    } else if (lower.endsWith('.ipynb')) {
      counts.ipynb += 1;
    }

    if (relativePath === 'package.json') {
      const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const dependency of Object.keys({
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {})
      })) {
        packageJsonDependencies.add(dependency.toLowerCase());
      }
    }

    if (relativePath === 'pyproject.toml' || relativePath === 'requirements.txt' || relativePath === 'setup.py') {
      const content = (await fs.readFile(path.join(repoRoot, relativePath), 'utf8')).toLowerCase();
      for (const dependency of ['jupyter', 'pandas', 'scikit-learn', 'mlflow', 'xgboost', 'torch', 'lightning', 'accelerate']) {
        if (content.includes(dependency)) {
          pythonDependencies.add(dependency);
        }
      }
    }
  });

  return {
    files,
    packageJsonDependencies,
    pythonDependencies,
    counts
  };
}

async function walk(
  root: string,
  visitFile: (relativePath: string) => Promise<void>
): Promise<void> {
  const queue = [''];

  while (queue.length > 0) {
    const relativeDirectory = queue.shift()!;
    const absoluteDirectory = path.join(root, relativeDirectory);
    const entries = await fs.readdir(absoluteDirectory, {withFileTypes: true});

    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!DIRECTORY_SKIP.has(entry.name)) {
          queue.push(relativePath);
          if (entry.name === 'notebooks') {
            await visitFile(relativePath);
          }
        }
        continue;
      }

      await visitFile(relativePath);
    }
  }
}

function buildCandidate(
  projectType: ProjectType,
  markers: ProjectMarkerState,
  populate: (candidate: {projectType: ProjectType; score: number; evidence: string[]}) => void
): {projectType: ProjectType; score: number; evidence: string[]} {
  const candidate = {
    projectType,
    score: 0,
    evidence: [] as string[]
  };
  populate(candidate);

  if ((projectType === 'python-ml' || projectType === 'pytorch') && !hasPythonBase(markers)) {
    candidate.score = Math.max(0, candidate.score - 6);
  }

  return candidate;
}

function buildSharedFallback(evidence: string[]): DetectedProjectCandidate {
  return {
    projectType: 'shared',
    label: PROJECT_LABELS.shared,
    defaultPolicyId: DEFAULT_POLICIES.shared,
    score: 1,
    confidence: 'low',
    evidence
  };
}

function hasPythonBase(markers: ProjectMarkerState): boolean {
  return hasFile(markers, 'pyproject.toml')
    || hasFile(markers, 'requirements.txt')
    || hasFile(markers, 'setup.py')
    || markers.counts.py > 0;
}

function hasFile(markers: ProjectMarkerState, fileName: string): boolean {
  return markers.files.has(fileName);
}

function hasFileWithSuffix(markers: ProjectMarkerState, suffix: string): boolean {
  const normalizedSuffix = suffix.toLowerCase();
  for (const filePath of markers.files) {
    if (filePath.toLowerCase().endsWith(normalizedSuffix)) {
      return true;
    }
  }

  return false;
}

function hasDependency(dependencies: Set<string>, dependency: string): boolean {
  return dependencies.has(dependency.toLowerCase());
}

function addScore(
  candidate: {score: number; evidence: string[]},
  condition: boolean,
  score: number,
  evidence: string
): void {
  if (!condition) {
    return;
  }

  candidate.score += score;
  candidate.evidence.push(evidence);
}

function unique(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function getAdjacentPolicies(projectType: ProjectType): string[] {
  switch (projectType) {
    case 'typescript':
      return ['javascript-baseline'];
    case 'javascript':
      return ['typescript-baseline'];
    case 'python':
      return ['python-ml-baseline', 'pytorch-baseline'];
    case 'python-ml':
      return ['python-baseline', 'pytorch-baseline'];
    case 'pytorch':
      return ['python-baseline', 'python-ml-baseline'];
    default:
      return [];
  }
}

function sortByPreferredOrder(values: string[], order: string[]): string[] {
  const ranking = new Map(order.map((value, index) => [value, index]));
  return [...values].sort((left, right) => {
    const leftRank = ranking.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = ranking.get(right) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.localeCompare(right);
  });
}
