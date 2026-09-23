import { DiffInput, ResolvedDiffOptions } from './input';
import { IKnowledgeBase } from './execution';
import { NormalizedFile } from './normalized';
import { FileFeatures, RegionFeatures } from './features';
import { DiffRegion, MoveAnchor } from './regions';
import { CostModelResult } from './cost-model';
import { EditOperation, CharacterChange } from './operations';
import { PatchAST, PatchSet } from './patch';
import { DiffStatistics, BenchmarkData } from './stats';

export interface IDiffContext {
  readonly input: DiffInput;
  readonly options: ResolvedDiffOptions;
  readonly deadline: number;
  readonly knowledgeBase: IKnowledgeBase;

  // Outputs
  normalizedOld: NormalizedFile | null;
  normalizedNew: NormalizedFile | null;
  oldFileFeatures: FileFeatures | null;
  newFileFeatures: FileFeatures | null;
  
  // V3 specific
  regions: DiffRegion[];
  moveAnchors: MoveAnchor[];
  regionFeatures: Map<string, RegionFeatures>;
  regionalSelections: Map<string, CostModelResult>;
  
  // Script outputs
  rawEditScript: EditOperation[];
  optimizedEditScript: EditOperation[];
  characterChanges: CharacterChange[];
  
  // AST & Patches
  patchAST: PatchAST | null;
  patches: PatchSet;
  statistics: DiffStatistics | null;
  benchmarks: BenchmarkData;

  // Flags
  identical: boolean;
  binary: boolean;
  timedOut: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string;

  checkDeadline(iterationCount: number, checkEveryN?: number): boolean;
}
