import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Usuarios
  const pin1234 = await bcryptjs.hash('1234', 10);
  const pin5678 = await bcryptjs.hash('5678', 10);

  await prisma.user.upsert({
    where: { id: 'supervisor-1' },
    update: {},
    create: { id: 'supervisor-1', name: 'Supervisor', pin: pin1234, role: 'SUPERVISOR' },
  });
  await prisma.user.upsert({
    where: { id: 'picker-1' },
    update: {},
    create: { id: 'picker-1', name: 'Juan Picker', pin: pin5678, role: 'PICKER' },
  });
  await prisma.user.upsert({
    where: { id: 'packer-1' },
    update: {},
    create: { id: 'packer-1', name: 'Maria Packer', pin: pin5678, role: 'PACKER' },
  });

  // Proveedores
  const sup1 = await prisma.supplier.upsert({
    where: { id: 'sup-china-1' },
    update: {},
    create: { id: 'sup-china-1', name: 'Guangzhou Textiles Co.', contact: 'wang@gztextiles.cn', country: 'China' },
  });
  const sup2 = await prisma.supplier.upsert({
    where: { id: 'sup-chile-1' },
    update: {},
    create: { id: 'sup-chile-1', name: 'Distribuidora Santiago', contact: '+56 9 1234 5678', country: 'Chile' },
  });
  const sup3 = await prisma.supplier.upsert({
    where: { id: 'sup-turquia-1' },
    update: {},
    create: { id: 'sup-turquia-1', name: 'Istanbul Fashion Export', contact: 'info@istfashion.com', country: 'Turquía' },
  });

  // Ubicaciones
  const locations = [
    { aisle: 'A', section: '1', level: '1', sequenceIndex: 1 },
    { aisle: 'A', section: '1', level: '2', sequenceIndex: 2 },
    { aisle: 'A', section: '2', level: '1', sequenceIndex: 3 },
    { aisle: 'B', section: '1', level: '1', sequenceIndex: 4 },
    { aisle: 'B', section: '1', level: '2', sequenceIndex: 5 },
    { aisle: 'B', section: '2', level: '1', sequenceIndex: 6 },
    { aisle: 'C', section: '1', level: '1', sequenceIndex: 7 },
    { aisle: 'C', section: '2', level: '1', sequenceIndex: 8 },
  ];
  for (const loc of locations) {
    await prisma.location.upsert({
      where: { id: `loc-${loc.aisle}-${loc.section}-${loc.level}` },
      update: {},
      create: { id: `loc-${loc.aisle}-${loc.section}-${loc.level}`, ...loc },
    });
  }

  // Productos
  const products = [
    { sku: 'POL-00001', name: 'Polera Algodón Negra XL', salePrice: 12990 },
    { sku: 'POL-00002', name: 'Polera Algodón Azul M', salePrice: 11990 },
    { sku: 'JEA-00001', name: 'Jeans Slim Fit Negro 32', salePrice: 24990 },
    { sku: 'ZAP-00001', name: 'Zapatilla Running Blanca 42', salePrice: 34990 },
    { sku: 'CIN-00001', name: 'Cinturón Cuero Negro', salePrice: 8990 },
  ];
  for (const prod of products) {
    await prisma.product.upsert({
      where: { sku: prod.sku },
      update: {},
      create: { id: `prod-${prod.sku}`, ...prod },
    });
  }

  // Vincular proveedores a productos (M2M con costos)
  const links = [
    { productId: 'prod-POL-00001', supplierId: sup1.id, costPrice: 3200, isDefault: true },
    { productId: 'prod-POL-00001', supplierId: sup3.id, costPrice: 3800, isDefault: false },
    { productId: 'prod-POL-00002', supplierId: sup1.id, costPrice: 2900, isDefault: true },
    { productId: 'prod-JEA-00001', supplierId: sup3.id, costPrice: 8500, isDefault: true },
    { productId: 'prod-JEA-00001', supplierId: sup2.id, costPrice: 12000, isDefault: false },
    { productId: 'prod-ZAP-00001', supplierId: sup1.id, costPrice: 11000, isDefault: true },
    { productId: 'prod-CIN-00001', supplierId: sup2.id, costPrice: 3500, isDefault: true },
  ];
  for (const link of links) {
    await prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: link.productId, supplierId: link.supplierId } },
      update: { costPrice: link.costPrice, isDefault: link.isDefault },
      create: link,
    });
  }

  // Asignar stock a ubicaciones
  const assignments = [
    { productId: 'prod-POL-00001', locationId: 'loc-A-1-1', quantity: 50 },
    { productId: 'prod-POL-00002', locationId: 'loc-A-1-2', quantity: 30 },
    { productId: 'prod-JEA-00001', locationId: 'loc-B-1-1', quantity: 25 },
    { productId: 'prod-ZAP-00001', locationId: 'loc-B-2-1', quantity: 15 },
    { productId: 'prod-CIN-00001', locationId: 'loc-C-1-1', quantity: 100 },
  ];
  for (const a of assignments) {
    await prisma.productLocation.upsert({
      where: { productId_locationId: { productId: a.productId, locationId: a.locationId } },
      update: { quantity: a.quantity },
      create: a,
    });
  }

  console.log('✅ Seed completo');
  console.log('   Supervisor: nombre="Supervisor", PIN=1234');
  console.log('   Picker:     nombre="Juan Picker", PIN=5678');
  console.log('   Packer:     nombre="Maria Packer", PIN=5678');
  console.log('   Proveedores: Guangzhou Textiles, Distribuidora Santiago, Istanbul Fashion');
  console.log('   Productos con multi-proveedor y stock asignado');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
