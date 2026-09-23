export interface NormalizedFile {
  lines: string[];
  lineHashes: Uint32Array;
  originalContent: string;
  hadBOM: boolean;
  originalLineEnding: 'CRLF' | 'LF' | 'mixed';
}
