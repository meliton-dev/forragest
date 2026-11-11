import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapMarker {
  lat: number;
  lng: number;
  /** stop: parada numerada · truck: camión · depot: almacén */
  kind: 'stop' | 'truck' | 'depot';
  label?: string;
  tooltip?: string;
  state?: 'pending' | 'done' | 'failed';
  color?: string;
}
export interface MapLine {
  points: [number, number][];
  color: string;
  dashed?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function iconFor(m: MapMarker) {
  if (m.kind === 'truck') {
    return L.divIcon({
      className: 'map-pin-wrap',
      html: `<div class="map-truck" style="background:${m.color ?? '#0847b0'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6h13v11H1z"/><path d="M14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }
  if (m.kind === 'depot') {
    return L.divIcon({ className: 'map-pin-wrap', html: `<div class="map-depot">Almacén</div>`, iconSize: [64, 24], iconAnchor: [32, 12] });
  }
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-stop ${m.state ?? 'pending'}">${esc(m.label ?? '')}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Mapa de OpenStreetMap con paradas, camiones y recorridos. Necesita conexión para descargar el mapa base. */
export function MapView({ markers, lines, fitKey, height = 360 }: { markers: MapMarker[]; lines?: MapLine[]; fitKey: string; height?: number | string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: true, attributionControl: true }).setView([20.0833, -98.3631], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // el contenedor cambia de tamaño al cargar la página: sin esto Leaflet calcula mal el encuadre y los tiles
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const bounds: [number, number][] = [];
    for (const l of lines ?? []) {
      if (l.points.length < 2) continue;
      L.polyline(l.points, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(g);
      L.polyline(l.points, { color: l.color, weight: 4, opacity: 0.95, dashArray: l.dashed ? '2 9' : undefined, lineCap: 'round' }).addTo(g);
      bounds.push(...l.points);
    }
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], { icon: iconFor(mk), zIndexOffset: mk.kind === 'truck' ? 1000 : 0 }).addTo(g);
      if (mk.tooltip) marker.bindTooltip(esc(mk.tooltip), { direction: 'top', offset: [0, -12] });
      bounds.push([mk.lat, mk.lng]);
    }
    if (bounds.length && fitted.current !== fitKey) {
      m.invalidateSize();
      m.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 15, animate: false });
      fitted.current = fitKey;
    }
  }, [markers, lines, fitKey]);

  return <div ref={el} className="map" style={{ height }} data-testid="map" />;
}
