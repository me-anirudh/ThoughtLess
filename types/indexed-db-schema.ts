import { CommitCategory } from "./interfaces";

export interface FileSnapshot {
  id: string; // UUIDv4, PK
  projectId: string; // For knowing which project it belongs to
  projectVersionId: string; // For knowing which specific version of the project it belongs to
  filePath: string; // Indexed, NOT NULL
  contentHash: string; // SHA-256 hex, Indexed, UNIQUE per filePath
  storageType: 'full' | 'delta';
  parentIds: string[]; // FK -> FileSnapshot.id
  byteSize: number; // NOT NULL
  language: string | null;
  timestamp: number; // Indexed
  category: CommitCategory | null; //Which type of changes we are inferring. 
  name: string; // The commit message / label for this snapshot
  isSynced: 0 | 1; // Dirty flag for SQL sync
}

export interface FileEdge {
  parentId: string; // PK (composite), FK -> FileSnapshot.id
  childId: string; // PK (composite), FK -> FileSnapshot.id
  filePath: string; // Indexed
  isSynced: 0 | 1; // Dirty flag for SQL sync
}
        
export interface DeltaBlob {
  fileSnapshotId: string; // PK, FK -> FileSnapshot.id
  baseSnapshotId: string; // FK -> FileSnapshot.id, NOT NULL
  patchData: ArrayBuffer; // NOT NULL
  patchFormat: 'myers-unified' | 'vcdiff';
  compressedBytes?: number; // Size of patchData after compression
}

export interface FullBlob {
  fileSnapshotId: string; // PK, FK -> FileSnapshot.id
  content: ArrayBuffer; // NOT NULL
  compressionAlgo: 'lz4' | 'gzip' | 'none';
}

export interface SnapshotFileMap {
  projectId: string; // FK -> Project.id
  projectVersionId: string; // PK (composite), FK -> ProjectVersion.id
  filePath: string; // PK (composite)
  fileSnapshotId: string; // FK -> FileSnapshot.id, NOT NULL
  isSynced: 0 | 1; // Dirty flag for SQL sync
}

export interface BranchHead {
  branchName: string; // PK, e.g., "main", "experiment/dark-theme"
  headSnapshotId: string; // FK -> ProjectSnapshot.id
  createdAt: number;
  parentBranch: string | null;
  isSynced: 0 | 1; // Dirty flag for SQL sync
}



export interface DraftPagesschema {
  id : number, 
  filepath : string, 
  status  : 'merged' | 'draft', 
  createdAt : number, 
  sourceFileSnapshotId : number, 
  etag : string | null, 
  content : string | null
}
