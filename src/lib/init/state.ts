import type {PolicyCatalogEntry} from '../policies.js';
import type {LoadedProjectConfig} from '../project-config.js';
import type {ProjectType, RuntimeMode} from '../types.js';
import type {DetectedProjectSummary} from './project-detect.js';
import type {DiscoveredOpenCodeSetup, ExistingInitDiscovery} from './discovery.js';
import type {InitWriteResult} from './write.js';

export type InitScreen =
  | 'existing-init'
  | 'opencode-discovery'
  | 'opencode-install'
  | 'model-selection'
  | 'policy-selection'
  | 'runtime-selection'
  | 'change-defaults'
  | 'success'
  | 'error';

export type ExistingInitAction = 'update' | 'replace' | 'exit';
export type OpenCodeDiscoveryAction = 'use-discovered' | 'auth-login' | 'exit';
export type OpenCodeInstallAction = 'install-curl' | 'install-npm' | 'install-brew' | 'back';
export type SuccessAction = 'run-scan' | 'change-defaults' | 'exit';
export type ChangeDefaultsAction = 'policy' | 'model' | 'runtime' | 'back';

export interface InitSelections {
  model?: string | undefined;
  policyId: string;
  runtimeMode: RuntimeMode;
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
  error: InitErrorState | null;
}
