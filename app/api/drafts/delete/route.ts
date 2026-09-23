import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';

export async function DELETE(req: Request) {
  try {
    const { path, name } = await req.json();

    if (!path || !name) {
      return NextResponse.json({ error: 'Missing path or name' }, { status: 400 });
    }

    // Attempt to delete from SQL, ignoring if it doesn't exist
    await prisma.draftMetaData.deleteMany({
      where: {
        path: path,
        name: name,
      },
    });

    return NextResponse.json({ success: true, message: 'Draft deleted from SQL' });
  } catch (error) {
    console.error('[Draft Delete API] Failed:', error);
    return NextResponse.json({ error: 'Failed to delete draft from SQL' }, { status: 500 });
  }
}
