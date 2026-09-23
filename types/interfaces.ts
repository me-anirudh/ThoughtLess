export type FileType = 'file' | 'folder';

export interface FileStructure {
  id?: number;
  name: string;
  isFolder: boolean;
  dateCreated?: Date;
  dateModified?: Date;
  size: number;
  path: string;
  bucketName: string;
  deletedAt?: Date | null;
}

export interface ExtractedObject {
  path: string;
  content: string;
  isFolder: boolean;
  name: string;
  size: number;
}

export interface ExtractedFile {
  path: string;
  content: string;
}

export interface DBFileRecord {
  id: number;
  name: string;
  isFolder: boolean;
  dateCreated: Date;
  dateModified: Date;
  size: number;
  path: string;
  bucketName: string;
  deletedAt: Date | null;
}

export interface ActivityBarIcon {
  id: string;
  icon: any; // e.g. from react-icons
  tooltip: string;
}


export interface SidebarState {
  folderName: string;
  fileTree: any[];
  isProjectSelected: boolean;
  treeCache: Record<string, any[]>;
  setFolderName: (name: string) => void;
  setFileTree: (tree: any[]) => void;
  setProjectSelected: (selected: boolean) => void;
  cacheTree: (bucket: string, tree: any[]) => void;
}

export interface DraftRecord {
  // fileId : string; 
  path: string;
  name: string;
  content: string;
  bucketName: string;
  modified: number;
  etag : string, 
}

export interface activeFile {
        id : string, 
        setId : (newid : string) => void
}

export interface RecentCommit {
        id: string;
        hash: string;
        message: string;
        author: string;
        timestamp: number;
}

export type MergeStrategy = "direct-child" | "merge-into";

export interface DraftMetadata { 
  fileId?: string, 
  name : string, // His own id
  parentName : string, // Kinda the foreign key
  isSync : 0 | 1, 
  path  ?: string, 
  modified : number, 
  created : number
}; 


// UI stuff interfaces. 



export type CommitCategory = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'merge' | 'unknown';



// LayoutPosition (for radial tree layout)

export interface LayoutPosition {

 readonly x: number;       // cartesian X (computed from polar)
 readonly y: number;       // cartesian Y (computed from polar)
 readonly width: number;
 readonly height: number;
 readonly depth: number;   // distance from root (0 = root, 1 = first ring, etc.)
 readonly angle: number;   // angle in radians (position on the ring)
 readonly radius: number;  // pixel distance from center

}


// EdgeLayout

export interface EdgeLayout {
    readonly sourceId: string;
    readonly targetId: string;
    readonly controlPoints: readonly { readonly x: number; readonly y: number }[];
    readonly svgPath: string;   // NEW: D3-generated SVG path string for <path d="...">
    readonly color: string;
    opacity: number;
}

  

// FileChangeStat

export interface FileChangeStat {

readonly path: string;

readonly additions: number;

readonly deletions: number;

readonly status: 


'added' | 'modified' | 'deleted' | 'renamed';

}



// Rect (for viewport calculations)

export interface Rect {

readonly x: number;

readonly y: number;

readonly width: number;

readonly height: number;

}

export interface LayoutSnapshot {
  readonly revision: number;
  readonly nodes: ReadonlyMap<string, LayoutPosition>;
  readonly grid: ReadonlyMap<string, string[]>; 
  readonly edges: readonly EdgeLayout[];
  readonly bounds: { readonly width: number; readonly height: number };
  readonly stats: {
    readonly totalNodes: number;
    readonly totalEdges: number;
    readonly maxDepth: number;       // deepest ring
    readonly layoutTimeMs: number;
  };
}
