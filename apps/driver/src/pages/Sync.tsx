import { hhmm } from '../lib/format';
import { Hint } from '../ui/Hint';
import { discardOp, flush, pendingCount, useStore } from '../lib/store';
import { Badge, Button, Header, Icon, Notice } from '../ui/kit';

export function Sync() {
  const s = useStore();
  const pending = pendingCount(s);
  const failed = s.queue.filter((o) => o.failed);
  return (
    <div className="screen">
      <Header title="Sincronización" sub="Trabajo sin conexión" back="/perfil" />
      <div className="content">
        <Hint id="sync">
          Aquí ves lo que todavía no llegó al sistema. Cuando dice <b>Al día</b>, todo se envió. Con señal se envía solo.
        </Hint>
        <div className="card" style={{ padding: 16, gap: 12 }}>
          <div className="row">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: s.online ? 'var(--ok-soft)' : 'var(--warn-soft)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={s.online ? 'sync' : 'wifioff'} size={22} color={s.online ? 'var(--ok)' : 'var(--warn)'} />
            </div>
            <div className="grow">
              <div className="h2">{s.online ? 'Con conexión' : 'Sin conexión'}</div>
              <div className="caption muted">Última sincronización {s.lastSync ? hhmm(s.lastSync) : '—'}</div>
            </div>
          </div>
          <Notice tone="neutral">Tus entregas y cobros se guardan en el teléfono y se envían solos cuando recuperas señal.</Notice>
        </div>

        <div className="row between">
          <span className="title">Pendientes de enviar</span>
          <Badge tone={pending ? 'warn' : 'ok'}>{pending ? `${pending} registro${pending === 1 ? '' : 's'}` : 'Todo enviado'}</Badge>
        </div>

        {s.queue.map((o) => (
          <div key={o.id} className="card tight" style={{ gap: 6 }}>
            <div className="row">
              <div className="grow">
                <div className="small strong">{o.label}</div>
                <div className="caption muted">{hhmm(o.createdAt)}</div>
              </div>
              {o.failed ? <Badge tone="danger">Rechazado</Badge> : <Icon name="clock" size={16} color="var(--warn)" />}
            </div>
            {o.failed && (
              <>
                <div className="caption" style={{ color: 'var(--danger)' }}>
                  {o.error}
                </div>
                <button className="link danger small" style={{ textAlign: 'left' }} onClick={() => discardOp(o.id)}>
                  Descartar registro
                </button>
              </>
            )}
          </div>
        ))}
        {failed.length > 0 && (
          <Notice tone="warn" icon="alert">
            Los registros rechazados no se enviarán de nuevo. Avisa a tu supervisor si necesitas corregirlos.
          </Notice>
        )}
      </div>
      <div className="bar">
        <Button variant="secondary" icon="sync" disabled={s.syncing} onClick={() => void flush().then(() => undefined)}>
          {s.syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </Button>
      </div>
    </div>
  );
}
