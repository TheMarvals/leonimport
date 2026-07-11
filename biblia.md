# LA BIBLIA DE LEON EXPRESS (Reglas de Arquitectura e Integración)

Esta "Biblia" dicta las reglas inquebrantables para el desarrollo, modificación y mantenimiento del ecosistema de The Marvals (Leon Express / Leon Import). 

El ecosistema está conformado por tres proyectos principales que deben mantenerse independientes, pero perfectamente comunicados:

1. **LeonExpress_ml_gateway**: El middleware que habla con Mercado Libre. Extrae, transforma y expone los datos de envíos, órdenes y catálogo.
2. **Leon Express (ERP/Backend Core)**: El sistema principal de gestión, operaciones generales y facturación.
3. **Leon Import (WMS)**: El sistema de gestión de almacenes (Picking, Packing y control de inventario local en tiempo real).

---

## 🛑 REGLAS DE ORO PARA CUALQUIER IA O DESARROLLADOR 🛑

### 1. El Gateway es el Eje (No lo rompas)
El `ml-gateway` es una pieza crítica y centralizada. **Cualquier cambio en su modelo de datos o en las respuestas de sus APIs afecta simultáneamente al ERP y al WMS.**
- **NO se deben eliminar ni renombrar campos** del Gateway sin auditar primero los 3 proyectos.
- **Si se añade un campo** (por ejemplo, extraer `item_image`), el cambio debe ser retrocompatible. Si un campo nuevo falla, el JSON de respuesta debe seguir entregando la estructura base esperada.
- **Producción vs Local**: El Gateway corre en Coolify (ej. `192.168.1.250`). Modificar los archivos en la máquina local (`/Proyects/Leon_Express/...`) NO hace magia; siempre hay que considerar que hasta que no se haga deploy, los otros sistemas no verán los cambios.

### 2. Resiliencia y Autonomía (Fallo Graceful)
- **El WMS (Leon Import)** debe ser lo más autónomo posible. No puede trabarse completamente si el Gateway omite un dato.
- **Lógica de Recuperación**: Si al sincronizar falta un dato (ej. no viene la imagen), el WMS debe permitir guardarlo como nulo y actualizarlo (repararlo) reactivamente en la siguiente sincronización (`upsert` / `update`).
- **Nunca hacer peticiones cruzadas a bases de datos**: El WMS tiene su Prisma DB; el Gateway tiene su Sequelize DB. Solo se hablan por HTTP (APIs). NUNCA conectar el WMS directamente a la DB del Gateway.

### 3. El Principio de la Foto Estática (Fuente de Verdad)
- **Historial vs Catálogo**: Lo que el cliente compró en un momento exacto es inmutable. Si se guarda una orden de compra, detalles como **precios** e **imágenes de Mercado Libre en el momento de la compra** deben persistir en los registros de la orden (ej. `OrderItem.mlImageUrl`).
- No confíes en que la foto maestra del producto (catálogo) será la misma siempre. El operario de *Picking* y *Packing* necesita ver **exactamente** la foto que vio el cliente, sin importar si el catálogo cambió después.

### 4. Gestión de Errores y "Productos Fantasma"
- **SKU es Rey**: Toda la logística se basa en el SKU. 
- Si el Gateway manda una orden con un SKU que no existe en la base de datos local del WMS, el sistema **NO DEBE** explotar. Se debe crear un "Producto Fantasma" temporal (ej. `ML-MISSING-X`) para que el flujo de empaque continúe, y se debe utilizar lógica tipo `upsert` para evitar errores `P2002` (Unique Constraint) si ocurren hilos paralelos de sincronización.

### 5. Trazabilidad de Estados
- Cuando el WMS pasa una orden de `PENDING` a `PACKING` y finalmente a `SHIPPED`, debe haber claridad de qué usuario lo hizo (`lockedBy`, `packedByUserId`) y en qué estación. 
- Si un cambio en el WMS afecta el estado final de la orden en Mercado Libre, la responsabilidad de informar a ML recae sobre el Gateway. El WMS notifica al Gateway, y el Gateway a ML.

---
> **Nota para IAs**: Al recibir una petición para alterar flujos, modelos de Prisma/Sequelize o APIs, debes consultar este documento y asegurar que tu plan de acción respeta la arquitectura distribuida. No propongas soluciones rápidas en un proyecto si van a romper el contrato con los otros dos.
