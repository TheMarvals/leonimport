import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, userId, metadata, mlId } = await req.json();
    if (!action || !userId) {
      return NextResponse.json({ error: 'Missing action or userId' }, { status: 400 });
    }
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        metadata,
        ...(mlId ? { order: { connect: { mlId } } } : {}),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Audit Log Error:', error);
    return NextResponse.json({ error: 'Failed to log audit' }, { status: 500 });
  }
}
