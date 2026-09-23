export interface DiffStatistics {
  totalLines: number;
  addedLines: number;
  deletedLines: number;
  modifiedLines: number;
  unchangedLines: number;
  addedCharacters: number;
  deletedCharacters: number;
  moveCount: number;
  editCount: number;
  patchSizeBytes: number;
}

export interface StageTiming {
  stage: string;
  durationMs: number;
  startTime: number;
  endTime: number;
}

export interface BenchmarkData {
  totalDurationMs: number;
  stageTiming: StageTiming[];
  peakMemoryEstimateBytes?: number;
}
