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
      if (!fresh.length) return { ...r, speedKmh: l.speedKmh ?? r.speedKmh ?? null };
      const last = fresh[fresh.length - 1];
      return {
        ...r,
        lastPing: { lat: last.lat, lng: last.lng, at: last.at },
        speedKmh: l.speedKmh,
        trail: [...r.trail, ...fresh.map((p): [number, number] => [p.lat, p.lng])].slice(-120),
      };
    });
  return { routes: next, needsFull };
}

export function movement(kmh: number | null | undefined) {
  if (kmh == null) return null;
  return kmh === 0 ? 'Detenido' : `${kmh} km/h`;
}
