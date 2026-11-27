import { useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { DEPOT, type RouteOptions } from '../../lib/routes-types';
import { MapView, type MapMarker } from '../../ui/MapView';
import { Button, Field, Input, Modal, Notice } from '../../ui/kit';

type Point = RouteOptions['customers'][number];

/** Alta de un punto de entrega: nombre, dirección y su ubicación tocando el mapa. */
export function NuevoPunto({ onClose, onSaved }: { onClose: () => void; onSaved: (point: Point) => void }) {
  const [f, setF] = useState({ name: '', address: '', contact: '', phone: '' });
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const ready = !!f.name.trim() && !!f.address.trim() && pos !== null;

  const markers: MapMarker[] = [{ lat: DEPOT[0], lng: DEPOT[1], kind: 'depot' }];
  if (pos) markers.push({ lat: pos[0], lng: pos[1], kind: 'stop', label: '★', tooltip: f.name.trim() || 'Punto nuevo' });

  async function save() {
    if (!pos) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<Point>('POST', '/routes/points', {
          name: f.name.trim(),
          address: f.address.trim(),
          contact: f.contact.trim() || undefined,
          phone: f.phone.trim() || undefined,
          lat: pos[0],
          lng: pos[1],
        }),
      );
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title="Nuevo punto de entrega"
      sub="Quedará guardado para esta y las siguientes rutas"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={!ready || busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar punto'}
          </Button>
        </>
      }
    >
      <div className="row gap12">
        <div className="grow">
          <Field label="Nombre del cliente o punto">
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus aria-label="Nombre del punto" />
          </Field>
        </div>
        <div className="grow">
          <Field label="Dirección o referencia">
            <Input value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={200} aria-label="Dirección" />
          </Field>
        </div>
      </div>
      <div className="row gap12">
        <div className="grow">
          <Field label="Contacto (opcional)">
            <Input value={f.contact} onChange={(e) => set('contact', e.target.value)} maxLength={120} aria-label="Contacto" />
          </Field>
        </div>
        <div className="grow">
          <Field label="Teléfono (opcional)">
            <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={30} inputMode="tel" aria-label="Teléfono" />
          </Field>
        </div>
      </div>
      {/* flex: none: el diálogo es una columna con scroll y sin esto el mapa se aplasta */}
      <div style={{ flex: 'none' }}>
        <MapView markers={markers} fitKey="nuevo-punto" height={300} onPick={(lat, lng) => setPos([lat, lng])} />
      </div>
      <div className="caption muted" role="status">
        {pos
          ? `Ubicación marcada: ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}. Toca otro lugar para moverla.`
          : 'Acerca el mapa y toca el lugar exacto de la entrega.'}
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
