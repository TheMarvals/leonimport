import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// OBTENER ORDENES PENDIENTES Y LAS QUE EL USUARIO TIENE EN PROGRESO
export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Buscar órdenes PENDING o PICKING (pero bloqueadas por este usuario)
  // IMPORTANTE: Excluimos órdenes que tengan productos fantasma (ML-MISSING)
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'PICKING', lockedBy: session.userId },
      ],
      // Aseguramos que NINGÚN ítem de la orden sea un fantasma
      NOT: {
        items: {
          some: {
            product: {
              sku: { startsWith: 'ML-MISSING' }
            }
          }
        }
      }
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              locations: { include: { location: true } }
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  return NextResponse.json(orders);
}

// ACCIONES DE PICKING
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { action, orderId } = body;

  if (!orderId || !action) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });

  try {
    if (action === 'START_PICKING') {
      // 0. Encontrar la orden origen para obtener su shippingId
      const sourceOrder = await prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

      // Buscar todas las órdenes que comparten el mismo shippingId (si existe) y están en PENDING o ya bloqueadas por mí
      const shippingId = sourceOrder.shippingId;
      const ordersToLock = await prisma.order.findMany({
        where: {
          OR: [
            { id: orderId },
            ...(shippingId ? [{
              shippingId,
              OR: [
                { status: 'PENDING' as const },
                { status: 'PICKING' as const, lockedBy: session.userId }
              ]
            }] : [])
          ]
        },
        include: { items: { include: { product: true } } }
      });

      // Verificar si alguna tiene productos fantasma (ML-MISSING)
      const hasGhost = ordersToLock.some(o => o.items.some(i => i.product.sku.startsWith('ML-MISSING')));

      if (hasGhost) {
        // Mover todas a RESOLUTION_REQUIRED
        await prisma.order.updateMany({
          where: { id: { in: ordersToLock.map(o => o.id) } },
          data: { status: 'RESOLUTION_REQUIRED' }
        });
        return NextResponse.json({ error: 'Esta orden requiere resolución manual por parte del supervisor.' }, { status: 400 });
      }

      // Bloquear todas las órdenes del mismo envío
      await prisma.order.updateMany({
        where: { id: { in: ordersToLock.map(o => o.id) } },
        data: {
          status: 'PICKING',
          lockedBy: session.userId,
          lockExpiresAt: new Date(Date.now() + 1000 * 60 * 30) // 30 minutos
        }
      });

      await prisma.auditLog.create({
        data: {
          orderId: sourceOrder.id,
          userId: session.userId,
          action: 'PICKING_STARTED',
          metadata: { orderIds: ordersToLock.map(o => o.id) }
        }
      });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      return NextResponse.json(order);
    }

    if (action === 'PICK_ITEM') {
      const { orderItemId, orderItemIds, productId, orderId, locationId, quantityToPick, method } = body;
      
      let targetOrderItemIds: string[] = [];
      
      if (productId && orderId) {
        // Encontrar la orden origen
        const sourceOrder = await prisma.order.findUnique({
          where: { id: orderId }
        });
        if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

        // Encontrar todas las órdenes asociadas al mismo envío (si existe) que están bloqueadas por este usuario
        const orderIds = sourceOrder.shippingId
          ? (await prisma.order.findMany({
              where: { shippingId: sourceOrder.shippingId, lockedBy: session.userId },
              select: { id: true }
            })).map(o => o.id)
          : [orderId];

        // Buscar todos los OrderItems de ese producto en las órdenes del grupo
        const items = await prisma.orderItem.findMany({
          where: {
            orderId: { in: orderIds },
            productId
          },
          orderBy: { quantityTotal: 'asc' }, // Llenar primero los más chicos
        });
        const targetItem = items.find(i => i.quantityPicked < i.quantityTotal);
        targetOrderItemIds = targetItem ? [targetItem.id] : [];
      } else if (orderItemIds && Array.isArray(orderItemIds)) {
        targetOrderItemIds = orderItemIds;
      } else if (orderItemId) {
        targetOrderItemIds = [orderItemId];
      }
      
      if (targetOrderItemIds.length === 0) {
        return NextResponse.json({ error: 'No se especificaron ítems a pickear' }, { status: 400 });
      }
      
      // Realizamos el descuento físico del inventario y aumentamos lo recolectado en 1 transacción atómica
      await prisma.$transaction(async (tx) => {
        // Determinar el método de picking
        const targetItemForMethod = await tx.orderItem.findUnique({
          where: { id: targetOrderItemIds[0] },
          select: { orderId: true }
        });
        const order = await tx.order.findUnique({
          where: { id: targetItemForMethod?.orderId || orderId }
        });
        
        let newPickingMethod = method || 'MANUAL';
        if (order && order.pickingMethod && order.pickingMethod !== newPickingMethod && order.pickingMethod !== 'MIXED') {
          newPickingMethod = 'MIXED';
        }

        // 1. Actualizar ítems y método
        for (const id of targetOrderItemIds) {
          await tx.orderItem.update({
            where: { id },
            data: { quantityPicked: { increment: quantityToPick } }
          });
        }
        
        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: { pickingMethod: newPickingMethod }
          });
        }

        // 2. Descontar stock físico
        if (locationId && targetOrderItemIds.length > 0) {
          const firstItem = await tx.orderItem.findUnique({
            where: { id: targetOrderItemIds[0] },
            select: { productId: true }
          });
          if (firstItem) {
            await tx.productLocation.update({
              where: { productId_locationId: { productId: firstItem.productId, locationId } },
              data: { quantity: { decrement: quantityToPick } }
            });
          }
        }

        // Registrar el movimiento para poder revertir inventario si el
        // operario cancela una recolección incompleta.
        if (targetItemForMethod) {
          const pickedItem = await tx.orderItem.findUnique({
            where: { id: targetOrderItemIds[0] },
            select: { productId: true }
          });

          await tx.auditLog.create({
            data: {
              orderId: targetItemForMethod.orderId,
              userId: session.userId,
              action: 'PICK_ITEM',
              metadata: {
                productId: pickedItem?.productId || productId,
                locationId: locationId || null,
                quantity: quantityToPick,
                method: method || 'MANUAL'
              }
            }
          });
        }
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'COMPLETE_PICKING') {
      const sourceOrder = await prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

      const orderIds = sourceOrder.shippingId
        ? (await prisma.order.findMany({
            where: { shippingId: sourceOrder.shippingId, lockedBy: session.userId },
            select: { id: true }
          })).map(o => o.id)
        : [orderId];

      // Validación estricta: asegurar que TODAS las órdenes a completar estén 100% pickeadas
      const itemsToCheck = await prisma.orderItem.findMany({
        where: { orderId: { in: orderIds } }
      });
      const isActuallyComplete = itemsToCheck.every(i => i.quantityPicked >= i.quantityTotal);
      
      if (!isActuallyComplete) {
        return NextResponse.json(
          { error: 'No se puede completar el picking: Faltan productos por escanear.' }, 
          { status: 400 }
        );
      }

      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { 
          status: 'PACKING',
          lockedBy: null, // Liberamos el lock para que un Packer lo tome
          lockExpiresAt: null
        }
      });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      return NextResponse.json(order);
    }

    if (action === 'CANCEL_PICKING') {
      const sourceOrder = await prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
      if (sourceOrder.status !== 'PICKING' || sourceOrder.lockedBy !== session.userId) {
        return NextResponse.json({ error: 'La recolección ya no está activa para este usuario' }, { status: 409 });
      }

      const orderIds = sourceOrder.shippingId
        ? (await prisma.order.findMany({
            where: { shippingId: sourceOrder.shippingId, lockedBy: session.userId },
            select: { id: true }
          })).map(o => o.id)
        : [orderId];

      const pickingStarted = await prisma.auditLog.findFirst({
        where: {
          orderId: sourceOrder.id,
          userId: session.userId,
          action: 'PICKING_STARTED'
        },
        orderBy: { timestamp: 'desc' }
      });

      const movements = pickingStarted ? await prisma.auditLog.findMany({
        where: {
          orderId: { in: orderIds },
          userId: session.userId,
          action: 'PICK_ITEM',
          timestamp: { gte: pickingStarted.timestamp }
        }
      }) : [];

      const pickedItems = await prisma.orderItem.findMany({
        where: { orderId: { in: orderIds }, quantityPicked: { gt: 0 } },
        include: { product: { include: { locations: true } } }
      });

      const restoredByProduct = new Map<string, number>();

      await prisma.$transaction(async tx => {
        // Revertir exactamente cada descuento registrado durante esta sesión.
        for (const movement of movements) {
          const metadata = movement.metadata as Record<string, unknown> | null;
          const movementProductId = typeof metadata?.productId === 'string' ? metadata.productId : null;
          const movementLocationId = typeof metadata?.locationId === 'string' ? metadata.locationId : null;
          const movementQuantity = typeof metadata?.quantity === 'number' ? metadata.quantity : 0;

          if (movementProductId && movementLocationId && movementQuantity > 0) {
            await tx.productLocation.update({
              where: {
                productId_locationId: {
                  productId: movementProductId,
                  locationId: movementLocationId
                }
              },
              data: { quantity: { increment: movementQuantity } }
            });
            restoredByProduct.set(
              movementProductId,
              (restoredByProduct.get(movementProductId) || 0) + movementQuantity
            );
          }
        }

        // Compatibilidad con picks realizados antes de que existiera el log
        // de movimientos: devolver cualquier diferencia a su ubicación activa.
        const pickedByProduct = new Map<string, { quantity: number; locationId?: string }>();
        for (const item of pickedItems) {
          const current = pickedByProduct.get(item.productId);
          if (current) {
            current.quantity += item.quantityPicked;
          } else {
            pickedByProduct.set(item.productId, {
              quantity: item.quantityPicked,
              locationId: item.product.locations[0]?.locationId
            });
          }
        }

        for (const [pickedProductId, picked] of pickedByProduct.entries()) {
          const missingRestore = picked.quantity - (restoredByProduct.get(pickedProductId) || 0);
          if (missingRestore > 0 && picked.locationId) {
            await tx.productLocation.update({
              where: {
                productId_locationId: {
                  productId: pickedProductId,
                  locationId: picked.locationId
                }
              },
              data: { quantity: { increment: missingRestore } }
            });
          }
        }

        await tx.orderItem.updateMany({
          where: { orderId: { in: orderIds } },
          data: { quantityPicked: 0 }
        });

        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: {
            status: 'PENDING',
            lockedBy: null,
            lockExpiresAt: null,
            pickingMethod: null
          }
        });

        await tx.auditLog.create({
          data: {
            orderId: sourceOrder.id,
            userId: session.userId,
            action: 'PICKING_CANCELLED',
            metadata: {
              orderIds,
              resetItems: pickedItems.length,
              restoredUnits: pickedItems.reduce((total, item) => total + item.quantityPicked, 0)
            }
          }
        });
      });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      return NextResponse.json(order);
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    console.error('Picking Action Error:', error);
    return NextResponse.json({ error: 'Ocurrió un error o la orden ya está en proceso por otro usuario' }, { status: 500 });
  }
}
