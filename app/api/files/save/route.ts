import { NextResponse } from 'next/server'
import { minioClient } from '@/lib/server/minio'

export async function POST(request: Request) {
  try {
    const text = await request.text()
    if (!text) {
      return NextResponse.json({ error: 'Empty payload' }, { status: 400 })
    }

    const body = JSON.parse(text)
    const { files } = body

    if (!Array.isArray(files)) {
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
    }

    // Batch-write files to MinIO via putObject with bounded concurrency (chunks of 10)
    const validFiles = files.filter(
      (f: any) => f && f.path && f.bucketName && f.content !== undefined
    );
    const chunkSize = 10;
    for (let i = 0; i < validFiles.length; i += chunkSize) {
      const chunk = validFiles.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((file: any) => {
          const buffer = Buffer.from(file.content, 'utf-8');
          return minioClient.putObject(file.bucketName, file.path, buffer);
        })
      );
    }

    return NextResponse.json({ success: true, count: files.length })
  } catch (error) {
    console.error('POST /api/files/save error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
