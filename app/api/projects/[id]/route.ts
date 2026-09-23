import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { minioClient } from '@/lib/server/minio';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: { versions: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const files = await prisma.fileSystem.findMany({
      where: { bucketName: project.bucketName, deletedAt: null },
      orderBy: { path: 'asc' },
    });

    return NextResponse.json({ project, files });
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function safelyDeleteBucket(bucketName: string) {
  try {
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) return;

    // Collect all object names recursively
    const objectsList: string[] = [];
    const stream = minioClient.listObjects(bucketName, '', true);

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj?.name) objectsList.push(obj.name);
      });
      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    // Remove all objects first
    if (objectsList.length > 0) {
      await minioClient.removeObjects(bucketName, objectsList);
    }

    // Then remove the empty bucket
    await minioClient.removeBucket(bucketName);
  } catch (minioErr) {
    console.warn('[MinIO Cleanup] Warning during bucket removal for', bucketName, minioErr);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 1. Delete all PostgreSQL records related to this project
    await prisma.$transaction([
      prisma.fileSystem.deleteMany({ where: { bucketName: project.bucketName } }),
      prisma.draftMetaData.deleteMany({ where: { bucketName: project.bucketName } }),
      prisma.fileSnapshot.deleteMany({ where: { projectId: project.id } }),
      prisma.project.delete({ where: { id } }),
    ]);

    // 2. Clean up MinIO bucket and all objects safely
    await safelyDeleteBucket(project.bucketName);

    return NextResponse.json({ success: true, message: 'Project deleted successfully' });
  } catch (error: any) {
    console.error('DELETE /api/projects/[id] error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete project' }, { status: 500 });
  }
}
