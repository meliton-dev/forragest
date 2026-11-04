import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FAIL_LABEL } from '../lib/format';
import { compressImage } from '../lib/image';
import { failStop } from '../lib/store';
import type { FailReason, Route } from '../lib/types';
import { Button, Header, Icon, Notice, TextArea } from '../ui/kit';
import { RouteGate } from './common';

export function NoEntrega() {
  return <RouteGate title="No entrega">{(route) => <Inner route={route} />}</RouteGate>;
}

function Inner({ route }: { route: Route }) {
  const { id } = useParams();
  const nav = useNavigate();
  const stop = route.stops.find((s) => s.id === Number(id));
  const [reason, setReason] = useState<FailReason>('CLIENTE_AUSENTE');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  if (!stop || stop.status !== 'PENDIENTE') return <Navigate to={stop ? `/parada/${stop.id}` : '/'} replace />;

  return (
    <div className="screen">
      <Header title="Registrar no entrega" sub={`${stop.customer.name} · parada ${stop.sequence}`} back />
      <div className="content">
        <span className="overline">Motivo</span>
        {(Object.keys(FAIL_LABEL) as FailReason[]).map((r) => (
          <button key={r} className={`radio ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>
            <span className="r" />
            <span className={reason === r ? 'title' : ''}>{FAIL_LABEL[r]}</span>
          </button>
        ))}
        <TextArea placeholder="Observaciones (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        <input
          ref={file}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(await compressImage(f));
          }}
        />
        <button type="button" className="btn secondary sm" onClick={() => file.current?.click()}>
          <Icon name="camera" size={17} /> {photo ? 'Fotografía adjunta ✓' : 'Adjuntar fotografía (opcional)'}
        </button>
        <Notice tone="info">El producto permanece en tu camión como inventario en tránsito y regresa al almacén al cerrar la ruta.</Notice>
      </div>
      <div className="bar">
        <Button
          variant="danger"
          icon="alert"
          onClick={() => {
            failStop(stop.id, { reason, notes: notes.trim() || undefined, photo: photo ?? undefined });
            nav('/', { replace: true });
          }}
        >
          Registrar no entrega
        </Button>
        <button className="btn ghost" onClick={() => nav(-1)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
