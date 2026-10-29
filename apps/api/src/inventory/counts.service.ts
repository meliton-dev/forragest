import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InventoryService } from './inventory.service';

/** INV-006: conteo cíclico con reporte de diferencias. */
@Injectable()
export class CountsService {
  constructor(private prisma: PrismaService, private inventory: InventoryService) {}

  async open(userId: number, lineCode?: string) {
    const line = lineCode ? await this.prisma.productLine.findUnique({ where: { code: lineCode.toUpperCase() } }) : null;
    if (lineCode && !line) throw new NotFoundException('Línea no encontrada');
    const stock = await this.inventory.current(line?.code);
    if (!stock.length) throw new BadRequestException('No hay productos para contar');
    return this.prisma.inventoryCount.create({
      data: {
        lineId: line?.id, createdBy: userId,
        items: { create: stock.map((p) => ({ productId: p.id, systemQty: p.stock })) },
      },
      include: { items: true },
    });
  }

  async record(countId: number, productId: number, countedQty: number) {
    const count = await this.prisma.inventoryCount.findUnique({ where: { id: countId } });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    if (count.status !== 'ABIERTO') throw new BadRequestException('El conteo está cerrado');
    const item = await this.prisma.inventoryCountItem.findUnique({ where: { countId_productId: { countId, productId } } });
    if (!item) throw new NotFoundException('Producto fuera de este conteo');
    return this.prisma.inventoryCountItem.update({ where: { id: item.id }, data: { countedQty } });
  }

  async report(countId: number) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id: countId }, include: { items: { include: { product: true } } },
    });
    if (!count) throw new NotFoundException('Conteo no encontrado');
    const items = count.items.map((i) => {
      const counted = i.countedQty === null ? null : Number(i.countedQty);
      return {
        productId: i.productId, code: i.product.code, name: i.product.name,
        systemQty: Number(i.systemQty), countedQty: counted,
        difference: counted === null ? null : +(counted - Number(i.systemQty)).toFixed(3),
      };
    });
    return { id: count.id, status: count.status, items, withDifferences: items.filter((i) => i.difference) };
  }

  /** Cierra el conteo; con apply=true ajusta el inventario a lo contado. */
  async close(countId: number, userId: number, apply: boolean) {
    const rep = await this.report(countId);
    if (rep.status !== 'ABIERTO') throw new BadRequestException('El conteo ya está cerrado');
    if (apply) {
      for (const d of rep.withDifferences) {
        // se compara contra la existencia actual para respetar movimientos hechos durante el conteo
        const current = await this.inventory.stockOf(d.productId);
        const delta = +(d.countedQty! - current).toFixed(3);
        if (delta !== 0) await this.inventory.adjust(d.productId, delta, `Conteo cíclico #${countId}`, userId);
      }
    }
    await this.prisma.inventoryCount.update({ where: { id: countId }, data: { status: 'CERRADO', closedAt: new Date() } });
    return rep;
  }
}
