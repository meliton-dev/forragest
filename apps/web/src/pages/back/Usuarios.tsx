import { useCallback, useEffect, useRef, useState } from 'react';
import { ROLES, ROLE_LABEL } from '@forrajera/shared';
import { api, errMsg, getUser, setSession, type SessionUser } from '../../lib/api';
import { checkNewPassword } from '../../lib/password';
import { filterUsers, newUserProblem, sortUsers, type UserRow } from '../../lib/users';
import { Badge, Button, Empty, EyeToggle, Field, Input, Modal, Notice, Select } from '../../ui/kit';

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; user: UserRow }
  | { kind: 'password'; user: UserRow }
  | { kind: 'active'; user: UserRow }
  | { kind: 'delete'; user: UserRow };

export function Usuarios() {
  const me = getUser()!;
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // usuario recién creado: la lista baja hasta él y lo resalta un momento (va en orden alfabético, no al final)
  const [highlight, setHighlight] = useState<string | null>(null);
  const table = useRef<HTMLTableSectionElement>(null);

  const load = useCallback(async () => {
    try {
      setUsers(sortUsers(await api<UserRow[]>('GET', '/users')));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const saved = (msg: string, created?: string) => {
    setDialog(null);
    setDone(msg);
    if (created) {
      setQuery('');
      setHighlight(created);
    }
    void load();
  };

  useEffect(() => {
    if (!highlight || !users?.some((u) => u.username === highlight)) return;
    table.current?.querySelector(`[data-username="${CSS.escape(highlight)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(t);
  }, [highlight, users]);

  const shown = filterUsers(users ?? [], query);
  const inactive = (users ?? []).filter((u) => !u.active).length;

  return (
    <>
      <div className="row between">
        <div>
          <h1 className="h1">Usuarios</h1>
          <div className="small muted">Quién puede entrar al sistema y con qué perfil. Cada persona usa su propia contraseña.</div>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setDialog({ kind: 'new' })}>
          Nuevo usuario
        </Button>
      </div>
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      {done && (
        <Notice tone="ok" icon="check">
          {done}
        </Notice>
      )}
      <div className="row between gap12" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <Input
            icon="search"
            placeholder="Buscar por nombre, usuario o perfil"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar usuarios"
          />
        </div>
        {users && (
          <span className="small muted" role="status">
            {query.trim() ? `${shown.length} de ${users.length} usuarios` : `${users.length} usuario${users.length === 1 ? '' : 's'}`}
            {inactive > 0 && ` · ${inactive} inactivo${inactive === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <div className="tw">
        <table className="t users-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th style={{ width: 130 }}>Usuario</th>
              <th style={{ width: 160 }}>Perfil</th>
              <th style={{ width: 170 }}>Estado</th>
              <th style={{ width: 410 }}>Acciones</th>
            </tr>
          </thead>
          <tbody ref={table}>
            {shown.map((u) => {
              const itsMe = u.id === me.id;
              return (
                <tr key={u.id} data-username={u.username} className={u.username === highlight ? 'flash' : undefined}>
                  <td className="strong">
                    {u.fullName}
                    {itsMe && <span className="caption muted"> (tú)</span>}
                  </td>
                  <td className="muted">{u.username}</td>
                  <td>{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td>
                    <Badge tone={u.active ? 'ok' : 'neutral'} dot>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {u.mustChangePassword && <div className="caption muted">Debe elegir su contraseña</div>}
                  </td>
                  <td>
                    <div className="user-actions">
                      <Button size="sm" onClick={() => setDialog({ kind: 'edit', user: u })}>
                        Editar
                      </Button>
                      <Button size="sm" icon="lock" title="Poner una contraseña nueva" onClick={() => setDialog({ kind: 'password', user: u })}>
                        Contraseña
                      </Button>
                      {!itsMe && (
                        <Button size="sm" variant={u.active ? 'danger' : 'secondary'} onClick={() => setDialog({ kind: 'active', user: u })}>
                          {u.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                      {!itsMe && (
                        <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'delete', user: u })}>
                          Borrar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users && users.length === 0 && (
          <Empty icon="user" title="Sin usuarios">
            Crea el primero con «Nuevo usuario».
          </Empty>
        )}
        {users && users.length > 0 && shown.length === 0 && (
          <Empty icon="search" title="Nadie coincide">
            Revisa lo que escribiste en el buscador.
          </Empty>
        )}
      </div>
      {dialog?.kind === 'new' && (
        <NewUser onClose={() => setDialog(null)} onSaved={(username) => saved('Usuario creado. Entrégale su contraseña en persona.', username)} />
      )}
      {dialog?.kind === 'edit' && (
        <EditUser user={dialog.user} itsMe={dialog.user.id === me.id} onClose={() => setDialog(null)} onSaved={() => saved('Cambios guardados.')} />
      )}
      {dialog?.kind === 'password' && (
        <ResetPassword
          user={dialog.user}
          itsMe={dialog.user.id === me.id}
          onClose={() => setDialog(null)}
          onSaved={() => saved(`Contraseña de ${dialog.user.fullName} cambiada. Entrégasela en persona.`)}
        />
      )}
      {dialog?.kind === 'active' && (
        <ToggleActive
          user={dialog.user}
          onClose={() => setDialog(null)}
          onSaved={() => saved(dialog.user.active ? `${dialog.user.fullName} ya no puede entrar.` : `${dialog.user.fullName} puede entrar otra vez.`)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteUser user={dialog.user} onClose={() => setDialog(null)} onSaved={() => saved(`${dialog.user.fullName} se borró.`)} />
      )}
    </>
  );
}

const roleOptions = ROLES.map((r) => (
  <option key={r} value={r}>
    {ROLE_LABEL[r]}
  </option>
));

function useSave(onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

const ErrorNotice = ({ error }: { error: string | null }) =>
  error ? (
    <Notice tone="danger" icon="alert">
      {error}
    </Notice>
  ) : null;

/** Casilla «Pedir que la cambie al entrar» con su explicación. */
function MustChange({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="col gap8">
      <label className="row gap8 small">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        Pedir que la cambie al entrar
      </label>
      <div className="caption muted">
        Dale la contraseña en persona, no por mensaje. Con la casilla marcada, la persona elegirá la suya la primera vez que entre.
      </div>
    </div>
  );
}

function NewUser({ onClose, onSaved }: { onClose: () => void; onSaved: (username: string) => void }) {
  const [f, setF] = useState({ fullName: '', username: '', role: 'CAJERO', password: '', confirm: '', mustChange: true });
  const [show, setShow] = useState(false);
  // la API guarda el usuario en minúsculas
  const { busy, error, run } = useSave(() => onSaved(f.username.trim().toLowerCase()));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const problem = newUserProblem(f);
  const check = checkNewPassword({ current: null, next: f.password, confirm: f.confirm, username: f.username.trim() });
  const save = () =>
    run(async () => {
      await api('POST', '/users', {
        username: f.username.trim(),
        fullName: f.fullName.trim(),
        role: f.role,
        password: f.password,
        mustChangePassword: f.mustChange,
      });
    });
  return (
    <Modal
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={busy || problem !== null} onClick={save}>
            {busy ? 'Guardando…' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <Field label="Nombre completo">
          <Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus />
        </Field>
        <div className="row gap12">
          <div className="grow">
            <Field label="Usuario (para entrar)">
              <Input value={f.username} onChange={(e) => set('username', e.target.value)} autoCapitalize="none" autoComplete="off" />
            </Field>
          </div>
          <div className="grow">
            <Field label="Perfil">
              <Select value={f.role} onChange={(v) => set('role', v)}>
                {roleOptions}
              </Select>
            </Field>
          </div>
        </div>
        <Field label="Contraseña inicial">
          <Input
            type={show ? 'text' : 'password'}
            suffix={<EyeToggle shown={show} onToggle={() => setShow(!show)} />}
            value={f.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {check.problem && (
          <Notice tone="warn" icon="alert">
            {check.problem}
          </Notice>
        )}
        <Field label="Repite la contraseña">
          <Input
            type={show ? 'text' : 'password'}
            suffix={<EyeToggle shown={show} onToggle={() => setShow(!show)} />}
            value={f.confirm}
            onChange={(e) => set('confirm', e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {check.mismatch && (
          <Notice tone="warn" icon="alert">
            Las dos contraseñas no son iguales.
          </Notice>
        )}
        <MustChange value={f.mustChange} onChange={(v) => set('mustChange', v)} />
        <ErrorNotice error={error} />
      </div>
    </Modal>
  );
}

function EditUser({ user, itsMe, onClose, onSaved }: { user: UserRow; itsMe: boolean; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState(user.role);
  const { busy, error, setError, run } = useSave(onSaved);
  const save = () => {
    if (!fullName.trim()) return setError('Escribe el nombre de la persona.');
    return run(async () => {
      await api('PATCH', `/users/${user.id}`, { fullName: fullName.trim(), ...(itsMe ? {} : { role }) });
    });
  };
  return (
    <Modal
      title="Editar usuario"
      sub={`Usuario: ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <Field label="Nombre completo">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </Field>
        <Field label="Perfil">
          {itsMe ? (
            <Input value={ROLE_LABEL[user.role] ?? user.role} disabled />
          ) : (
            <Select value={role} onChange={setRole}>
              {roleOptions}
            </Select>
          )}
        </Field>
        {itsMe ? (
          <div className="caption muted">Tu propio perfil no se puede cambiar, para que no te quedes sin acceso.</div>
        ) : (
          role !== user.role && <div className="caption muted">Si cambias el perfil, la persona tendrá que entrar de nuevo.</div>
        )}
        <ErrorNotice error={error} />
      </div>
    </Modal>
  );
}

function ResetPassword({ user, itsMe, onClose, onSaved }: { user: UserRow; itsMe: boolean; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // si el administrador se cambia la propia, no tiene caso pedirse a sí mismo que la cambie otra vez
  const [mustChange, setMustChange] = useState(!itsMe);
  const [show, setShow] = useState(false);
  const { busy, error, run } = useSave(onSaved);
  const check = checkNewPassword({ current: null, next: password, confirm, username: user.username });
  const save = () =>
    run(async () => {
      const res = await api<{ accessToken?: string; user?: SessionUser } | null>('POST', `/users/${user.id}/password`, {
        password,
        mustChangePassword: mustChange,
      });
      // al cambiar la propia, la API manda un token nuevo: el anterior ya no sirve
      if (itsMe && res?.accessToken && res.user) setSession(res.accessToken, res.user);
    });
  return (
    <Modal
      title="Nueva contraseña"
      sub={`${user.fullName} · ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" disabled={busy || !check.ok} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <Notice tone="neutral">La contraseña anterior deja de servir y se cierran las sesiones abiertas de esta persona.</Notice>
        <Field label="Contraseña nueva">
          <Input
            type={show ? 'text' : 'password'}
            suffix={<EyeToggle shown={show} onToggle={() => setShow(!show)} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        {check.problem && (
          <Notice tone="warn" icon="alert">
            {check.problem}
          </Notice>
        )}
        <Field label="Repite la contraseña">
          <Input
            type={show ? 'text' : 'password'}
            suffix={<EyeToggle shown={show} onToggle={() => setShow(!show)} />}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {check.mismatch && (
          <Notice tone="warn" icon="alert">
            Las dos contraseñas no son iguales.
          </Notice>
        )}
        <MustChange value={mustChange} onChange={setMustChange} />
        <ErrorNotice error={error} />
      </div>
    </Modal>
  );
}

function ToggleActive({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useSave(onSaved);
  const off = user.active;
  return (
    <Modal
      title={off ? 'Desactivar usuario' : 'Activar usuario'}
      sub={`${user.fullName} · ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant={off ? 'danger' : 'primary'}
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('PATCH', `/users/${user.id}`, { active: !off });
              })
            }
          >
            {busy ? 'Guardando…' : off ? 'Sí, desactivar' : 'Sí, activar'}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <div className="small">
          {off
            ? `${user.fullName} ya no podrá entrar al sistema y se cerrará su sesión abierta. Su historial se conserva.`
            : `${user.fullName} podrá entrar otra vez con su contraseña actual.`}
        </div>
        <ErrorNotice error={error} />
      </div>
    </Modal>
  );
}

function DeleteUser({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useSave(onSaved);
  return (
    <Modal
      title="Borrar usuario"
      sub={`${user.fullName} · ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{error ? 'Cerrar' : 'Cancelar'}</Button>
          <Button
            variant="danger"
            disabled={busy || error !== null}
            onClick={() =>
              run(async () => {
                await api('DELETE', `/users/${user.id}`);
              })
            }
          >
            {busy ? 'Borrando…' : 'Sí, borrar'}
          </Button>
        </>
      }
    >
      <div className="col gap12">
        <div className="small">
          Se borrará a {user.fullName} para siempre; no se puede deshacer. Solo se puede borrar a quien no tiene ventas, turnos, rutas ni otros registros.
        </div>
        <ErrorNotice error={error} />
      </div>
    </Modal>
  );
}
