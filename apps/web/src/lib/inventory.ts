export interface StockRow {
  id: number;
  code: string;
  name: string;
  line: string;
  lineName: string;
  unit: string;
  stock: number;
  minStock: number;
  purchasePrice: number;
  value: number;
}

export interface Movement {
  id: number;
  type: string;
  quantity: number;
  reason: string | null;
  user: string | null;
  createdAt: string;
}

export const MOVEMENT_LABEL: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_AJUSTE: 'Entrada manual',
  SALIDA_AJUSTE: 'Ajuste de salida',
  SALIDA_VENTA: 'Venta',
  SALIDA_MERMA: 'Merma',
  CONTEO: 'Conteo físico',
  SALIDA_RUTA: 'Salió a ruta',
  ENTRADA_RUTA: 'Regresó de ruta',
  ENTRADA_DEVOLUCION: 'Devolución',
};

export function stockState(r: Pick<StockRow, 'stock' | 'minStock'>): 'agotado' | 'bajo' | 'bien' {
  if (r.stock <= 0) return 'agotado';
  return r.minStock > 0 && r.stock <= r.minStock ? 'bajo' : 'bien';
}

/** Sin acentos ni mayúsculas, para buscar "maiz" y encontrar "Maíz". */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function filterStock(rows: StockRow[], f: { query: string; line: string; onlyLow: boolean }): StockRow[] {
  const q = plain(f.query.trim());
  return rows.filter((r) => (!f.line || r.line === f.line) && (!f.onlyLow || stockState(r) !== 'bien') && (!q || plain(`${r.code} ${r.name}`).includes(q)));
}
