import type { LiveRoute, MonitorRoute } from './routes-types';

/** Mezcla las últimas ubicaciones recibidas con el recorrido que ya se tenía (sin repetir puntos). */
export function mergeLive(routes: MonitorRoute[], live: LiveRoute[]): { routes: MonitorRoute[]; needsFull: boolean } {
  const liveIds = new Set(live.map((l) => l.id));
  const knownIds = new Set(routes.map((r) => r.id));
  // una ruta nueva o terminada cambia las paradas y los eventos: hay que pedir el detalle completo
  const needsFull = live.some((l) => !knownIds.has(l.id)) || routes.some((r) => !liveIds.has(r.id));
  const next = routes
    .filter((r) => liveIds.has(r.id))
    .map((r) => {
      const l = live.find((x) => x.id === r.id)!;
      const lastAt = r.lastPing ? new Date(r.lastPing.at).getTime() : 0;
      const fresh = l.recent.filter((p) => new Date(p.at).getTime() > lastAt);
      const sync = l.sync ?? r.sync;
      if (!fresh.length) return { ...r, sync, speedKmh: l.speedKmh ?? r.speedKmh ?? null };
      const last = fresh[fresh.length - 1];
      return {
        ...r,
        sync,
        lastPing: { lat: last.lat, lng: last.lng, at: last.at },
        speedKmh: l.speedKmh,
        trail: [...r.trail, ...fresh.map((p): [number, number] => [p.lat, p.lng])].slice(-120),
      };
    });
  return { routes: next, needsFull };
}

/** Minutos sin noticias del teléfono para considerarlo sin señal (la app avisa cada 30 s y manda ubicación cada 10 s). */
export const SIGNAL_LOST_MIN = 3;

export interface DriverStatus {
  /** el teléfono habló con el sistema hace menos de SIGNAL_LOST_MIN */
  online: boolean;
  /** último contacto del teléfono (aviso de estado o ubicación), o null si nunca llegó nada */
  lastSeen: string | null;
  /** avisos para el supervisor, en orden de importancia */
  notes: { tone: 'warn' | 'danger'; text: string }[];
}

const GPS_NOTE: Record<string, string> = {
  denied: 'GPS sin permiso en el teléfono: no se ve el camión',
  unsupported: 'El teléfono no puede compartir ubicación',
  error: 'El teléfono no obtiene señal GPS',
};

/**
 * Estado de la app del chofer para el supervisor: si su teléfono tiene señal, desde cuándo no, y si guarda registros
 * sin enviar o rechazados. El chofer no ve nada de esto.
 */
export function driverStatus(
  now: number,
  r: Pick<MonitorRoute, 'lastPing' | 'sync'>,
  hhmm: (iso: string) => string = (iso) => new Date(iso).toTimeString().slice(0, 5),
): DriverStatus {
  const seen = [r.sync?.lastSeenAt, r.lastPing?.at].filter((x): x is string => !!x).sort();
  const lastSeen = seen.length ? seen[seen.length - 1] : null;
  const online = lastSeen !== null && (now - new Date(lastSeen).getTime()) / 60000 <= SIGNAL_LOST_MIN;
  const notes: DriverStatus['notes'] = [];
  const s = r.sync;
  if (s && s.pending > 0)
    notes.push({
      tone: 'warn',
      text: `${s.pending} registro${s.pending === 1 ? '' : 's'} guardado${s.pending === 1 ? '' : 's'} en el teléfono sin enviar${
        s.oldestPendingAt ? ` desde las ${hhmm(s.oldestPendingAt)}` : ''
      }${online ? '' : ' (al último contacto)'}`,
    });
  if (s && s.rejected > 0)
    notes.push({
      tone: 'danger',
      text: `${s.rejected} registro${s.rejected === 1 ? '' : 's'} rechazado${s.rejected === 1 ? '' : 's'} por el sistema: revisa con el chofer`,
    });
  if (s?.gps && GPS_NOTE[s.gps]) notes.push({ tone: 'warn', text: GPS_NOTE[s.gps] });
  return { online, lastSeen, notes };
}

export function movement(kmh: number | null | undefined) {
  if (kmh == null) return null;
  return kmh === 0 ? 'Detenido' : `${kmh} km/h`;
}
