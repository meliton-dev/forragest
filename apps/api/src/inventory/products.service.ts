import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { code: string; name: string; description?: string; lineCode: string; unit: string; purchasePrice: number; salePrice: number; minStock?: number }) {
    const line = await this.prisma.productLine.findUnique({ where: { code: dto.lineCode.toUpperCase() } });
    if (!line) throw new NotFoundException('Línea no encontrada');
    if (await this.prisma.product.findUnique({ where: { code: dto.code } })) throw new ConflictException('Código ya existe');
    const { lineCode: _lineCode, ...data } = dto;
    return this.prisma.product.create({ data: { ...data, lineId: line.id }, include: { line: true } });
  }

  /** POS-001: búsqueda por código, nombre o línea. */
  search(q?: string, lineCode?: string) {
    return this.prisma.product.findMany({
      where: {
        active: true,
        ...(lineCode ? { line: { code: lineCode.toUpperCase() } } : {}),
        ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { line: true, presentations: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async get(id: number) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { line: true, presentations: true } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async update(id: number, dto: Partial<{ name: string; description: string; unit: string; purchasePrice: number; salePrice: number; minStock: number; active: boolean }>) {
    await this.get(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async addPresentation(productId: number, dto: { name: string; factor: number; salePrice?: number }) {
    await this.get(productId);
    return this.prisma.presentation.create({ data: { productId, ...dto } });
  }
}
