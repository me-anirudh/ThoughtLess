import { RegionType } from './enums';

export interface DiffRegion {
  id: string;
  type: RegionType;
  /** Start line in old file (inclusive, 0-indexed) */
  oldStart: number;
  /** End line in old file (exclusive) */
  oldEnd: number;
  /** Start line in new file (inclusive, 0-indexed) */
  newStart: number;
  /** End line in new file (exclusive) */
  newEnd: number;
}

export interface MoveAnchor {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  fingerprint: string;
  similarityScore: number; // A cool AI name I heard from my friend 
}
