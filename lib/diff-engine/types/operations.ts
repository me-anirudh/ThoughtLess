import { EditOpType } from './enums';

export interface EditOperation {
  type: EditOpType;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  oldLines: string[];
  newLines: string[];
}

export interface CharacterChange {
  operationIndex: number;
  lineIndex: number;
  oldLine: string;
  newLine: string;
  changes: InlineChange[];
}

export interface InlineChange {
  type: 'insert' | 'delete' | 'equal';
  value: string;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}
