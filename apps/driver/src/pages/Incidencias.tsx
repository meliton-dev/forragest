import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hhmm, INCIDENT_LABEL } from '../lib/format';
import { addIncident, useStore } from '../lib/store';
import type { IncidentType, Route } from '../lib/types';
import { Badge, Button, Empty, Field, Header, Icon, Notice, SyncBanner, TabBar, TextArea } from '../ui/kit';
import { RouteGate } from './common';

const TONE: Record<string, { tone: 'danger' | 'warn' | 'info'; icon: string }> = {
  CLIENTE_AUSENTE: { tone: 'danger', icon: 'alert' },
  PRODUCTO_DANADO: { tone: 'warn', icon: 'box' },
  RETRASO: { tone: 'info', icon: 'clock' },
  OTRO: { tone: 'warn', icon: 'info' },
};

export function Incidencias() {
  return (
    <RouteGate title="Incidencias" tabs>
      {(route) => <List route={route} />}
    </RouteGate>
  );
}

function List({ route }: { route: Route }) {
  const s = useStore();
  return (
    <div className="screen">
      <Header title="Incidencias" sub="Reportes de la ruta de hoy" />
      <div className="content">
        <SyncBanner />
        {s.incidents.length === 0 && <Empty icon="alert" title="Sin incidencias">Reporta aquí cualquier problema durante el reparto.</Empty>}
        {s.incidents.map((i) => {
          const t = TONE[i.type] ?? TONE.OTRO;
          return (
            <div key={i.id} className="card row-card tight" style={{ alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: `var(--${t.tone}-soft)`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                <Icon name={t.icon} size={18} color={`var(--${t.tone})`} />
              </div>
              <div className="grow col" style={{ gap: 3 }}>
                <div className="small strong">{INCIDENT_LABEL[i.type]}</div>
                <div className="caption muted">{i.description}</div>
                <div className="row gap8" style={{ paddingTop: 2 }}>
                  <span className="caption muted">{hhmm(i.createdAt)}</span>
                  <Badge tone={i.synced ? 'ok' : 'warn'}>{i.synced ? 'Enviada' : 'Por sincronizar'}</Badge>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {route.status !== 'FINALIZADA' && (
        <div className="bar" style={{ position: 'static', borderTop: 0, background: 'var(--bg)', paddingBottom: 12 }}>
          <Link to="/incidencias/nueva" className="btn secondary">
            <Icon name="plus" size={18} sw={2} /> Reportar incidencia
          </Link>
        </div>
      )}
      <TabBar />
    </div>
  );
}

export function NuevaIncidencia() {
  return <RouteGate title="Reportar incidencia">{(route) => <Form route={route} />}</RouteGate>;
}

function Form({ route }: { route: Route }) {
  const nav = useNavigate();
  const [type, setType] = useState<IncidentType>('RETRASO');
  const [text, setText] = useState('');
  const [stopId, setStopId] = useState<number | ''>('');
  return (
    <div className="screen">
      <Header title="Reportar incidencia" sub={route.name} back />
      <div className="content">
        <span className="overline">Tipo</span>
        {(Object.keys(INCIDENT_LABEL) as IncidentType[]).map((t) => (
          <button key={t} className={`radio ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
            <span className="r" />
            <span className={type === t ? 'title' : ''}>{INCIDENT_LABEL[t]}</span>
          </button>
        ))}
        <Field label="Parada relacionada (opcional)">
          <div className="input">
            <select value={stopId} onChange={(e) => setStopId(e.target.value ? Number(e.target.value) : '')} style={{ flex: 1, border: 0, background: 'none', height: '100%', fontSize: 16 }}>
              <option value="">Ninguna</option>
              {route.stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.customer.name}
                </option>
              ))}
            </select>
            <Icon name="down" size={16} color="var(--text-3)" />
          </div>
        </Field>
        <Field label="Descripción">
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="¿Qué ocurrió?" maxLength={500} />
        </Field>
        <Notice tone="info">Se guarda en tu teléfono y se envía al supervisor cuando haya conexión.</Notice>
      </div>
      <div className="bar">
        <Button
          icon="send"
          disabled={text.trim().length < 3}
          onClick={() => {
            addIncident({ type, description: text.trim(), stopId: stopId || undefined });
            nav('/incidencias', { replace: true });
          }}
        >
          Enviar incidencia
        </Button>
      </div>
    </div>
  );
}
