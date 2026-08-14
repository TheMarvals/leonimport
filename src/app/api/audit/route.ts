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
      include: {
        order: {
          select: {
            mlId: true,
            mlOrderId: true,
            mlAccount: {
              select: {
                nickname: true,
                alias: true,
                sellerId: true,
                gatewayAccountId: true,
              },
            },
          },
        },
      },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(logs.map(log => log.userId))] } },
      select: { id: true, name: true, role: true },
    });
    const usersById = new Map(users.map(user => [user.id, user]));
    const sellerIds = [...new Set(logs.flatMap(log => {
      const metadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? log.metadata as Record<string, unknown>
        : null;
      return metadata?.sellerId ? [String(metadata.sellerId)] : [];
    }))];
    const mlAccounts = await prisma.mercadoLibreAccount.findMany({
      where: { sellerId: { in: sellerIds } },
      select: { alias: true, nickname: true, sellerId: true, gatewayAccountId: true },
    });
    const mlAccountsBySeller = new Map(mlAccounts.map(account => [account.sellerId, account]));
    return NextResponse.json(logs.map(log => ({
      ...log,
      user: usersById.get(log.userId) || null,
      mlAccount: (() => {
        const metadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
          ? log.metadata as Record<string, unknown>
          : null;
        return metadata?.sellerId ? mlAccountsBySeller.get(String(metadata.sellerId)) || null : null;
      })(),
      order: log.order ? {
        ...log.order,
        mlOrderId: log.order.mlOrderId?.toString() || log.order.mlId,
      } : null,
    })));
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
