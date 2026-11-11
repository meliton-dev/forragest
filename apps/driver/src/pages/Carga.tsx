import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { num } from '../lib/format';
import { startRoute } from '../lib/store';
import { Button, Header, Icon, Notice } from '../ui/kit';
import { RouteGate } from './common';

export function Carga() {
  return <RouteGate title="Cargar camión">{(route) => <Inner route={route} />}</RouteGate>;
}

function Inner({ route }: { route: import('../lib/types').Route }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = new Map<number, { code: string; name: string; presentation: string; qty: number; kg: number; lot?: string }>();
  for (const s of route.stops)
    for (const i of s.items) {
      const cur = lines.get(i.productId) ?? { code: i.code, name: i.name, presentation: i.presentation, qty: 0, kg: 0 };
      cur.qty += i.quantity;
      cur.kg += i.quantity * i.factor;
      lines.set(i.productId, cur);
    }
  const list = [...lines.entries()];
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const total = list.reduce((a, [, l]) => a + l.qty, 0);
  const kg = list.reduce((a, [, l]) => a + l.kg, 0);

  if (route.status !== 'PROGRAMADA') return <Navigate to="/" replace />;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await startRoute();
      nav('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la salida');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <Header title="Cargar camión" sub={`${route.name} · ${route.vehicle.plate}`} back="/" />
      <div className="content">
        <div className="card">
          <div className="row between">
            <span className="small strong">
              {checked.size} de {list.length} productos verificados
            </span>
            <span className="small muted">
              {num(total)} sacos · {num(kg)} kg
            </span>
          </div>
          <div className="progress">
            {list.map(([id]) => (
              <i key={id} className={checked.has(id) ? 'on' : ''} />
            ))}
          </div>
        </div>
        <span className="overline">Productos a bordo</span>
        {list.map(([id, l]) => {
          const on = checked.has(id);
          return (
            <button
              key={id}
              className="card row-card tight"
              style={{ textAlign: 'left' }}
              onClick={() => {
                const n = new Set(checked);
                if (on) n.delete(id);
                else n.add(id);
                setChecked(n);
              }}
            >
              <span className={`checkbox ${on ? 'on' : ''}`}>{on && <Icon name="check" size={15} sw={3} />}</span>
              <div className="grow">
                <div className="small strong">{l.name}</div>
                <div className="caption muted">
                  {l.presentation} · {l.code}
                </div>
              </div>
              <span className="title">× {num(l.qty)}</span>
            </button>
          );
        })}
        <Notice tone="neutral" icon="truck">
          Al confirmar, el inventario sale del almacén y queda “en tránsito” en tu camión.
        </Notice>
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
      </div>
      <div className="bar">
        <Button icon="route" disabled={busy || checked.size < list.length} onClick={confirm}>
          {busy ? 'Registrando salida…' : 'Confirmar carga y salir'}
        </Button>
      </div>
    </div>
  );
}
