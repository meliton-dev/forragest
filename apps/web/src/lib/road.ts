import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

export type LatLng = [number, number];

export interface RoadInfo {
  /** Puntos [lat, lng] a lo largo de las calles; mientras carga o si no hay servicio, los puntos en línea recta. */
  coords: LatLng[];
  km: number | null;
  min: number | null;
  /** road: sigue las calles · straight: línea recta (sin servicio) · loading: aún consultando */
  status: 'road' | 'straight' | 'loading';
}

interface Answer {
  coordinates: LatLng[];
  distanceKm: number | null;
  durationMin: number | null;
  source: 'road' | 'straight';
}

/** Clave estable: coordenadas a ~1 m. */
export const roadKey = (pts: LatLng[]) => pts.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(';');

// Respuestas por trayecto: las rutas por calles no cambian, así que no se repite la consulta al volver a la pantalla.
const cache = new Map<string, Answer>();
const pending = new Set<string>();

/**
 * Ruta por calles de uno o varios trayectos (cada uno pasa por sus puntos en orden).
 * Devuelve de inmediato la línea recta y la reemplaza cuando llega la ruta real; si el servicio falla se queda la recta.
 */
export function useRoadPaths(paths: Record<string, LatLng[]>, debounceMs = 500): Record<string, RoadInfo> {
  const [version, setVersion] = useState(0);
  const sig = Object.entries(paths)
    .map(([id, pts]) => `${id}=${roadKey(pts)}`)
    .join('|');

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      for (const pts of Object.values(paths)) {
        const key = roadKey(pts);
        if (pts.length < 2 || cache.has(key) || pending.has(key)) continue;
        pending.add(key);
        try {
          const r = await api<Answer>('POST', '/routes/path', { points: pts.map(([lat, lng]) => ({ lat, lng })) });
          // un fallo del servicio de rutas (línea recta) no se guarda: se vuelve a intentar la próxima vez
          if (r.source === 'road') cache.set(key, r);
          else cache.set(key, { ...r, coordinates: pts });
        } catch {
          // sin conexión o sin permiso: se queda la línea recta
        } finally {
          pending.delete(key);
        }
        if (alive) setVersion((v) => v + 1);
      }
    }, debounceMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // sig resume el contenido de paths: así no se repite la consulta aunque el objeto se cree de nuevo en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, debounceMs]);

  return useMemo(() => {
    const out: Record<string, RoadInfo> = {};
    for (const [id, pts] of Object.entries(paths)) {
      const hit = cache.get(roadKey(pts));
      out[id] = hit
        ? { coords: hit.source === 'road' ? hit.coordinates : pts, km: hit.distanceKm, min: hit.durationMin, status: hit.source }
        : { coords: pts, km: null, min: null, status: pts.length < 2 ? 'straight' : 'loading' };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, version]);
}
