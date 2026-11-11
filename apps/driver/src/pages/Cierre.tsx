import { Navigate, useNavigate } from 'react-router-dom';
import { hhmm, mxn, num } from '../lib/format';
import { summarize } from '../lib/logic';
import { closeRoute, useStore } from '../lib/store';
import type { Route } from '../lib/types';
import { Button, Header, Kv, Notice } from '../ui/kit';
import { RouteGate } from './common';

export function Cierre() {
  return <RouteGate title="Cerrar ruta">{(route) => <Inner route={route} />}</RouteGate>;
}

function Inner({ route }: { route: Route }) {
  const s = useStore();
  const nav = useNavigate();
  const sum = summarize(route, s.payments);
  const closed = route.status === 'FINALIZADA';
  if (route.status === 'PROGRAMADA') return <Navigate to="/" replace />;

  return (
    <div className="screen">
      <Header title={closed ? 'Ruta cerrada' : 'Cerrar ruta'} sub={route.name} back="/" />
      <div className="content">
        <div className="card" style={{ padding: 16, gap: 12 }}>
          <span className="overline">Resumen de la ruta</span>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {[
              ['Entregas', `${sum.delivered} de ${sum.total}`, ''],
              ['No entregadas', String(sum.failed), sum.failed ? 'var(--danger)' : ''],
              ['Cobrado', mxn(sum.collected), 'var(--ok)'],
            ].map(([k, v, c]) => (
              <div key={k} className="grow col" style={{ gap: 2 }}>
                <span className="caption muted">{k}</span>
                <span className="num" style={c ? { color: c } : undefined}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          <hr className="divider" />
          <Kv k="Salida del almacén" v={hhmm(route.departedAt)} />
          <Kv k="Regreso" v={closed ? hhmm(route.returnedAt) : 'Al cerrar'} />
        </div>

        {sum.pending > 0 && (
          <Notice tone="warn" icon="alert">
            Aún tienes {sum.pending} parada{sum.pending === 1 ? '' : 's'} pendiente{sum.pending === 1 ? '' : 's'}. Atiéndelas antes de cerrar la ruta.
          </Notice>
        )}

        <div className="card" style={{ gap: 10 }}>
          <span className="overline">Producto que regresa al almacén</span>
          {sum.leftover.length === 0 ? (
            <div className="small muted">Entregaste todo el producto.</div>
          ) : (
            sum.leftover.map((l) => <Kv key={l.code} k={`${num(l.quantity)} × ${l.name}`} v={l.presentation} />)
          )}
        </div>

        <div className="card" style={{ gap: 8 }}>
          <span className="overline">Efectivo a entregar</span>
          <Kv k="Cobros en efectivo" v={mxn(sum.cash)} />
          <Kv k="Transferencias (ya registradas)" v={mxn(sum.byMethod.TRANSFERENCIA ?? 0)} tone="var(--text-3)" />
        </div>

        <Notice tone="info">El almacenista confirmará la recepción; el producto en tránsito vuelve al inventario.</Notice>
        {closed && (
          <Notice tone="ok" icon="check">
            La ruta quedó cerrada
            {s.queue.some((o) => o.path.endsWith('/close')) ? ' en tu teléfono y se enviará al sistema al recuperar conexión' : ' y registrada en el sistema'}.
          </Notice>
        )}
      </div>
      {!closed && (
        <div className="bar">
          <Button
            icon="check"
            disabled={sum.pending > 0}
            onClick={() => {
              closeRoute();
              nav('/cierre', { replace: true });
            }}
          >
            Registrar regreso al almacén
          </Button>
        </div>
      )}
    </div>
  );
}
