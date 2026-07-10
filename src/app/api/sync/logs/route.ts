import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Calcular métricas agregadas
    const totalSyncs = logs.length;
    const avgDuration = logs
      .filter(l => l.durationMs)
      .reduce((sum, l) => sum + (l.durationMs || 0), 0) / (logs.filter(l => l.durationMs).length || 1);
    const totalImported = logs.reduce((sum, l) => sum + l.imported, 0);
    const totalErrors = logs.filter(l => l.status === 'ERROR').length;

    // Métricas de diagnóstico
    const totalReusedBySku = logs.reduce((sum, l) => sum + l.reusedBySku, 0);
    const totalReusedByAlias = logs.reduce((sum, l) => sum + l.reusedByAlias, 0);
    const totalAutoCreated = logs.reduce((sum, l) => sum + l.autoCreated, 0);
    const totalMissingCreated = logs.reduce((sum, l) => sum + l.missingCreated, 0);

    return NextResponse.json({
      logs,
      metrics: {
        totalSyncs,
        avgDurationMs: Math.round(avgDuration),
        totalImported,
        totalErrors,
        lastSync: logs[0] || null,
        diagnostic: {
          totalReusedBySku,
          totalReusedByAlias,
          totalAutoCreated,
          totalMissingCreated,
        }
      }
    });
  } catch (error: any) {
    console.error('[SyncLogs] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
