import {
  findFindingById,
  getDefaultSelectedFindingId,
  sortMockFindings,
  type MockFinding,
  type MockFindingSortMode,
  type MockScanState
} from './mock-data.js';
import {buildMockScanViewModel, type MockScanViewModel} from './mock-view-model.js';

type Listener = () => void;

export class MockExtensionModel {
  private readonly listeners = new Set<Listener>();
  private selectedFindingId: string | null;
  private sortMode: MockFindingSortMode = 'status';
  private state: MockScanState;

  constructor(
    state: MockScanState,
    initialFindingId: string | null
  ) {
    this.state = state;
    this.selectedFindingId = initialFindingId;
  }

  getState(): MockScanState {
    return this.state;
  }

  getSelectedFindingId(): string | null {
    return this.selectedFindingId;
  }

  getSortMode(): MockFindingSortMode {
    return this.sortMode;
  }

  getViewModel(): MockScanViewModel {
    return buildMockScanViewModel({
      state: this.state,
      selectedFindingId: this.selectedFindingId,
      sortMode: this.sortMode
    });
  }

  getSortedFindings(): MockFinding[] {
    return sortMockFindings(this.state.findings, this.sortMode);
  }

  getSelectedFinding(): MockFinding | null {
    if (!this.selectedFindingId) {
      return null;
    }

    return findFindingById(this.state, this.selectedFindingId);
  }

  getFindingById(findingId: string): MockFinding | null {
    return findFindingById(this.state, findingId);
  }

  setState(nextState: MockScanState): void {
    this.state = nextState;

    if (this.selectedFindingId && findFindingById(this.state, this.selectedFindingId)) {
      this.emit();
      return;
    }

    this.selectedFindingId = getDefaultSelectedFindingId(this.state);
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

  setSortMode(sortMode: MockFindingSortMode): void {
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
