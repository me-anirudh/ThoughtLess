import { NormalizedFile } from './normalized';
import { FileFeatures } from './features';
import { PatchFormat } from './enums';

export interface FileSnapshot {
  content: string | ArrayBuffer;
  normalized?: NormalizedFile;
  features?: FileFeatures;
}

export interface DiffInput {
  oldContent: FileSnapshot | string | ArrayBuffer;
  newContent: FileSnapshot | string | ArrayBuffer;
  options?: DiffOptions;
}

export interface DiffOptions {
  timeoutMs?: number;
  normalizeWhitespace?: boolean;
  characterLevel?: boolean;
  detectMoves?: boolean;
  maxFileSizeBytes?: number;
  filePath?: string;
  forceAlgorithm?: string;
  patchFormats?: PatchFormat[];
  contextLines?: number;
}

export type ResolvedDiffOptions = Required<DiffOptions>;
