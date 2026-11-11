/**
 * Pruebas de integración del inventario contra PostgreSQL real (DATABASE_URL).
 * Crean su propio producto de prueba y no tocan los datos del seed.
 */
import 'dotenv/config';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma.service';

const prisma = new PrismaService();
const inventory = new InventoryService(prisma);

async function newProduct() {
  const line = await prisma.productLine.findFirstOrThrow();
  const code = `TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return prisma.product.create({ data: { code, name: code, lineId: line.id, unit: 'kg', purchasePrice: 10, salePrice: 15 } });
}

afterAll(() => prisma.$disconnect());

describe('PEPS', () => {
  it('consume primero el lote más antiguo y registra el costo de cada uno', async () => {
    const p = await newProduct();
    await inventory.addEntry({ productId: p.id, quantity: 5, unitCost: 10 });
    await inventory.addEntry({ productId: p.id, quantity: 5, unitCost: 12 });
    const consumed = await inventory.removeStock({ productId: p.id, quantity: 7, type: 'SALIDA_VENTA' });
    expect(consumed.map((c) => [c.quantity, c.unitCost])).toEqual([[5, 10], [2, 12]]);
    expect(await inventory.stockOf(p.id)).toBe(3);
  });

  it('rechaza la salida si no alcanza y no deja cambios a medias', async () => {
    const p = await newProduct();
    await inventory.addEntry({ productId: p.id, quantity: 3, unitCost: 10 });
    await expect(inventory.removeStock({ productId: p.id, quantity: 4, type: 'SALIDA_VENTA' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await inventory.stockOf(p.id)).toBe(3);
  });
});

describe('concurrencia', () => {
  it('ventas simultáneas nunca dejan existencia negativa', async () => {
    const p = await newProduct();
    await inventory.addEntry({ productId: p.id, quantity: 10, unitCost: 10 });
    // 6 ventas de 4 kg a la vez sobre 10 kg: solo caben 2.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => inventory.removeStock({ productId: p.id, quantity: 4, type: 'SALIDA_VENTA' })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await inventory.stockOf(p.id)).toBe(2);
  });

  it('dos ventas con los mismos productos en distinto orden no se bloquean entre sí', async () => {
    const a = await newProduct();
    const b = await newProduct();
    await inventory.addEntry({ productId: a.id, quantity: 100, unitCost: 10 });
    await inventory.addEntry({ productId: b.id, quantity: 100, unitCost: 10 });
    const sale = (ids: number[]) =>
      prisma.$transaction(async (tx) => {
        await inventory.lockProducts(ids, tx);
        for (const id of ids) await inventory.removeStock({ productId: id, quantity: 1, type: 'SALIDA_VENTA' }, tx);
      });
    await Promise.all(Array.from({ length: 10 }, (_, i) => sale(i % 2 ? [a.id, b.id] : [b.id, a.id])));
    expect(await inventory.stockOf(a.id)).toBe(90);
    expect(await inventory.stockOf(b.id)).toBe(90);
  });

  it('la base rechaza un lote con existencia negativa', async () => {
    const p = await newProduct();
    const lot = await inventory.addEntry({ productId: p.id, quantity: 1, unitCost: 10 });
    await expect(prisma.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: 2 } } })).rejects.toThrow();
  });
});
