import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Obtener todos los productos ML-MISSING con sus órdenes
    const ghosts = await prisma.product.findMany({
      where: { sku: { startsWith: 'ML-MISSING-' } },
      include: {
        orderItems: {
          include: {
            order: {
              select: {
                id: true,
                mlId: true,
                status: true,
                createdAt: true,
                buyerName: true,
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Agrupar por nombre (mismo producto fantasma en múltiples órdenes)
    const grouped = new Map<string, {
      name: string;
      ghostProductId: string;
      sku: string;
      imageUrl: string | null;
      createdAt: Date;
      orderCount: number;
      totalQuantity: number;
      orders: { id: string; mlId: string; status: string; buyerName: string | null }[];
    }>();

    for (const ghost of ghosts) {
      const key = ghost.name.trim();
      if (grouped.has(key)) {
        const existing = grouped.get(key)!;
        existing.orderCount += ghost.orderItems.length;
        existing.totalQuantity += ghost.orderItems.reduce((s, oi) => s + oi.quantityTotal, 0);
        for (const oi of ghost.orderItems) {
          if (!existing.orders.some(o => o.id === oi.order.id)) {
            existing.orders.push({
              id: oi.order.id,
              mlId: oi.order.mlId,
              status: oi.order.status,
              buyerName: oi.order.buyerName,
            });
          }
        }
      } else {
        grouped.set(key, {
          name: ghost.name,
          ghostProductId: ghost.id,
          sku: ghost.sku,
          imageUrl: ghost.imageUrl,
          createdAt: ghost.createdAt,
          orderCount: ghost.orderItems.length,
          totalQuantity: ghost.orderItems.reduce((s, oi) => s + oi.quantityTotal, 0),
          orders: ghost.orderItems.map(oi => ({
            id: oi.order.id,
            mlId: oi.order.mlId,
            status: oi.order.status,
            buyerName: oi.order.buyerName,
          })),
        });
      }
    }

    return NextResponse.json({
      total: ghosts.length,
      unique: grouped.size,
      items: Array.from(grouped.values()),
    });
  } catch (error: any) {
    console.error('Error fetching ML-MISSING:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
