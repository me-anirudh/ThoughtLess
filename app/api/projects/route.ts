import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/prisma'
import { minioClient } from '@/lib/server/minio'
import { ensureAdminUser } from '@/lib/server/auth-utils'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucketName')
    const filesOnly = searchParams.get('filesOnly')

    // If bucketName is provided, return the file system entries for that specific project/bucket
    if (bucket && filesOnly === 'true') {
      const fileSystem = await prisma.fileSystem.findMany({
        where: { bucketName: bucket, deletedAt: null },
        select: {
          id: true,
          path: true,
          name: true,
          isFolder: true,
          size: true,
          bucketName: true,
          dateModified: true,
        },
        orderBy: { path: 'asc' }
      })
      const response = NextResponse.json(fileSystem)
      response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
      return response
    }

    // Otherwise, return all projects with metadata and aggregated stats
    const admin = await ensureAdminUser()
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { userId: admin.id },
          { userId: null }
        ]
      },
      include: {
        versions: true,
      },
      orderBy: { updatedAt: 'desc' }
    })

    // Fetch file counts and total sizes for each project's bucket in a SINGLE query (resolves N+1 problem)
    const bucketNames = projects.map(p => p.bucketName)
    const stats = bucketNames.length > 0
      ? await prisma.fileSystem.groupBy({
          by: ['bucketName'],
          where: {
            bucketName: { in: bucketNames },
            deletedAt: null,
            isFolder: false,
          },
          _count: { _all: true },
          _sum: { size: true },
        })
      : []

    const statsMap = new Map<string, { fileCount: number; totalSize: number }>()
    for (const s of stats) {
      statsMap.set(s.bucketName, {
        fileCount: s._count._all,
        totalSize: s._sum.size || 0,
      })
    }

    const enrichedProjects = projects.map((project) => {
      const stat = statsMap.get(project.bucketName) || { fileCount: 0, totalSize: 0 }
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        bucketName: project.bucketName,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        versionsCount: project.versions.length,
        fileCount: stat.fileCount,
        totalSize: stat.totalSize,
      }
    })

    const response = NextResponse.json({ projects: enrichedProjects })
    response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
    return response
  } catch (error) {
    console.error('GET /api/projects error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { bucketName, files } = body

    if (!bucketName || !Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Ensure bucket exists
    const bucketExists = await minioClient.bucketExists(bucketName)
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1')
    }

    // Deduplicate files by normalized path
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

    // Bounded concurrency for MinIO uploads (10 at a time)
    const minioTasks = uniqueFiles
      .filter((f: any) => !f.isFolder && f.content !== undefined)
      .map((file: any) => async () => {
        const buffer = Buffer.from(file.content, 'utf-8')
        const result = await minioClient.putObject(bucketName, file.path, buffer)
        return { path: file.path, etag: result.etag }
      })

    const chunkSize = 10
    const etags = []
    for (let i = 0; i < minioTasks.length; i += chunkSize) {
      const chunk = minioTasks.slice(i, i + chunkSize)
      const chunkResults = await Promise.all(chunk.map(task => task()))
      etags.push(...chunkResults)
    }

    // Execute DB upserts in pipelined transactions (chunks of 50) to eliminate N+1 roundtrips
    const dbBatchSize = 50;
    for (let i = 0; i < uniqueFiles.length; i += dbBatchSize) {
      const chunk = uniqueFiles.slice(i, i + dbBatchSize);
      await prisma.$transaction(
        chunk.map((file: any) =>
          prisma.fileSystem.upsert({
            where: { path_bucketName: { path: file.path, bucketName } },
            update: {
              name: file.name,
              isFolder: Boolean(file.isFolder),
              size: file.size || 0,
              deletedAt: null // restore if it was deleted
            },
            create: {
              path: file.path,
              bucketName,
              name: file.name,
              isFolder: Boolean(file.isFolder),
              size: file.size || 0
            }
          })
        )
      );
    }

    return NextResponse.json({ success: true, count: uniqueFiles.length, etags })
  } catch (error: any) {
    console.error('POST /api/projects error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
