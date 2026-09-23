import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { minioClient } from '@/lib/server/minio';
import { ensureAdminUser } from '@/lib/server/auth-utils';

function sanitizeBucketName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-.]/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${sanitized || 'project'}-${randomSuffix}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description = '', files = [] } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const admin = await ensureAdminUser();
    const bucketName = sanitizeBucketName(name);

    // 1. Ensure MinIO bucket exists
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
    }

    // 2. Create the Project in PostgreSQL
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        bucketName,
        userId: admin.id,
        versions: {
          create: {
            versionName: 'v1.0',
          },
        },
      },
      include: {
        versions: true,
      },
    });

    // 3. If files were provided during creation, upload to MinIO and register in FileSystem
    if (Array.isArray(files) && files.length > 0) {
      // Deduplicate files by path
      const uniqueFilesMap = new Map<string, any>();
      for (const f of files) {
        if (f && f.path) {
          const norm = f.path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
          if (norm) {
            uniqueFilesMap.set(norm, { ...f, path: norm });
          }
        }
      }
      const uniqueFiles = Array.from(uniqueFilesMap.values());

      const minioTasks = uniqueFiles
        .filter((f: any) => !f.isFolder && f.content !== undefined)
        .map((file: any) => async () => {
          const buffer = Buffer.from(file.content, 'utf-8');
          const result = await minioClient.putObject(bucketName, file.path, buffer);
          return { path: file.path, etag: result.etag };
        });

      const chunkSize = 10;
      for (let i = 0; i < minioTasks.length; i += chunkSize) {
        const chunk = minioTasks.slice(i, i + chunkSize);
        await Promise.all(chunk.map((task) => task()));
      }

      await prisma.fileSystem.createMany({
        data: uniqueFiles.map((file: any) => ({
          path: file.path,
          bucketName,
          name: file.name,
          isFolder: Boolean(file.isFolder),
          size: file.size || 0,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        bucketName: project.bucketName,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        fileCount: files.filter((f: any) => !f.isFolder).length,
      },
    });
  } catch (error: any) {
    console.error('POST /api/projects/create error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create project' }, { status: 500 });
  }
}
