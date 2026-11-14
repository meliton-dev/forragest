export interface GeoPoint {
  lat: number;
  lng: number;
  at: Date | string;
}

const toMs = (d: Date | string) => new Date(d).getTime();

/** Distancia en metros entre dos puntos (fórmula de haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Velocidad aproximada (km/h) entre las dos últimas ubicaciones, de la más antigua a la más reciente.
 * Devuelve null si no hay dos puntos, si están muy separados en el tiempo (señal perdida) o si el reloj va hacia atrás.
 * Por debajo de 3 km/h se considera detenido (el GPS "tiembla" aun sin moverse).
 * Por encima de maxKmh es un salto del GPS (túnel, mala señal), no una velocidad real: devuelve null.
 */
export function speedKmh(points: GeoPoint[], maxGapMs = 120_000, maxKmh = 160): number | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const dt = toMs(b.at) - toMs(a.at);
  if (dt <= 0 || dt > maxGapMs) return null;
  const kmh = (distanceM(a, b) / (dt / 1000)) * 3.6;
  if (kmh > maxKmh) return null;
  if (kmh < 3) return 0;
  return Math.round(kmh);
}
