import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

/**
 * GET: Retorna todas las órdenes en estado RESOLUTION_REQUIRED.
 */
export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const orders = await prisma.order.findMany({
      where: { status: 'RESOLUTION_REQUIRED' },
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(orders);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Resuelve ítems fantasma. Soporta dos acciones:
 * 
 * 1. VINCULAR (por defecto): Vincula un producto fantasma a uno real existente.
 * 2. CREATE_AND_RESOLVE: Crea un producto nuevo con SKU auto-generado y luego vincula.
 * 
 * En ambos casos, auto-resuelve TODOS los ítems en TODAS las órdenes que tengan 
 * un producto fantasma con el mismo nombre exacto (vinculación masiva).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { orderId, orderItemId, ghostProductId, action } = body;

    if (!orderId || !ghostProductId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    let realProductId = body.realProductId;

    // Si la acción es crear un producto nuevo, lo creamos primero
    if (action === 'CREATE_AND_RESOLVE') {
      const { customSku, brand, color, size } = body;
      if (!customSku) return NextResponse.json({ error: 'customSku es requerido' }, { status: 400 });

      const ghost = await prisma.product.findUnique({ where: { id: ghostProductId } });
      if (!ghost) return NextResponse.json({ error: 'Ghost product not found' }, { status: 404 });

      // Verificar que el SKU no exista
      const existing = await prisma.product.findUnique({ where: { sku: customSku.toUpperCase() } });
      if (existing) {
        return NextResponse.json({ error: 'Ese SKU ya existe en el inventario' }, { status: 409 });
      }

      // Crear el producto nuevo
      const newProduct = await prisma.product.create({
        data: {
          sku: customSku.toUpperCase(),
          name: ghost.name,
          brand: brand || null,
          color: color || null,
          size: size || null,
          imageUrl: ghost.imageUrl,
          mlAliases: [ghost.name], // Guardar el alias de ML inmediatamente
        }
      });

      realProductId = newProduct.id;
    }

    if (!realProductId) {
      return NextResponse.json({ error: 'realProductId is required for linking' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 0. Obtener el producto fantasma para guardar su alias y nombre
      const ghost = await tx.product.findUnique({ where: { id: ghostProductId } });
      if (!ghost) throw new Error('Ghost product not found');

      const ghostName = ghost.name.trim();
      const affectedOrderIds = new Set<string>([orderId]);

      // 1. Actualizar TODOS los OrderItems que apunten al ghost original para que apunten al producto real
      const originalGhostItems = await tx.orderItem.findMany({
        where: { productId: ghostProductId }
      });

      for (const item of originalGhostItems) {
        // Verificar si la orden ya tiene un ítem con el producto real
        const existingRealItem = await tx.orderItem.findUnique({
          where: {
            orderId_productId: {
              orderId: item.orderId,
              productId: realProductId
            }
          }
        });

        if (existingRealItem) {
          // Si ya existe, sumar cantidades y eliminar el fantasma
          await tx.orderItem.update({
            where: { id: existingRealItem.id },
            data: {
              quantityTotal: { increment: item.quantityTotal },
              quantityPicked: { increment: item.quantityPicked }
            }
          });
          await tx.orderItem.delete({
            where: { id: item.id }
          });
        } else {
          // Si no existe, simplemente actualizar el productId del fantasma
          await tx.orderItem.update({
            where: { id: item.id },
            data: { productId: realProductId }
          });
        }
        affectedOrderIds.add(item.orderId);
      }

      // 1.5 Guardar el alias en el producto real (solo si no existe ya) y actualizar imagen si falta
      const realProduct = await tx.product.findUnique({ where: { id: realProductId } });
      if (realProduct) {
        const aliasToAdd = ghost.sku.startsWith('ML-MISSING') ? ghost.name : ghost.sku;
        
        const updateData: any = {};
        
        // Agregar alias si no existe
        if (!realProduct.mlAliases.includes(aliasToAdd)) {
          updateData.mlAliases = { push: aliasToAdd };
        }

        // Si el producto real no tiene imagen, usar la de ML
        if (!realProduct.imageUrl && ghost.imageUrl) {
          updateData.imageUrl = ghost.imageUrl;
        }

        if (Object.keys(updateData).length > 0) {
          await tx.product.update({
            where: { id: realProductId },
            data: updateData
          });
        }
      }

      // ============================================================
      // 2. VINCULACIÓN MASIVA: buscar TODOS los OrderItems en TODAS 
      //    las órdenes que apunten a OTROS productos fantasma con el MISMO 
      //    nombre exacto y re-vincularlos automáticamente.
      // ============================================================
      const allSameNameGhosts = await tx.product.findMany({
        where: {
          sku: { startsWith: 'ML-MISSING' },
          name: ghostName,
          id: { not: ghostProductId }  // excluir el que ya resolvimos
        }
      });

      for (const otherGhost of allSameNameGhosts) {
        // Buscar todos los OrderItems que apuntan a este fantasma hermano
        const siblingItems = await tx.orderItem.findMany({
          where: { productId: otherGhost.id }
        });

        // Re-vincular cada uno al producto real
        for (const sibling of siblingItems) {
          const existingRealSibling = await tx.orderItem.findUnique({
            where: {
              orderId_productId: {
                orderId: sibling.orderId,
                productId: realProductId
              }
            }
          });

          if (existingRealSibling) {
            await tx.orderItem.update({
              where: { id: existingRealSibling.id },
              data: {
                quantityTotal: { increment: sibling.quantityTotal },
                quantityPicked: { increment: sibling.quantityPicked }
              }
            });
            await tx.orderItem.delete({
              where: { id: sibling.id }
            });
          } else {
            await tx.orderItem.update({
              where: { id: sibling.id },
              data: { productId: realProductId }
            });
          }
          affectedOrderIds.add(sibling.orderId);
        }

        // Eliminar el fantasma hermano incondicionalmente, ya que movimos todos sus items
        await tx.product.delete({ where: { id: otherGhost.id } });
      }

      // 3. Eliminar el producto fantasma original, ya que movimos todos sus items en el paso 1
      if (ghost.sku.startsWith('ML-MISSING')) {
        await tx.product.delete({ where: { id: ghostProductId } });
      }

      // 4. Re-evaluar el estado de TODAS las órdenes afectadas
      let resolvedCount = 0;
      for (const affectedId of affectedOrderIds) {
        const items = await tx.orderItem.findMany({
          where: { orderId: affectedId },
          include: { product: true }
        });

        const stillNeedsResolution = items.some(item => 
          item.product.sku.startsWith('ML-MISSING')
        );

        if (!stillNeedsResolution) {
          await tx.order.update({
            where: { id: affectedId },
            data: { status: 'PENDING' }
          });
          resolvedCount++;
        }
      }

      // Retornar la orden original actualizada + stats
      const updatedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } }
      });

      return {
        order: updatedOrder,
        bulkResolved: allSameNameGhosts.length,
        ordersUnblocked: resolvedCount
      };
    }, {
      maxWait: 5000,
      timeout: 30000
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Resolution Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

