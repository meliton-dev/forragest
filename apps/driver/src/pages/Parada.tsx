import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { FAIL_LABEL, hhmm, mxn } from '../lib/format';
import type { Route } from '../lib/types';
import { Badge, Button, Header, Icon, Kv, Notice } from '../ui/kit';
import { mapsUrl, RouteGate } from './common';

export function Parada() {
  return <RouteGate title="Parada">{(route) => <Inner route={route} />}</RouteGate>;
}

function Inner({ route }: { route: Route }) {
  const { id } = useParams();
  const nav = useNavigate();
  const stop = route.stops.find((s) => s.id === Number(id));
  if (!stop) return <Navigate to="/" replace />;
  const pending = stop.status === 'PENDIENTE';
  const canAct = pending && route.status === 'EN_CURSO';
  const tel = stop.customer.phone?.replace(/\s/g, '');

  return (
    <div className="screen">
      <Header
        title={stop.customer.name}
        sub={`Parada ${stop.sequence} de ${route.stops.length} · ETA ${stop.eta}`}
        back="/"
        right={stop.status === 'ENTREGADA' ? <Badge tone="ok">Entregada</Badge> : stop.status === 'NO_ENTREGADA' ? <Badge tone="danger">No entregada</Badge> : <Badge tone="accent">Pendiente</Badge>}
      />
      <div className="content">
        <div className="card">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Icon name="pin" size={18} color="var(--text-2)" />
            <div className="grow">
              <div className="small strong">{stop.customer.address}</div>
              {stop.customer.contact && <div className="caption muted">Contacto: {stop.customer.contact}</div>}
            </div>
          </div>
          <div className="btn-row">
            <a className="btn secondary sm" href={mapsUrl(stop.customer.address)} target="_blank" rel="noreferrer">
              <Icon name="nav" size={16} /> Navegar
            </a>
            {tel ? (
              <a className="btn secondary sm" href={`tel:${tel}`}>
                <Icon name="phone" size={16} /> Llamar
              </a>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ gap: 10 }}>
          <span className="overline">A entregar</span>
          {stop.items.map((it) => (
            <Kv key={it.id} k={`${it.quantity} × ${it.name} ${it.presentation.replace('Saco ', '')}`} v={mxn(it.total)} />
          ))}
          <hr className="divider" />
          <Kv k="Condición de pago" v={stop.paymentTerms} />
          <Kv k={stop.paymentTerms === 'Contado' ? 'Por cobrar al entregar' : 'Total de la entrega'} v={mxn(stop.total)} tone={stop.paymentTerms === 'Contado' ? 'var(--accent-dark)' : undefined} />
        </div>

        {stop.instructions && (
          <div className="card" style={{ gap: 4 }}>
            <div className="small strong">Indicaciones del cliente</div>
            <div className="small muted2">{stop.instructions}</div>
          </div>
        )}
        {stop.status === 'ENTREGADA' && <Notice tone="ok" icon="check">Entregada a las {hhmm(stop.deliveredAt)}.</Notice>}
        {stop.status === 'NO_ENTREGADA' && <Notice tone="danger" icon="alert">No entregada: {FAIL_LABEL[stop.failReason ?? 'OTRO'] ?? stop.failReason}. El producto sigue en tu camión.</Notice>}
        {pending && route.status === 'PROGRAMADA' && (
          <Notice tone="warn" icon="truck">
            Primero <Link to="/carga" className="link">carga el camión y sal a ruta</Link> para poder entregar.
          </Notice>
        )}
      </div>
      {canAct && (
        <div className="bar">
          <Button icon="box" onClick={() => nav(`/parada/${stop.id}/entregar`)}>
            Llegué · Entregar
          </Button>
          <button className="btn ghost" style={{ color: 'var(--danger)' }} onClick={() => nav(`/parada/${stop.id}/no-entrega`)}>
            <Icon name="alert" size={15} /> No se pudo entregar
          </button>
        </div>
      )}
    </div>
  );
}
