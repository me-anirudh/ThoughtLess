import { EditOpType } from './enums';

export interface PatchAST {
  oldFile: string;
  newFile: string;
  hunks: PatchHunk[];
}

export interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: PatchLine[];
}

export interface PatchLine {
  type: 'insert' | 'delete' | 'equal';
  content: string;
}

export interface PatchSet {
  unified?: string;
  json?: JsonPatch;
  internalDelta?: Uint8Array;
}

export interface JsonPatch {
  oldFile: string;
  newFile: string;
  hunks: JsonHunk[];
}

export interface JsonHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  operations: JsonPatchOperation[];
}

export interface JsonPatchOperation {
  op: EditOpType;
  oldRange: [number, number];
  newRange: [number, number];
  content?: string[];
}
