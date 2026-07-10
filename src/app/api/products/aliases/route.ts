import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { productId, alias } = await req.json();

    if (!productId || !alias) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // Obtener el producto actual
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { mlAliases: true }
    });

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Filtrar el alias a eliminar (con trim para evitar errores de espacios)
    const targetAlias = alias.trim();
    const updatedAliases = product.mlAliases.filter(a => a.trim() !== targetAlias);

    // Actualizar el producto con el nuevo array de aliases
    await prisma.product.update({
      where: { id: productId },
      data: { 
        mlAliases: {
          set: updatedAliases // Usamos 'set' para asegurar el reemplazo total
        }
      }
    });

    // Encontrar órdenes PENDING que usen este producto y revertirlas
    // Esto es necesario porque el gateway ya no las retorna para re-sincronización
    const affectedOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        items: {
          some: { productId }
        }
      },
      select: { id: true }
    });

    if (affectedOrders.length > 0) {
      await prisma.order.updateMany({
        where: {
          id: { in: affectedOrders.map(o => o.id) }
        },
        data: { status: 'RESOLUTION_REQUIRED' }
      });
    }

    return NextResponse.json({ 
      success: true,
      affectedOrders: affectedOrders.length,
      message: `Vínculo eliminado. ${affectedOrders.length} órdenes movidas a resolución.`
    });
  } catch (error) {
    console.error('Error deleting alias:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
