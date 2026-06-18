import {
  findFindingById,
  getDefaultSelectedFindingId,
  sortFindings,
  type Finding,
  type FindingSortMode,
  type ScanState
} from './scan-data.js';
import type {InitEnvironmentState} from './init-environment-state.js';
import {buildScanViewModel, type ScanViewModel} from './scan-view-model.js';

type Listener = () => void;

export class OpenShrikeExtensionModel {
  private readonly listeners = new Set<Listener>();
  private selectedFindingId: string | null;
  private sortMode: FindingSortMode = 'status';
  private state: ScanState;

  constructor(
    state: ScanState,
    initialFindingId: string | null
  ) {
    this.state = state;
    this.selectedFindingId = initialFindingId;
  }

  getState(): ScanState {
    return this.state;
  }

  getSelectedFindingId(): string | null {
    return this.selectedFindingId;
  }

  getSortMode(): FindingSortMode {
    return this.sortMode;
  }

  getViewModel(): ScanViewModel {
    return buildScanViewModel({
      state: this.state,
      selectedFindingId: this.selectedFindingId,
      sortMode: this.sortMode
    });
  }

  getSortedFindings(): Finding[] {
    return sortFindings(this.state.findings, this.sortMode);
  }

  getSelectedFinding(): Finding | null {
    if (!this.selectedFindingId) {
      return null;
    }

    return findFindingById(this.state, this.selectedFindingId);
  }

  getFindingById(findingId: string): Finding | null {
    return findFindingById(this.state, findingId);
  }

  setState(nextState: ScanState): void {
    this.state = {
      ...nextState,
      initEnvironment: nextState.initEnvironment ?? this.state.initEnvironment
    };

    if (this.selectedFindingId && findFindingById(this.state, this.selectedFindingId)) {
      this.emit();
      return;
    }

    this.selectedFindingId = getDefaultSelectedFindingId(this.state);
    this.emit();
  }

  setInitEnvironment(initEnvironment: InitEnvironmentState): void {
    if (isSameInitEnvironmentState(this.state.initEnvironment, initEnvironment)) {
      return;
    }

    this.state = {
      ...this.state,
      initEnvironment
    };
    this.emit();
  }

  selectFinding(findingId: string): void {
    if (findingId === this.selectedFindingId) {
      return;
    }

    const finding = findFindingById(this.state, findingId);

    if (!finding) {
      return;
    }

    this.selectedFindingId = finding.id;
    this.emit();
  }

  setSortMode(sortMode: FindingSortMode): void {
    if (sortMode === this.sortMode) {
      return;
    }

    this.sortMode = sortMode;
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function isSameInitEnvironmentState(left: InitEnvironmentState, right: InitEnvironmentState): boolean {
  return left.statusKind === right.statusKind
    && left.requiredNodeRange === right.requiredNodeRange
    && left.detectedNodeVersion === right.detectedNodeVersion
    && left.detectedNodePath === right.detectedNodePath
    && left.detectedShrikePath === right.detectedShrikePath
    && left.message === right.message
    && left.checkedAtMs === right.checkedAtMs;
}
