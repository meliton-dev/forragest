import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hhmm, METHOD_LABEL, mxn } from '../lib/format';
import { summarize } from '../lib/logic';
import { addPayment, useStore } from '../lib/store';
import type { Method, Route } from '../lib/types';
import { Badge, Button, Empty, Field, Header, Icon, Input, Kv, Notice, Segmented, SyncBanner, TabBar } from '../ui/kit';
import { RouteGate } from './common';

export function Cobros() {
  return (
    <RouteGate title="Cobros del día" tabs>
      {(route) => <List route={route} />}
    </RouteGate>
  );
}

function List({ route }: { route: Route }) {
  const s = useStore();
  const sum = summarize(route, s.payments);
  return (
    <div className="screen">
      <Header title="Cobros del día" sub={route.name} />
      <div className="content">
        <div className="card" style={{ padding: 16, gap: 10 }}>
          <span className="overline">Cobrado hoy</span>
          <div className="num-lg">{mxn(sum.collected)}</div>
          <hr className="divider" />
          <Kv k="Efectivo" v={mxn(sum.byMethod.EFECTIVO ?? 0)} />
          <Kv k="Transferencia" v={mxn(sum.byMethod.TRANSFERENCIA ?? 0)} />
          <Kv k="Por cobrar en la ruta" v={mxn(sum.pendingToCollect)} tone="var(--warn)" />
        </div>
        <SyncBanner />
        <div className="row between">
          <span className="title">Cobros registrados</span>
          <span className="small muted">{s.payments.length}</span>
        </div>
        {s.payments.length === 0 && <Empty icon="wallet" title="Aún no hay cobros" />}
        {s.payments.map((p) => (
          <div key={p.id} className="card row-card tight">
            <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center' }}>
              <Icon name="wallet" size={18} color="var(--accent)" />
            </div>
            <div className="grow">
              <div className="small strong">{p.customer}</div>
              <div className="caption muted row gap4">
                {hhmm(p.receivedAt)} · {METHOD_LABEL[p.method]}
                {!p.synced && <Badge tone="warn">Por sincronizar</Badge>}
              </div>
            </div>
            <span className="title">{mxn(p.amount)}</span>
          </div>
        ))}
      </div>
      <div className="bar" style={{ position: 'static', borderTop: 0, background: 'var(--bg)', paddingBottom: 12 }}>
        {route.status === 'EN_CURSO' && (
          <Link to="/cobros/nuevo" className="btn primary">
            <Icon name="plus" size={18} sw={2} /> Registrar cobro
          </Link>
        )}
      </div>
      <TabBar />
    </div>
  );
}

export function NuevoCobro() {
  return <RouteGate title="Registrar cobro">{(route) => <Form route={route} />}</RouteGate>;
}

function Form({ route }: { route: Route }) {
  const nav = useNavigate();
  const [stopId, setStopId] = useState<number>(route.stops.find((x) => x.status !== 'PENDIENTE')?.id ?? route.stops[0].id);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('EFECTIVO');
  const stop = route.stops.find((x) => x.id === stopId)!;
  const value = Number(amount);

  return (
    <div className="screen">
      <Header title="Registrar cobro" sub="Pago recibido de un cliente de la ruta" back />
      <div className="content">
        <Field label="Cliente">
          <div className="input">
            <select value={stopId} onChange={(e) => setStopId(Number(e.target.value))} style={{ flex: 1, border: 0, background: 'none', height: '100%', fontSize: 16 }}>
              {route.stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.customer.name}
                </option>
              ))}
            </select>
            <Icon name="down" size={16} color="var(--text-3)" />
          </div>
        </Field>
        <Field label="Monto recibido">
          <Input prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" autoFocus />
        </Field>
        <Field label="Forma de pago">
          <Segmented value={method} onChange={setMethod} options={[['EFECTIVO', 'Efectivo'], ['TRANSFERENCIA', 'Transferencia']]} />
        </Field>
        <Notice tone="info">El cobro queda guardado en tu teléfono y se envía al sistema en cuanto haya conexión.</Notice>
      </div>
      <div className="bar">
        <Button
          icon="check"
          disabled={!(value > 0)}
          onClick={() => {
            addPayment({ customerId: stop.customer.id, customerName: stop.customer.name, amount: value, method });
            nav('/cobros', { replace: true });
          }}
        >
          Guardar cobro
        </Button>
      </div>
    </div>
  );
}
