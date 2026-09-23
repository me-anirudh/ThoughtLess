export interface FileFeatures {
  fileSize: number;
  lineCount: number;
  averageLineLength: number;
  maxLineLength: number;
  duplicateLineRatio: number;
  uniqueLineRatio: number;
  entropy: number;
  language: string;
  isBinary: boolean;
  isGenerated: boolean;
  encoding: string;
  extension: string;
}

export interface RegionFeatures {
  regionId: string;
  changedLineRatio: number;
  insertDeleteRatio: number;
  lineHashSimilarity: number;
  anchorDensity: number;
  hashCollisionDensity: number;
  expectedEditDistance: number;
}
