// ============================================================================
// Adaptive Diff Engine V3 — DiffContext
// ============================================================================
// The shared mutable context object that flows through every pipeline stage.
// Includes V3 regional tracking and knowledge base support.
// ============================================================================

import type {
  DiffInput,
  ResolvedDiffOptions,
  NormalizedFile,
  FileFeatures,
  RegionFeatures,
  CostModelResult,
  EditOperation,
  CharacterChange,
  MoveAnchor,
  DiffRegion,
  PatchAST,
  PatchSet,
  DiffStatistics,
  BenchmarkData,
  IDiffContext,
  IKnowledgeBase,
} from './types';

export class NullKnowledgeBase implements IKnowledgeBase {
  estimate() { return null; }
  record() {}
}

const DEFAULT_OPTIONS: ResolvedDiffOptions = {
  timeoutMs: 5000,
  normalizeWhitespace: false,
  characterLevel: true,
  detectMoves: true,
  maxFileSizeBytes: 10 * 1024 * 1024,
  filePath: '',
  forceAlgorithm: '',
  patchFormats: ['unified', 'json'],
  contextLines: 3,
};

export class DiffContext implements IDiffContext {
  readonly input: DiffInput;
  readonly options: ResolvedDiffOptions;
  readonly deadline: number;
  readonly knowledgeBase: IKnowledgeBase;

  // --- Stage outputs ---
  normalizedOld: NormalizedFile | null = null;
  normalizedNew: NormalizedFile | null = null;
  oldFileFeatures: FileFeatures | null = null;
  newFileFeatures: FileFeatures | null = null;
  
  // V3 specific
  regions: DiffRegion[] = [];
  moveAnchors: MoveAnchor[] = [];
  regionFeatures = new Map<string, RegionFeatures>();
  regionalSelections = new Map<string, CostModelResult>();
  
  // Scripts
  rawEditScript: EditOperation[] = [];
  optimizedEditScript: EditOperation[] = [];
  characterChanges: CharacterChange[] = [];
  
  // Output
  patchAST: PatchAST | null = null;
  patches: PatchSet = {};
  statistics: DiffStatistics | null = null;
  benchmarks: BenchmarkData = { totalDurationMs: 0, stageTiming: [] };

  // Flags
  identical = false;
  binary = false;
  timedOut = false;
  fallbackUsed = false;
  fallbackReason?: string;

  constructor(input: DiffInput, kb?: IKnowledgeBase) {
    this.input = input;
    this.knowledgeBase = kb || new NullKnowledgeBase();

    this.options = {
      ...DEFAULT_OPTIONS,
      ...input.options,
      patchFormats: input.options?.patchFormats
        ? [...input.options.patchFormats]
        : [...DEFAULT_OPTIONS.patchFormats],
    };

    this.deadline = performance.now() + this.options.timeoutMs;
  }

  checkDeadline(iterationCount: number, checkEveryN = 1000): boolean {
    if (iterationCount % checkEveryN !== 0) return false;
    return performance.now() >= this.deadline;
  }
}
