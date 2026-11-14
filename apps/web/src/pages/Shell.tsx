import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { hhmm } from '../lib/format';
import { usePos } from '../pos-context';
import { Button, Field, Icon, Input, Modal, Notice } from '../ui/kit';

/** Menú lateral del punto de venta: riel angosto con icono y nombre, como los cajeros de Square, Shopify POS o Toast. */
const NAV: [to: string, label: string, icon: string][] = [
  ['/', 'Venta', 'cash'],
  ['/ventas', 'Ventas del día', 'receipt'],
  ['/devoluciones', 'Devoluciones', 'undo'],
  ['/corte', 'Corte de caja', 'wallet'],
];

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function Shell() {
  const pos = usePos();
  const open = pos.shift?.shift;
  return (
    <div className="pos">
      <aside className="rail" aria-label="Menú del punto de venta">
        <div className="rail-brand">
          <img src="/icon.svg" alt="Forragest" width={40} height={40} />
          <span>{open?.register ?? 'Caja 1'}</span>
        </div>
        <nav className="rail-nav">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={icon} size={24} sw={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <div className={`shift-pill ${open ? 'open' : ''}`} role="status">
            <span className="dot" />
            {open ? (
              <>
                <b>Turno abierto</b>
                <span>desde {hhmm(open.openedAt)}</span>
              </>
            ) : (
              <b>Sin turno</b>
            )}
          </div>
          <div className="rail-user" title={pos.user.fullName}>
            <div className="avatar">{initialsOf(pos.user.fullName)}</div>
            <span>{pos.user.fullName.split(' ')[0]}</span>
          </div>
          <button className="rail-out" onClick={pos.logout} aria-label="Salir">
            <Icon name="logout" size={20} sw={1.8} />
            <span>Salir</span>
          </button>
        </div>
      </aside>
      <div className="pos-main">
        {pos.shift === undefined ? (
          <div className="empty" style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="refresh" size={24} color="var(--border-strong)" />
            <div className="small">Cargando turno…</div>
          </div>
        ) : pos.shift === null ? (
          <OpenShift />
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}

function OpenShift() {
  const pos = usePos();
  const [amount, setAmount] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/pos/shift/open', { openingFloat: Number(amount) || 0 });
      await pos.reloadShift();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Abrir turno de caja"
      sub={`${pos.user.fullName} · Caja 1`}
      footer={
        <Button variant="primary" icon="check" disabled={busy || amount === ''} onClick={open}>
          {busy ? 'Abriendo…' : 'Abrir turno'}
        </Button>
      }
    >
      <Field label="Fondo inicial en caja">
        <Input
          prefix="$"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          autoFocus
          aria-label="Fondo inicial"
        />
      </Field>
      <Notice tone="neutral">Cuenta el efectivo con el que inicias. Al final del turno el corte lo comparará contra lo esperado.</Notice>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
