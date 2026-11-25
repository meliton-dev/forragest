import type { CatalogItem } from './types';

import type { RouteStatus, StopStatus } from '@forrajera/shared';
export type { RouteStatus, StopStatus };

export interface RouteRow {
  id: number;
  name: string;
  date: string;
  status: RouteStatus;
  driver: { id: number; name: string };
  vehicle: { plate: string; name: string };
  plannedDeparture: string | null;
  departedAt: string | null;
  returnedAt: string | null;
  stops: { total: number; delivered: number; failed: number; pending: number };
  collected: number;
  pendingToCollect: number;
}

export interface RouteKpis {
  routesToday: number;
  inProgress: number;
  scheduled: number;
  finished: number;
  stopsTotal: number;
  stopsDelivered: number;
  onTimePct: number | null;
  pendingToCollect: number;
  collected: number;
}

export interface StopDetail {
  id: number;
  sequence: number;
  status: StopStatus;
  eta: string | null;
  paymentTerms: string;
  instructions: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  late: boolean;
  customer: { id: number; name: string; address: string; lat: number | null; lng: number | null };
  total: number;
  collected: number;
  items: { presentation: string; quantity: number; unitPrice: number }[];
}

export interface RouteDetail extends RouteRow {
  lastPing: { lat: number; lng: number; at: string } | null;
  stopsDetail: StopDetail[];
  incidents: { id: number; type: string; description: string; createdAt: string }[];
}

export interface RouteOptions {
  drivers: { id: number; fullName: string; username: string }[];
  vehicles: { id: number; plate: string; name: string }[];
  customers: { id: number; name: string; address: string; lat: number | null; lng: number | null; creditDays: number; creditLimit: number }[];
  catalog: CatalogItem[];
}

/** Lo que la app del chofer reporta cada 30 s de su conexión (el chofer no lo ve; solo el supervisor). */
export interface DriverSync {
  /** última vez que el teléfono habló con el sistema */
  lastSeenAt: string | null;
  /** registros guardados en el teléfono que aún no llegan */
  pending: number;
  oldestPendingAt: string | null;
  /** registros que el sistema rechazó (no se reintentan) */
  rejected: number;
  gps: 'active' | 'idle' | 'denied' | 'unsupported' | 'error' | null;
}

export interface MonitorRoute extends RouteRow {
  lastPing: { lat: number; lng: number; at: string } | null;
  sync?: DriverSync;
  /** km/h entre las dos últimas ubicaciones; 0 = detenido; null = sin dato fiable */
  speedKmh?: number | null;
  trail: [number, number][];
  stopsMap: {
    id: number;
    sequence: number;
    status: StopStatus;
    eta: string | null;
    arrivedAt: string | null;
    deliveredAt: string | null;
    customer: { name: string; address: string; lat: number | null; lng: number | null };
  }[];
}

export interface Efficiency {
  from: string;
  to: string;
  toleranceMin: number;
  kpis: {
    stops: number;
    delivered: number;
    onTime: number;
    late: number;
    failed: number;
    onTimePct: number | null;
    latePct: number | null;
    avgMinutes: number | null;
  };
  perDay: { date: string; onTime: number; late: number; failed: number }[];
  perDriver: {
    driverId: number;
    name: string;
    routes: number;
    stops: number;
    onTime: number;
    late: number;
    failed: number;
    onTimePct: number | null;
    avgMinutes: number | null;
    collected: number;
  }[];
  reasons: Record<string, number>;
}

/** Almacén de salida (referencia para trazar las rutas en el mapa). */
export const DEPOT: [number, number] = [20.0833, -98.3631];
export { FAIL_LABEL, ROUTE_STATUS_LABEL } from '@forrajera/shared';

export interface LivePing {
  lat: number;
  lng: number;
  at: string;
}
/** Respuesta ligera de GET /routes/live: las últimas ubicaciones de cada ruta en curso. */
export interface LiveRoute {
  id: number;
  name: string;
  driver: string;
  plate: string;
  lastPing: LivePing | null;
  sync?: DriverSync;
  speedKmh: number | null;
  recent: LivePing[];
}
