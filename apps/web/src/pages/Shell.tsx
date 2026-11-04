import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, errMsg } from '../lib/api';
import { hhmm } from '../lib/format';
import { usePos } from '../pos-context';
import { Button, Field, Icon, Input, Modal, Notice } from '../ui/kit';

export function Shell() {
  const pos = usePos();
  const tabs: [string, string][] = [['/', 'Venta'], ['/ventas', 'Ventas del día'], ['/devoluciones', 'Devoluciones'], ['/corte', 'Corte de caja']];
  return (
    <div className="pos">
      <header className="topbar">
        <div className="brand">
          <img src="/icon.svg" alt="Forragest" width={32} height={32} style={{ borderRadius: 9 }} />
          <div>
            <div className="small strong" style={{ lineHeight: '16px' }}>Punto de venta · {pos.shift?.shift.register ?? 'Caja 1'}</div>
            <div className="caption muted">{pos.shift ? `Turno abierto ${hhmm(pos.shift.shift.openedAt)} · ${pos.user.fullName}` : pos.user.fullName}</div>
          </div>
        </div>
        <nav className="tabs">
          {tabs.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <Button size="sm" icon="logout" onClick={pos.logout}>
          Salir
        </Button>
      </header>
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
        <Input prefix="$" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus aria-label="Fondo inicial" />
      </Field>
      <Notice tone="neutral">Cuenta el efectivo con el que inicias. Al final del turno el corte lo comparará contra lo esperado.</Notice>
      {error && <Notice tone="danger" icon="alert">{error}</Notice>}
    </Modal>
  );
}
