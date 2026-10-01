import { CostModelResult } from './cost-model';
import { EditOperation, CharacterChange } from './operations';
import { MoveAnchor } from './regions';
import { PatchAST, PatchSet } from './patch';
import { DiffStatistics, BenchmarkData } from './stats';
import { FileFeatures } from './features';

export interface DiffResult {
  regionalSelections: CostModelResult[];
  operations: EditOperation[];
  characterChanges: CharacterChange[];
  moves: MoveAnchor[]; 
  patchAST: PatchAST | null; 
  patches: PatchSet;
  statistics: DiffStatistics;
  benchmarks: BenchmarkData;
  metadata: DiffMetadata;
}

export interface DiffMetadata {
  oldFileFeatures: FileFeatures;
  newFileFeatures: FileFeatures;
  identical: boolean;
  binary: boolean;
  timedOut: boolean;
  fallbackUsed: boolean;
  fallbackReason?: string;
}
