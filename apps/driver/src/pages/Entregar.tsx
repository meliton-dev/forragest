import { useRef, useState } from 'react';
import { Hint } from '../ui/Hint';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { compressImage } from '../lib/image';
import { mxn } from '../lib/format';
import { deliver } from '../lib/store';
import type { Method, Route } from '../lib/types';
import { Button, Header, Icon, Input, Kv, Notice, Segmented } from '../ui/kit';
import { SignaturePad } from '../ui/SignaturePad';
import { RouteGate } from './common';

export function Entregar() {
  return <RouteGate title="Confirmar entrega">{(route) => <Inner route={route} />}</RouteGate>;
}

function Inner({ route }: { route: Route }) {
  const { id } = useParams();
  const nav = useNavigate();
  const stop = route.stops.find((s) => s.id === Number(id));
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('EFECTIVO');
  const [amount, setAmount] = useState(stop && stop.paymentTerms === 'Contado' ? String(stop.total) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  if (!stop || stop.status !== 'PENDIENTE' || route.status !== 'EN_CURSO') return <Navigate to={stop ? `/parada/${stop.id}` : '/'} replace />;

  const paid = Number(amount) || 0;
  const rest = Math.max(0, (stop.paymentTerms === 'Contado' ? stop.total : 0) - paid);
  const ready = !!signature || !!photo;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhoto(await compressImage(f));
      setError(null);
    } catch {
      setError('No se pudo procesar la fotografía. Intenta de nuevo.');
    }
  }

  function confirm() {
    if (!stop) return;
    setBusy(true);
    deliver(stop.id, { signature: signature ?? undefined, photo: photo ?? undefined, payment: paid > 0 ? { amount: paid, method } : undefined });
    nav('/', { replace: true });
  }

  return (
    <div className="screen">
      <Header title="Confirmar entrega" sub={`Parada ${stop.sequence} de ${route.stops.length} · ${stop.customer.name}`} back />
      <div className="content">
        <div className="card">
          {stop.items.map((it) => (
            <Kv key={it.id} k={`${it.quantity} × ${it.name} ${it.presentation.replace('Saco ', '')}`} v={mxn(it.total)} />
          ))}
          <div className="row caption muted">
            <Icon name="box" size={14} color="var(--text-3)" /> Se descargan {stop.items.reduce((a, i) => a + i.quantity * i.factor, 0)} kg del inventario del
            camión.
          </div>
        </div>

        <Hint id="entregar">
          Pide la <b>firma</b> del cliente o toma una <b>foto</b> como comprobante. Después de confirmar tienes 8 segundos para deshacer.
        </Hint>
        <SignaturePad onChange={setSignature} />

        <div className="row">
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
          <button type="button" className="btn secondary sm grow" onClick={() => file.current?.click()}>
            <Icon name="camera" size={17} /> {photo ? 'Cambiar fotografía' : 'Tomar fotografía'}
          </button>
          {photo && (
            <button type="button" className="link small" onClick={() => setPhoto(null)}>
              Quitar
            </button>
          )}
        </div>
        {photo && <img className="photo-prev" src={photo} alt="Fotografía de la entrega" />}

        <div className="card" style={{ gap: 12 }}>
          <span className="overline">Cobro en ruta</span>
          <div className="row">
            <div className="grow">
              <Input
                prefix="$"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0.00"
                aria-label="Monto cobrado"
              />
            </div>
            <div style={{ width: 188 }}>
              <Segmented
                value={method}
                onChange={setMethod}
                options={[
                  ['EFECTIVO', 'Efectivo'],
                  ['TRANSFERENCIA', 'Transf.'],
                ]}
              />
            </div>
          </div>
          <Kv
            k={stop.paymentTerms === 'Contado' ? 'Saldo pendiente tras el cobro' : `Venta a ${stop.paymentTerms.toLowerCase()}`}
            v={mxn(rest)}
            tone={rest > 0 ? 'var(--warn)' : 'var(--ok)'}
          />
        </div>
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
      </div>
      <div className="bar">
        <Button icon="check" disabled={!ready || busy} onClick={confirm}>
          Confirmar entrega
        </Button>
        {!ready && (
          <div className="caption muted" style={{ textAlign: 'center' }}>
            Pide la firma del cliente o toma una fotografía.
          </div>
        )}
        <button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={() => nav(`/parada/${stop.id}/no-entrega`, { replace: true })}>
          <Icon name="alert" size={15} /> Registrar no entrega
        </button>
      </div>
    </div>
  );
}
