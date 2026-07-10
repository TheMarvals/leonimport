import { prisma } from '@/lib/prisma';

export interface PickingItem {
  sku: string;
  name: string;
  imageUrl: string | null;
  location: {
    aisle: string;
    section: string;
    level: string;
    sequenceIndex: number;
  };
  quantity: number;
}

/**
 * PickingService — Cerebro de la ruta de serpiente (S-Shape)
 * 
 * Lógica de inversión por proximidad real:
 * - El primer pasillo siempre se recorre ascendente (de inicio a fondo).
 * - Al terminar un pasillo, se invierte el sentido para el siguiente.
 * - Si un pasillo no tiene ítems (vacío), se salta sin afectar la dirección.
 */
export class PickingService {
  static async getOptimizedPickingList(orderId: string): Promise<PickingItem[]> {
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      include: {
        product: {
          include: {
            locations: {
              include: { location: true },
              where: { location: { isActive: true } },
            },
          },
        },
      },
    });

    // 1. Aplanar datos con ubicación principal
    const flatItems: PickingItem[] = orderItems.map((item) => {
      const mainLoc = item.product.locations[0]?.location;
      return {
        sku: item.product.sku,
        name: item.product.name,
        imageUrl: item.product.imageUrl,
        location: {
          aisle: mainLoc?.aisle || 'UNKNOWN',
          section: mainLoc?.section || '0',
          level: mainLoc?.level || '0',
          sequenceIndex: mainLoc?.sequenceIndex ?? 0,
        },
        quantity: item.quantityTotal,
      };
    });

    // 2. Agrupar por pasillo (solo pasillos que realmente tienen ítems)
    const aisleMap = new Map<string, PickingItem[]>();
    for (const item of flatItems) {
      const aisle = item.location.aisle;
      if (!aisleMap.has(aisle)) aisleMap.set(aisle, []);
      aisleMap.get(aisle)!.push(item);
    }

    // Ordenar pasillos por nombre
    const sortedAisles = [...aisleMap.keys()].sort();

    // 3. Serpiente dinámica: alternar dirección en cada pasillo CON ítems
    let ascending = true;
    const optimizedList: PickingItem[] = [];

    for (const aisle of sortedAisles) {
      const items = aisleMap.get(aisle)!;

      // Ordenar por sequenceIndex en la dirección actual
      items.sort((a, b) =>
        ascending
          ? a.location.sequenceIndex - b.location.sequenceIndex
          : b.location.sequenceIndex - a.location.sequenceIndex,
      );

      optimizedList.push(...items);

      // Invertir dirección para el SIGUIENTE pasillo con ítems
      ascending = !ascending;
    }

    return optimizedList;
  }
}
