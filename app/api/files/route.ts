import { NextResponse } from 'next/server'
import { minioClient } from '@/lib/server/minio'
import { prisma } from '@/lib/server/prisma'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPath = searchParams.get('path')
    const bucket = searchParams.get('bucket')

    if (!rawPath || !bucket) {
      return NextResponse.json({ error: 'Missing path or bucket' }, { status: 400 })
    }

    const path = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')

    // Check DB first to ensure it is not soft-deleted
    const dbFile = await prisma.fileSystem.findFirst({
      where: {
        bucketName: bucket,
        path: { in: [path, rawPath] },
        deletedAt: null,
      }
    })

    if (!dbFile) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    const actualPath = dbFile.path
    const [stat, stream] = await Promise.all([
      minioClient.statObject(bucket, actualPath).catch(() => ({ etag: '' })),
      minioClient.getObject(bucket, actualPath)
    ])
    
    // Get object content safely using Buffer.concat
    const chunks: Buffer[] = []
    const content = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stream.on('error', (err) => reject(err))
    })

    const response = new NextResponse(content)
    if (stat.etag) {
      response.headers.set('ETag', stat.etag)
    }
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
    return response
  } catch (error: any) {
    console.error('GET /api/files error:', error)
    if (error.code === 'NotFound') {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const ifMatch = request.headers.get('If-Match')
    const body = await request.json()
    const { path, content, bucketName } = body

    if (!path || !bucketName) {
      return NextResponse.json({ error: 'Missing path or bucketName' }, { status: 400 })
    }

    // OCC Check
    try {
      const stat = await minioClient.statObject(bucketName, path)
      if (ifMatch && stat.etag && stat.etag !== ifMatch) {
        return NextResponse.json({ error: 'Precondition Failed', currentETag: stat.etag }, { status: 412 })
      }
    } catch (err: any) {
      if (err.code !== 'NotFound') {
        throw err
      }
      // If Not Found, we can proceed to create it (first save)
    }

    const buffer = Buffer.from(content || '', 'utf-8')
    const result = await minioClient.putObject(bucketName, path, buffer)
    
    // result contains the new etag
    return NextResponse.json({ etag: result.etag })
  } catch (error) {
    console.error('PUT /api/files error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const { path, bucketName } = body

    if (!path || !bucketName) {
      return NextResponse.json({ error: 'Missing path or bucketName' }, { status: 400 })
    }

    // Soft-delete: uses updateMany so it gracefully returns 0 if no record matches
    await prisma.fileSystem.updateMany({
      where: { path, bucketName, deletedAt: null },
      data: { deletedAt: new Date() }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/files error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
