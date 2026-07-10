import { NextRequest, NextResponse } from 'next/server';
import RedisManager from '@/lib/redis';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * API Sync — Punto de sincronización del Outbox.
 * 
 * Flujo:
 * 1. Valida que userId + mlId estén presentes.
 * 2. Verifica propiedad del lock (con fall-through a Postgres si Redis está caído).
 * 3. Si el lock se perdió, rescata el payload en SyncConflict para revisión del supervisor.
 * 4. Si todo está bien, aplica el cambio y refresca el lock.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, payload, userId } = body;
    const mlId = payload?.mlId;

    if (!mlId || !userId) {
      return NextResponse.json({ error: 'Missing mlId or userId' }, { status: 400 });
    }

    // 1. Verificar propiedad del lock (resiliente a caída de Redis)
    const currentLockOwner = await RedisManager.getLockOwner(mlId);

    if (currentLockOwner !== userId) {
      // Rescatar datos huérfanos para revisión del supervisor
      await prisma.syncConflict.create({
        data: {
          orderId: mlId,
          userId,
          payload: body,
          status: 'PENDING_REVIEW',
        },
      });

      return NextResponse.json(
        {
          error: 'Ownership Conflict',
          message: 'Lock expirado. El trabajo ha sido guardado para revisión del supervisor.',
        },
        { status: 409 },
      );
    }

    // 2. Procesar acción
    if (action === 'PICK_ITEM') {
      const { sku, quantity } = payload;

      await prisma.orderItem.updateMany({
        where: {
          order: { mlId },
          product: { sku },
        },
        data: {
          quantityPicked: { increment: quantity || 1 },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'PICK_ITEM',
          metadata: { sku, quantity, mlId, syncedAt: new Date().toISOString() },
          order: { connect: { mlId } },
        },
      });
    }

    // 3. Refrescar el lock tras acción exitosa
    await RedisManager.refreshLock(mlId, userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
