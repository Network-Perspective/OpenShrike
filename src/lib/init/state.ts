import type {PolicyCatalogEntry} from '../policies.js';
import type {LoadedProjectConfig} from '../project-config.js';
import type {ParallelismValue, ProjectType, RuntimeMode} from '../types.js';
import type {DetectedProjectSummary} from './project-detect.js';
import type {DiscoveredOpenCodeSetup, ExistingInitDiscovery} from './discovery.js';
import type {InitWriteResult, InitWriteScope, ProjectConfigPatch} from './write.js';

export type InitScreen =
  | 'existing-init'
  | 'opencode-discovery'
  | 'opencode-install'
  | 'model-selection'
  | 'fix-model-choice'
  | 'policy-selection'
  | 'runtime-selection'
  | 'parallelism-selection'
  | 'change-defaults'
  | 'success'
  | 'error';

export type ExistingInitAction = 'update' | 'replace' | 'exit';
export type OpenCodeDiscoveryAction = 'use-discovered' | 'auth-login' | 'exit';
export type OpenCodeInstallAction = 'install-curl' | 'install-npm' | 'install-brew' | 'back';
export type SuccessAction = 'run-scan' | 'change-defaults' | 'exit';
export type ChangeDefaultsAction = 'policy' | 'scan-model' | 'fix-model' | 'runtime' | 'parallelism' | 'done';
export type FixModelChoiceAction = 'same-as-scan' | 'use-suggested' | 'choose-other' | 'back';

export interface InitSelections {
  model?: string | undefined;
  fixModel?: string | undefined;
  policyId: string;
  runtimeMode: RuntimeMode;
  parallelism: ParallelismValue;
  projectType: ProjectType;
  detectedFrom: string[];
  opencodeSetup: 'existing-config' | 'auth-login';
}

export interface InitErrorState {
  title: string;
  prompt: string;
  lines: string[];
  retryScreen: Exclude<InitScreen, 'error'>;
  backScreen: InitScreen;
  retryAction?:
    | 'refresh-opencode'
    | 'auth-login'
    | 'install-curl'
    | 'install-npm'
    | 'install-brew'
    | 'write-files'
    | 'none';
}

export interface InitWizardContext {
  repoRoot: string;
  existingInit: ExistingInitDiscovery;
  existingProjectConfig: LoadedProjectConfig | null;
  opencode: DiscoveredOpenCodeSetup;
  projectDetection: DetectedProjectSummary;
  policyCatalog: PolicyCatalogEntry[];
  selections: InitSelections;
  forceReplace: boolean;
  writeResult: InitWriteResult | null;
  lastWriteRequest: {
    scope: InitWriteScope;
    preserveExisting: boolean;
    projectPatch: ProjectConfigPatch;
  } | null;
  error: InitErrorState | null;
}
