export type PurchaseStatus = 'BORRADOR' | 'ENVIADA' | 'PARCIAL' | 'RECIBIDA' | 'CANCELADA';
export type PayableStatus = 'PAGADA' | 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE';

export const PURCHASE_LABEL: Record<PurchaseStatus, string> = { BORRADOR: 'Borrador', ENVIADA: 'Enviada', PARCIAL: 'Recepción parcial', RECIBIDA: 'Recibida', CANCELADA: 'Cancelada' };
export const PURCHASE_TONE = { BORRADOR: 'neutral', ENVIADA: 'info', PARCIAL: 'warn', RECIBIDA: 'ok', CANCELADA: 'danger' } as const;
export const PAYABLE_LABEL: Record<PayableStatus, string> = { PAGADA: 'Pagada', VENCIDA: 'Vencida', POR_VENCER: 'Por vencer', PENDIENTE: 'Al corriente' };
export const PAYABLE_TONE = { PAGADA: 'ok', VENCIDA: 'danger', POR_VENCER: 'warn', PENDIENTE: 'neutral' } as const;

export interface Supplier {
  id: number;
  name: string;
  rfc: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentDays: number;
  active: boolean;
  lines: { id: number; code: string; name: string }[];
}

export interface ProductOption {
  id: number;
  code: string;
  name: string;
  unit: string;
  lineId: number;
  purchasePrice: number;
  stock: number;
  minStock: number;
}

export interface PurchaseOptions {
  suppliers: Supplier[];
  lines: { id: number; code: string; name: string }[];
  products: ProductOption[];
}

export interface OrderRow {
  id: number;
  folio: string;
  status: PurchaseStatus;
  supplier: { id: number; name: string; paymentDays: number };
  createdAt: string;
  expectedAt: string | null;
  total: number;
  receivedTotal: number;
  itemCount: number;
}

export interface OrderItem {
  id: number;
  productId: number;
  code: string;
  name: string;
  unit: string;
  ordered: number;
  received: number;
  pending: number;
  unitCost: number;
  subtotal: number;
}

export interface OrderDetail extends Omit<OrderRow, 'itemCount'> {
  sentAt: string | null;
  closedAt: string | null;
  notes: string | null;
  items: OrderItem[];
  shortage: { productId: number; name: string; missing: number }[];
  receipts: { id: number; createdAt: string; notes: string | null; items: { orderItemId: number; quantity: number; note: string | null }[] }[];
  payables: { id: number; amount: number; dueDate: string; status: PayableStatus; balance: number }[];
}

export interface Suggestion {
  productId: number;
  code: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  onOrder: number;
  quantity: number;
  unitCost: number;
  supplier: { id: number; name: string } | null;
}

export interface Payable {
  id: number;
  supplierId: number;
  supplier: string;
  orderId: number;
  folio: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  status: PayableStatus;
  daysToDue: number;
}

export interface PayablesData {
  items: Payable[];
  totals: { open: number; overdue: number; dueSoon: number };
}

export interface PriceComparison {
  productId: number;
  code: string;
  product: string;
  supplierId: number;
  supplier: string;
  purchases: number;
  last: number;
  min: number;
  max: number;
  average: number;
}

export interface PriceHistory {
  rows: { date: string; folio: string; supplier: string; product: string; code: string; quantity: number; unitCost: number }[];
  comparison: PriceComparison[];
}

export interface PurchaseAlerts {
  overdue: Payable[];
  dueSoon: Payable[];
  totals: PayablesData['totals'];
  toReorder: number;
}
