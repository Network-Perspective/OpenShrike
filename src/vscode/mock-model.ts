import {findFindingById, sortMockFindings, type MockFinding, type MockFindingSortMode, type MockScanState} from './mock-data.js';

type Listener = () => void;

export class MockExtensionModel {
  private readonly listeners = new Set<Listener>();
  private selectedFindingId: string | null;
  private sortMode: MockFindingSortMode = 'status';

  constructor(
    private readonly state: MockScanState,
    initialFindingId: string | null
  ) {
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
