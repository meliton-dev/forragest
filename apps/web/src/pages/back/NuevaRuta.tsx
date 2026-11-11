import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errMsg } from '../../lib/api';
import { mxn, r2 } from '../../lib/format';
import { DEPOT, type RouteDetail, type RouteOptions } from '../../lib/routes-types';
import { Badge, Button, Field, Icon, Input, Notice, Segmented, Select, TextArea } from '../../ui/kit';
import { MapView, type MapLine, type MapMarker } from '../../ui/MapView';

interface StopForm {
  uid: number;
  customerId: number | '';
  eta: string;
  paymentTerms: 'CONTADO' | 'CREDITO';
  instructions: string;
  items: { key: string; qty: number }[];
}

let uidSeq = 1;
const blankStop = (): StopForm => ({ uid: uidSeq++, customerId: '', eta: '', paymentTerms: 'CONTADO', instructions: '', items: [] });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function NuevaRuta() {
  const nav = useNavigate();
  const [opt, setOpt] = useState<RouteOptions | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [departure, setDeparture] = useState('07:50');
  const [stops, setStops] = useState<StopForm[]>([blankStop()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<RouteOptions>('GET', '/routes/options')
      .then(setOpt)
      .catch((e) => setError(errMsg(e)));
  }, []);

  const item = (key: string) => opt?.catalog.find((c) => c.key === key);
  const cust = (id: number | '') => opt?.customers.find((c) => c.id === id);
  const setStop = (uid: number, fn: (s: StopForm) => StopForm) => setStops((all) => all.map((s) => (s.uid === uid ? fn(s) : s)));
  const move = (i: number, d: number) =>
    setStops((all) => {
      const j = i + d;
      if (j < 0 || j >= all.length) return all;
      const c = [...all];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const totals = useMemo(() => {
    let units = 0,
      kg = 0,
      money = 0,
      cash = 0;
    const needKg = new Map<string, { name: string; kg: number; stock: number }>();
    for (const s of stops) {
      let sTotal = 0;
      for (const it of s.items) {
        const c = opt?.catalog.find((x) => x.key === it.key);
        if (!c) continue;
        units += it.qty;
        kg += it.qty * c.factor;
        sTotal += it.qty * c.price;
        const cur = needKg.get(String(c.productId)) ?? { name: c.name, kg: 0, stock: c.stockKg };
        cur.kg += it.qty * c.factor;
        needKg.set(String(c.productId), cur);
      }
      money += sTotal;
      if (s.paymentTerms === 'CONTADO') cash += sTotal;
    }
    return { units, kg, money: r2(money), cash: r2(cash), short: [...needKg.values()].filter((n) => n.kg > n.stock) };
  }, [stops, opt]);

  const markers: MapMarker[] = [{ lat: DEPOT[0], lng: DEPOT[1], kind: 'depot' }];
  const line: [number, number][] = [DEPOT];
  stops.forEach((s, i) => {
    const c = cust(s.customerId);
    if (c?.lat != null && c.lng != null) {
      markers.push({ lat: c.lat, lng: c.lng, kind: 'stop', label: String(i + 1), tooltip: c.name });
      line.push([c.lat, c.lng]);
    }
  });
  const lines: MapLine[] = [{ points: line, color: '#0b5fe0', dashed: true }];

  const valid =
    !!name.trim() &&
    !!driverId &&
    !!vehicleId &&
    stops.length > 0 &&
    stops.every((s) => s.customerId !== '' && s.items.length > 0 && s.items.every((i) => i.qty > 0)) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(departure);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<RouteDetail>('POST', '/routes', {
        name: name.trim(),
        date,
        driverId: Number(driverId),
        vehicleId: Number(vehicleId),
        plannedDeparture: departure,
        stops: stops.map((s) => ({
          customerId: s.customerId,
          eta: s.eta || undefined,
          paymentTerms: s.paymentTerms,
          instructions: s.instructions.trim() || undefined,
          items: s.items.map((i) => ({ productId: item(i.key)!.productId, presentationId: item(i.key)!.presentationId ?? undefined, quantity: i.qty })),
        })),
      });
      nav('/rutas', { state: { created: created.id } });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (!opt)
    return (
      <div className="empty">
        <Icon name="refresh" size={24} color="var(--border-strong)" />
        <div className="small">{error ?? 'Cargando…'}</div>
      </div>
    );

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Nueva ruta de reparto</h1>
          <div className="small muted">Define el repartidor, las paradas y los productos de cada una</div>
        </div>
        <div className="row gap8">
          <Button onClick={() => nav('/rutas')}>Cancelar</Button>
          <Button variant="primary" icon="send" disabled={!valid || busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar y asignar'}
          </Button>
        </div>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}

      <div className="split">
        <div className="grow" style={{ flex: 1 }}>
          <div className="card">
            <div className="card-h">
              <span className="title">Datos de la ruta</span>
            </div>
            <div className="card-b">
              <div className="row gap16" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <Field label="Nombre de la ruta">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ruta 03 · Centro" aria-label="Nombre de la ruta" />
                  </Field>
                </div>
                <div style={{ width: 170 }}>
                  <Field label="Fecha">
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
                  </Field>
                </div>
                <div style={{ width: 150 }}>
                  <Field label="Salida">
                    <Input type="time" value={departure} onChange={(e) => setDeparture(e.target.value)} aria-label="Hora de salida" />
                  </Field>
                </div>
              </div>
              <div className="row gap16" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <Field label="Repartidor">
                    <Select value={driverId} onChange={setDriverId}>
                      <option value="">Elige un repartidor</option>
                      {opt.drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grow">
                  <Field label="Camión">
                    <Select value={vehicleId} onChange={setVehicleId}>
                      <option value="">Elige un camión</option>
                      {opt.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plate} · {v.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="row between">
            <span className="h2">Paradas · secuencia de entrega</span>
            <Badge>
              {stops.length} parada{stops.length === 1 ? '' : 's'}
            </Badge>
          </div>
          {stops.map((s, i) => {
            const c = cust(s.customerId);
            return (
              <div key={s.uid} className="stop-card" data-testid="stop">
                <div className="stop-h">
                  <div className="stop-n">{i + 1}</div>
                  <div className="grow">
                    <Select value={s.customerId} onChange={(v) => setStop(s.uid, (x) => ({ ...x, customerId: v ? Number(v) : '', paymentTerms: 'CONTADO' }))}>
                      <option value="">Elige un cliente</option>
                      {opt.customers.map((cu) => (
                        <option key={cu.id} value={cu.id}>
                          {cu.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <button className="icon-btn" aria-label="Subir parada" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon name="arrowup" size={16} color="var(--text-2)" />
                  </button>
                  <button className="icon-btn" aria-label="Bajar parada" disabled={i === stops.length - 1} onClick={() => move(i, 1)}>
                    <Icon name="down" size={16} color="var(--text-2)" />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Quitar parada"
                    disabled={stops.length === 1}
                    onClick={() => setStops((all) => all.filter((x) => x.uid !== s.uid))}
                  >
                    <Icon name="trash" size={16} color="var(--danger)" />
                  </button>
                </div>
                <div className="card-b">
                  {c && (
                    <div className="caption muted">
                      <Icon name="pin" size={12} /> {c.address}
                      {c.lat == null ? ' · sin coordenadas (no aparecerá en el mapa)' : ''}
                    </div>
                  )}
                  <div className="row gap16" style={{ alignItems: 'flex-end' }}>
                    <div style={{ width: 160 }}>
                      <Field label="Hora estimada">
                        <Input
                          type="time"
                          value={s.eta}
                          onChange={(e) => setStop(s.uid, (x) => ({ ...x, eta: e.target.value }))}
                          aria-label={`Hora estimada parada ${i + 1}`}
                        />
                      </Field>
                    </div>
                    <div className="grow">
                      <Field label="Forma de pago">
                        <Segmented
                          soft
                          value={s.paymentTerms}
                          onChange={(v) => setStop(s.uid, (x) => ({ ...x, paymentTerms: v }))}
                          options={[
                            ['CONTADO', 'Contado'],
                            ['CREDITO', c && c.creditDays > 0 ? `Crédito ${c.creditDays} días` : 'Crédito'],
                          ]}
                        />
                      </Field>
                    </div>
                  </div>
                  {s.items.map((it, k) => {
                    const ci = item(it.key);
                    return (
                      <div key={k} className="row gap8">
                        <div className="grow">
                          <Select
                            value={it.key}
                            onChange={(v) => setStop(s.uid, (x) => ({ ...x, items: x.items.map((y, n) => (n === k ? { ...y, key: v } : y)) }))}
                          >
                            {opt.catalog.map((cc) => (
                              <option key={cc.key} value={cc.key}>
                                {cc.code} · {cc.name} · {cc.presentation} — {mxn(cc.price)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="stepper">
                          <button
                            aria-label="Quitar uno"
                            onClick={() =>
                              setStop(s.uid, (x) => ({ ...x, items: x.items.map((y, n) => (n === k ? { ...y, qty: Math.max(1, y.qty - 1) } : y)) }))
                            }
                          >
                            <Icon name="minus" size={15} color="var(--text-2)" />
                          </button>
                          <span>{it.qty}</span>
                          <button
                            aria-label="Agregar uno"
                            onClick={() => setStop(s.uid, (x) => ({ ...x, items: x.items.map((y, n) => (n === k ? { ...y, qty: y.qty + 1 } : y)) }))}
                          >
                            <Icon name="plus" size={15} color="var(--text-2)" />
                          </button>
                        </div>
                        <span className="small strong right" style={{ width: 84 }}>
                          {ci ? mxn(ci.price * it.qty) : ''}
                        </span>
                        <button
                          className="icon-btn"
                          aria-label="Quitar producto"
                          onClick={() => setStop(s.uid, (x) => ({ ...x, items: x.items.filter((_, n) => n !== k) }))}
                        >
                          <Icon name="x" size={15} color="var(--text-3)" />
                        </button>
                      </div>
                    );
                  })}
                  <div>
                    <button
                      className="link row gap4"
                      onClick={() =>
                        setStop(s.uid, (x) => ({
                          ...x,
                          items: [...x.items, { key: opt.catalog.find((cc) => cc.stockUnits > 0)?.key ?? opt.catalog[0].key, qty: 1 }],
                        }))
                      }
                    >
                      <Icon name="plus" size={14} color="var(--accent)" /> Agregar producto
                    </button>
                  </div>
                  <TextArea
                    value={s.instructions}
                    onChange={(e) => setStop(s.uid, (x) => ({ ...x, instructions: e.target.value }))}
                    placeholder="Indicaciones para el repartidor (opcional)"
                    maxLength={300}
                  />
                </div>
              </div>
            );
          })}
          <div>
            <button className="btn secondary sm" onClick={() => setStops((all) => [...all, blankStop()])}>
              <Icon name="plus" size={15} /> Agregar parada
            </button>
          </div>
        </div>

        <aside className="col gap16" style={{ width: 420, flex: 'none' }}>
          <div className="card">
            <div className="card-h">
              <span className="title">Vista previa de la ruta</span>
            </div>
            <div style={{ padding: 12 }}>
              <MapView markers={markers} lines={lines} fitKey={line.length + '-' + line.map((p) => p.join()).join('|')} height={300} />
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <span className="title">Resumen</span>
            </div>
            <div className="card-b">
              <div className="kv">
                <span className="small muted2">Paradas</span>
                <span className="small strong">{stops.length}</span>
              </div>
              <div className="kv">
                <span className="small muted2">Carga</span>
                <span className="small strong">
                  {totals.units} unidades · {totals.kg} kg
                </span>
              </div>
              <div className="kv">
                <span className="small muted2">Importe total</span>
                <span className="small strong">{mxn(totals.money)}</span>
              </div>
              <div className="kv">
                <span className="small muted2">Por cobrar al contado</span>
                <span className="small strong">{mxn(totals.cash)}</span>
              </div>
              {totals.short.length > 0 && (
                <Notice tone="warn" icon="alert">
                  Existencia insuficiente para cargar: {totals.short.map((n) => `${n.name} (hay ${n.stock} kg, necesita ${n.kg} kg)`).join('; ')}. El repartidor
                  no podrá salir hasta tener inventario.
                </Notice>
              )}
              <Notice tone="info">El repartidor verá esta ruta en su app. Al cargar el camión, el inventario sale del almacén y queda en tránsito.</Notice>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
