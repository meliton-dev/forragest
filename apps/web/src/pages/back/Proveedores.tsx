import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import type { PurchaseOptions, Supplier } from '../../lib/compras-types';
import { Badge, Button, Empty, Field, Input, Modal, Notice } from '../../ui/kit';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const blank = { name: '', rfc: '', contact: '', phone: '', email: '', address: '', paymentDays: '0', lineIds: [] as number[], active: true };

export function Proveedores() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [lines, setLines] = useState<PurchaseOptions['lines']>([]);
  const [editing, setEditing] = useState<{ id: number | null; form: typeof blank } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api<Supplier[]>('GET', '/purchasing/suppliers'), api<PurchaseOptions>('GET', '/purchasing/options')]);
      setSuppliers(s);
      setLines(o.lines);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const open = (s?: Supplier) =>
    setEditing(
      s
        ? {
            id: s.id,
            form: {
              name: s.name,
              rfc: s.rfc ?? '',
              contact: s.contact ?? '',
              phone: s.phone ?? '',
              email: s.email ?? '',
              address: s.address ?? '',
              paymentDays: String(s.paymentDays),
              lineIds: s.lines.map((l) => l.id),
              active: s.active,
            },
          }
        : { id: null, form: blank },
    );

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Proveedores</h1>
          <div className="small muted">Datos de contacto, condiciones de pago y líneas que surten.</div>
        </div>
        <Button variant="primary" icon="plus" onClick={() => open()}>
          Nuevo proveedor
        </Button>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th style={{ width: 150 }}>RFC</th>
              <th>Contacto</th>
              <th style={{ width: 130 }}>Condición de pago</th>
              <th>Líneas</th>
              <th style={{ width: 90 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(suppliers ?? []).map((s) => (
              <tr key={s.id} className="click" onClick={() => open(s)}>
                <td className="strong">{s.name}</td>
                <td className="muted">{s.rfc ?? '—'}</td>
                <td>
                  {s.contact ?? '—'}
                  <div className="caption muted">{[s.phone, s.email].filter(Boolean).join(' · ')}</div>
                </td>
                <td>{s.paymentDays === 0 ? 'Contado' : `Crédito ${s.paymentDays} días`}</td>
                <td>{s.lines.map((l) => l.name).join(', ') || '—'}</td>
                <td>
                  <Badge tone={s.active ? 'ok' : 'neutral'} dot>
                    {s.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {suppliers && suppliers.length === 0 && (
          <Empty icon="truck" title="Sin proveedores">
            Registra el primero con «Nuevo proveedor».
          </Empty>
        )}
      </div>
      {editing && (
        <SupplierForm
          id={editing.id}
          initial={editing.form}
          lines={lines}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function SupplierForm({
  id,
  initial,
  lines,
  onClose,
  onSaved,
}: {
  id: number | null;
  initial: typeof blank;
  lines: PurchaseOptions['lines'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.name.trim()) return setError('Escribe el nombre del proveedor');
    if (f.rfc.trim() && !RFC.test(f.rfc.trim())) return setError('El RFC no tiene un formato válido (12 o 13 caracteres)');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError('El correo no es válido');
    const days = Number(f.paymentDays);
    if (!Number.isInteger(days) || days < 0) return setError('Los días de crédito deben ser un número entero (0 = contado)');
    setBusy(true);
    try {
      await api('POST', id ? `/purchasing/suppliers/${id}` : '/purchasing/suppliers', { ...f, paymentDays: days });
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={id ? 'Editar proveedor' : 'Nuevo proveedor'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={busy} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <Field label="Nombre o razón social">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <div className="row gap12">
          <div className="grow">
            <Field label="RFC">
              <Input value={f.rfc} onChange={(e) => set('rfc', e.target.value.toUpperCase())} maxLength={13} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Días de crédito (0 = contado)">
              <Input inputMode="numeric" value={f.paymentDays} onChange={(e) => set('paymentDays', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
        </div>
        <div className="row gap12">
          <div className="grow">
            <Field label="Contacto">
              <Input value={f.contact} onChange={(e) => set('contact', e.target.value)} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Teléfono">
              <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="Correo">
          <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Dirección">
          <Input value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <div className="col gap8">
          <span className="small strong">Líneas que surte</span>
          <div className="row gap12" style={{ flexWrap: 'wrap' }}>
            {lines.map((l) => (
              <label key={l.id} className="row gap8 small">
                <input
                  type="checkbox"
                  checked={f.lineIds.includes(l.id)}
                  onChange={(e) => set('lineIds', e.target.checked ? [...f.lineIds, l.id] : f.lineIds.filter((x) => x !== l.id))}
                />
                {l.name}
              </label>
            ))}
          </div>
        </div>
        {id && (
          <label className="row gap8 small">
            <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
            Proveedor activo (los inactivos no aparecen al crear órdenes)
          </label>
        )}
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}
