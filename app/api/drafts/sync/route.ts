import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma'; 

export async function POST(req: Request) {
  try {
    const { drafts = [] } = await req.json();

    // Draft Metadata changes constantly (modified timestamps change as users type), 
    // so we cannot use skipDuplicates. We must use upsert. 
    // A loop is acceptable here because draft syncs happen incrementally.
    await prisma.$transaction(async (tx) => {
      for (const draft of drafts) {
        const draftPath = draft.path || draft.name || "";
        const draftName = draft.name || draft.path || "Untitled";
        if (!draftPath) continue;

        await tx.draftMetaData.upsert({
          where: {
            path_name: {
              path: draftPath,
              name: draftName,
            },
          },
          update: {
            parentName: draft.parentName || "",
            isSync: true,
            modified: new Date(draft.modified || Date.now()),
            created: new Date(draft.created || Date.now()),
            bucketName: draft.bucketName || "",
            projectId: draft.projectId || null,
          },
          create: {
            name: draftName,
            path: draftPath,
            parentName: draft.parentName || "",
            isSync: true,
            modified: new Date(draft.modified || Date.now()),
            created: new Date(draft.created || Date.now()),
            bucketName: draft.bucketName || "",
            projectId: draft.projectId || null,
          },
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Draft metadata synced atomically' });
  } catch (error) {
    console.error('[Draft Sync API] Failed:', error);
    return NextResponse.json({ error: 'Failed to sync Draft metadata' }, { status: 500 });
  }
}
