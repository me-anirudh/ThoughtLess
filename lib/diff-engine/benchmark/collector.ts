// ============================================================================
// Adaptive Diff Engine — Benchmark Collector
// ============================================================================
// Records timing data for every pipeline stage. Produces a BenchmarkData
// object that is attached to the final DiffResult.
// ============================================================================

import type { BenchmarkData, StageTiming } from '../types';

export class BenchmarkCollector {
  private timings: StageTiming[] = [];
  private engineStart = 0;

  /**
   * Call once at the beginning of `DiffEngine.compare()`.
   * Resets all state and records the global start time.
   */
  start(): void {
    this.engineStart = performance.now();
    this.timings = [];
  }

  /**
   * Call at the beginning of each pipeline stage.
   * Returns a `done` function — call it when the stage completes.
   *
   * Usage:
   * ```ts
   * const done = collector.beginStage('Normalizer');
   * normalizer.execute(ctx);
   * done();
   * ```
   */
  beginStage(stage: string): () => void {
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      this.timings.push({
        stage,
        durationMs: endTime - startTime,
        startTime,
        endTime,
      });
    };
  }

  /**
   * Produce the final BenchmarkData snapshot.
   * Call once at the end of `DiffEngine.compare()`.
   */
  collect(): BenchmarkData {
    return {
      totalDurationMs: performance.now() - this.engineStart,
      stageTiming: [...this.timings],
    };
  }
}
