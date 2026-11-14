import { Injectable, Logger } from '@nestjs/common';

export interface LatLng {
  lat: number;
  lng: number;
}
export interface RoadPath {
  /** [lat, lng] a lo largo de las calles, o los puntos en línea recta si no hubo servicio de rutas */
  coordinates: [number, number][];
  distanceKm: number | null;
  durationMin: number | null;
  /** road: sigue las calles · straight: líneas rectas entre paradas (sin servicio o sin respuesta) */
  source: 'road' | 'straight';
}

/** Servicio público y gratuito de rutas sobre OpenStreetMap (OSRM). Cambia con ROUTING_URL; vacío = desactivado. */
export const DEFAULT_ROUTING_URL = 'https://router.project-osrm.org';
const TIMEOUT_MS = 6000;
/** El servicio público pide no más de ~1 consulta por segundo. */
const MIN_GAP_MS = 1100;
const TTL_MS = 24 * 3600 * 1000;
const MAX_CACHE = 300;

export const straightPath = (points: LatLng[]): RoadPath => ({
  coordinates: points.map((p) => [p.lat, p.lng]),
  distanceKm: null,
  durationMin: null,
  source: 'straight',
});

/** Clave estable para la caché: coordenadas redondeadas a ~1 m. */
export const pathKey = (points: LatLng[]) => points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');

/** Convierte la respuesta de OSRM (geojson) en un RoadPath; null si no trae una ruta usable. */
export function parseOsrm(body: unknown): RoadPath | null {
  const r = (body as { code?: string; routes?: { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }[] })?.routes?.[0];
  if ((body as { code?: string })?.code !== 'Ok' || !r?.geometry?.coordinates?.length) return null;
  return {
    // OSRM entrega [lng, lat]; el mapa usa [lat, lng]
    coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceKm: r.distance != null ? Math.round(r.distance / 100) / 10 : null,
    durationMin: r.duration != null ? Math.round(r.duration / 60) : null,
    source: 'road',
  };
}

@Injectable()
export class RoadPathService {
  private readonly log = new Logger(RoadPathService.name);
  private cache = new Map<string, { at: number; path: RoadPath }>();
  private inflight = new Map<string, Promise<RoadPath>>();
  private lastCall = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** Se puede reemplazar en las pruebas; no es un parámetro del constructor porque Nest intentaría inyectarlo. */
  fetchFn: typeof fetch = (input, init) => fetch(input, init);

  private get baseUrl() {
    return process.env.ROUTING_URL === undefined ? DEFAULT_ROUTING_URL : process.env.ROUTING_URL.trim().replace(/\/+$/, '');
  }

  /** Ruta por calles pasando por los puntos en orden. Nunca falla: sin servicio devuelve líneas rectas. */
  async path(points: LatLng[]): Promise<RoadPath> {
    if (points.length < 2 || !this.baseUrl) return straightPath(points);
    const key = pathKey(points);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.path;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const job = this.fetchRoad(points, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return job;
  }

  private fetchRoad(points: LatLng[], key: string): Promise<RoadPath> {
    // las consultas salen una por una y separadas, para respetar el límite del servicio público
    const run = this.queue.then(async () => {
      const wait = this.lastCall + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      try {
        const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
        const res = await this.fetchFn(`${this.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { 'User-Agent': 'forragest-api' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const path = parseOsrm(await res.json());
        if (!path) throw new Error('sin ruta');
        this.remember(key, path);
        return path;
      } catch (e) {
        // no se guarda en caché: el siguiente intento puede funcionar
        this.log.warn(`Ruta por calles no disponible (${e instanceof Error ? e.message : e}); se usan líneas rectas`);
        return straightPath(points);
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private remember(key: string, path: RoadPath) {
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { at: Date.now(), path });
  }
}
