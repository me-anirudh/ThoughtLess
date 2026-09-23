import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma'; // Adjust this import if your prisma client is elsewhere

export async function POST(req: Request) {
  try {
    const { snapshots = [], edges = [], fileMaps = [], branches = [] } = await req.json();

    // The entire sync must be atomic: all or nothing
    await prisma.$transaction(async (tx) => {
      
      // 1. BULK INSERT Snapshots (1 Query via skipDuplicates)
      if (snapshots.length > 0) {
        await tx.fileSnapshot.createMany({
          data: snapshots.map((s: any) => ({
            id: s.id,
            projectId: s.projectId,
            projectVersionId: s.projectVersionId,
            filePath: s.filePath,
            contentHash: s.contentHash,
            storageType: s.storageType,
            storageKey: `${s.projectId}/${s.contentHash}`, 
            byteSize: s.byteSize,
            language: s.language,
            timestamp: new Date(s.timestamp),
            category: s.category,
            name: s.name,
          })),
          skipDuplicates: true, // Prevents crashing if the snapshot already exists
        });
      }

      // 2. BULK INSERT Edges (1 Query via skipDuplicates)
      if (edges.length > 0) {
        await tx.fileEdge.createMany({
          data: edges.map((e: any) => ({
            parentId: e.parentId,
            childId: e.childId,
          })),
          skipDuplicates: true,
        });
      }

      // 3. Upsert FileMaps (Usually very few per commit)
      // Since these update pointers (moving a file to point to a new snapshot), 
      // we must upsert them. A small loop is fine here as commits touch few files.
      for (const map of fileMaps) {
        await tx.snapshotFileMap.upsert({
          where: {
            projectVersionId_filePath: {
              projectVersionId: map.projectVersionId,
              filePath: map.filePath,
            },
          },
          update: { fileSnapshotId: map.fileSnapshotId },
          create: {
            projectId: map.projectId,
            projectVersionId: map.projectVersionId,
            filePath: map.filePath,
            fileSnapshotId: map.fileSnapshotId,
          },
        });
      }

      // 4. Upsert BranchHeads
      for (const branch of branches) {
        await tx.branchHead.upsert({
          where: { branchName: branch.branchName },
          update: { headSnapshotId: branch.headSnapshotId },
          create: {
            branchName: branch.branchName,
            headSnapshotId: branch.headSnapshotId,
            parentBranch: branch.parentBranch,
            createdAt: new Date(branch.createdAt),
          },
        });
      }
    });

    return NextResponse.json({ success: true, message: 'VCS data synced atomically' });
  } catch (error) {
    console.error('[VCS Sync API] Failed:', error);
    return NextResponse.json({ error: 'Failed to sync VCS data' }, { status: 500 });
  }
}
