import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

export interface MapMarker {
  /** Identifica al marcador entre actualizaciones: los camiones con id se mueven suavemente en vez de redibujarse. */
  id?: string;
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
      html: `<div class="map-truck" style="background:${m.color ?? '#1f4d3a'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6h13v11H1z"/><path d="M14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></div>`,
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
export function MapView({
  markers,
  lines,
  fitKey,
  height = 360,
  focus,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  fitKey: string;
  height?: number | string;
  /** Centra el mapa en un punto cada vez que cambia n (p. ej. al pulsar "Ver en el mapa"). */
  focus?: { lat: number; lng: number; n: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef<string | null>(null);
  const trucks = useRef(new Map<string, L.Marker>());
  const anim = useRef(new Map<string, number>());

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
    const animations = anim.current;
    const truckMarkers = trucks.current;
    return () => {
      ro.disconnect();
      animations.forEach((f) => cancelAnimationFrame(f));
      animations.clear();
      truckMarkers.clear();
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
    const liveIds = new Set<string>();
    for (const mk of markers) {
      bounds.push([mk.lat, mk.lng]);
      if (mk.kind === 'truck' && mk.id) {
        liveIds.add(mk.id);
        const existing = trucks.current.get(mk.id);
        if (existing) {
          existing.setIcon(iconFor(mk));
          existing.setTooltipContent(esc(mk.tooltip ?? ''));
          glide(existing, mk.id, [mk.lat, mk.lng]);
        } else {
          const marker = L.marker([mk.lat, mk.lng], { icon: iconFor(mk), zIndexOffset: 1000 }).addTo(m);
          marker.bindTooltip(esc(mk.tooltip ?? ''), { direction: 'top', offset: [0, -12] });
          trucks.current.set(mk.id, marker);
        }
        continue;
      }
      const marker = L.marker([mk.lat, mk.lng], { icon: iconFor(mk), zIndexOffset: mk.kind === 'truck' ? 1000 : 0 }).addTo(g);
      if (mk.tooltip) marker.bindTooltip(esc(mk.tooltip), { direction: 'top', offset: [0, -12] });
    }
    for (const [id, marker] of trucks.current) {
      if (liveIds.has(id)) continue;
      cancelAnimationFrame(anim.current.get(id) ?? 0);
      anim.current.delete(id);
      marker.remove();
      trucks.current.delete(id);
    }
    if (bounds.length && fitted.current !== fitKey) {
      m.invalidateSize();
      m.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 15, animate: false });
      fitted.current = fitKey;
    }
  }, [markers, lines, fitKey]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], Math.max(map.current.getZoom(), 15), { duration: 0.8 });
  }, [focus]);

  /** Desliza el camión hasta su nueva posición en ~1 s para que no "salte" cada vez que llega una ubicación. */
  function glide(marker: L.Marker, id: string, to: [number, number]) {
    cancelAnimationFrame(anim.current.get(id) ?? 0);
    const from = marker.getLatLng();
    if (Math.abs(from.lat - to[0]) < 1e-7 && Math.abs(from.lng - to[1]) < 1e-7) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 1000);
      marker.setLatLng([from.lat + (to[0] - from.lat) * k, from.lng + (to[1] - from.lng) * k]);
      if (k < 1) anim.current.set(id, requestAnimationFrame(step));
      else anim.current.delete(id);
    };
    anim.current.set(id, requestAnimationFrame(step));
  }

  return <div ref={el} className="map" style={{ height }} data-testid="map" />;
}
