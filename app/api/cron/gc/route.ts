import { NextResponse } from 'next/server'
import { prisma } from '@/lib/server/prisma'
import { minioClient } from '@/lib/server/minio'

export async function POST(request: Request) {
  try {
    // 1. Query: SELECT * FROM FileSystem WHERE deletedAt IS NOT NULL AND deletedAt < NOW() - INTERVAL '24 hours'
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const deletedFiles = await prisma.fileSystem.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: twentyFourHoursAgo
        }
      },
      take: 100
    })

    await Promise.all(
      deletedFiles.map(async (file) => {
        try {
          await minioClient.removeObject(file.bucketName, file.path)
        } catch (err) {
          console.error(`Failed to remove object from MinIO: ${file.path}`, err)
        }
      })
    )

    const ids = deletedFiles.map(f => f.id)
    if (ids.length > 0) {
      await prisma.fileSystem.deleteMany({
        where: { id: { in: ids } }
      })
    }

    return NextResponse.json({ deleted: ids.length })
  } catch (error) {
    console.error('POST /api/cron/gc error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
