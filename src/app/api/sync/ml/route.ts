import { NextResponse } from 'next/server';
import { syncOrders } from '@/lib/sync-orders';
import RedisManager from '@/lib/redis';
import { getSession } from '@/lib/session';

const DEFAULT_SYNC_COOLDOWN_SECONDS = 90;

function getSyncCooldownSeconds(): number {
  const configured = Number.parseInt(process.env.ML_SYNC_COOLDOWN_SECONDS || '', 10);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SYNC_COOLDOWN_SECONDS;
}

export async function POST(request: Request) {
  const forceRequested = new URL(request.url).searchParams.get('force') === 'true';
  if (forceRequested) {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Debes iniciar sesión para forzar una sincronización.' },
        { status: 401 },
      );
    }
  }

  const force = forceRequested;
  const cooldownSeconds = getSyncCooldownSeconds();
  let cooldownAcquired = false;

  try {
    // Todas las estaciones comparten esta ventana distribuida. Así pueden pedir
    // actualización libremente sin ejecutar un barrido completo de ML por PC.
    // Los botones manuales usan force=true y conservan el lock de concurrencia
    // interno de syncOrders.
    if (!force) {
      cooldownAcquired = await RedisManager.lockOrder(
        'ml_sync_cooldown',
        'global',
        cooldownSeconds,
      );

      if (!cooldownAcquired) {
        return NextResponse.json({
          success: true,
          skippedDueToCooldown: true,
          cooldownSeconds,
          imported: 0,
          skipped: 0,
          resolutionRequired: 0,
          totalProcessed: 0,
        });
      }
    }

    const result = await syncOrders();

    // La ventana se cuenta desde el final del barrido. Esto también evita que
    // el polling automático repita inmediatamente un sync manual.
    const cooldownCreated = await RedisManager.lockOrder(
      'ml_sync_cooldown',
      'global',
      cooldownSeconds,
    );
    if (!cooldownCreated) {
      await RedisManager.refreshLock('ml_sync_cooldown', 'global', cooldownSeconds);
    }

    return NextResponse.json({ ...result, skippedDueToCooldown: false });
  } catch (error: any) {
    // Un error no debe bloquear los reintentos automáticos durante toda la ventana.
    if (cooldownAcquired) {
      try {
        await RedisManager.unlockOrder('ml_sync_cooldown', 'global');
      } catch (unlockError) {
        console.error('[SyncCooldown] No se pudo liberar el cooldown tras el error:', unlockError);
      }
    }
    console.error('Sync Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
