import { useState } from 'react';
import { NetworkError, PASSWORD_MAX_LENGTH } from '@forrajera/shared';
import { api, setSession, type SessionUser } from '../lib/api';
import { checkNewPassword } from '../lib/password';
import { Button, Field, Input, Modal, Notice } from '../ui/kit';

/** Formulario para elegir la contraseña propia: la actual, la nueva y su confirmación, con validación mientras se escribe. */
function ChangePasswordForm({
  username,
  currentLabel,
  onDone,
  onCancel,
}: {
  username: string;
  currentLabel: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checkNewPassword({ current, next, confirm, username });
  const toggle = (
    <button type="button" className="link" onClick={() => setShow(!show)}>
      {show ? 'Ocultar' : 'Mostrar'}
    </button>
  );
  const type = show ? 'text' : 'password';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!check.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/change-password', { currentPassword: current, newPassword: next });
      setSession(res.accessToken, res.user);
      onDone();
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'No hay conexión con el servidor. Intenta de nuevo.'
          : err instanceof Error
            ? err.message
            : 'No se pudo cambiar la contraseña.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="col gap12" onSubmit={submit}>
      <Field label={currentLabel} link={toggle}>
        <Input
          icon="lock"
          type={type}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          autoFocus
          required
        />
      </Field>
      <Field label="Contraseña nueva">
        <Input
          icon="lock"
          type={type}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          required
        />
      </Field>
      {check.problem && (
        <Notice tone="warn" icon="alert">
          {check.problem}
        </Notice>
      )}
      <Field label="Repite la contraseña nueva">
        <Input
          icon="lock"
          type={type}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          required
        />
      </Field>
      {check.mismatch && (
        <Notice tone="warn" icon="alert">
          Las dos contraseñas nuevas no son iguales.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" icon="alert">
          {error}
        </Notice>
      )}
      <div className="row gap8" style={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button type="button" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" icon="check" type="submit" disabled={busy || !check.ok}>
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </div>
    </form>
  );
}

/** Cambiar la contraseña cuando la persona quiere (menú lateral). */
export function ChangePasswordModal({ username, onClose }: { username: string; onClose: () => void }) {
  return (
    <Modal title="Cambiar contraseña" sub="Elige una contraseña que solo tú conozcas." onClose={onClose}>
      <ChangePasswordForm username={username} currentLabel="Contraseña actual" onDone={onClose} onCancel={onClose} />
    </Modal>
  );
}

/** Pantalla obligatoria: antes de usar el sistema hay que cambiar la contraseña que dio la administración. */
export function ForcePassword({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  return (
    <div className="login">
      <section className="login-brand">
        <div className="row gap12">
          <img src="/icon.svg" alt="" width={44} height={44} style={{ borderRadius: 6 }} />
          <div className="wordmark">
            Forragest
            <small>Sistema de la forrajera</small>
          </div>
        </div>
        <div className="col gap16">
          <p className="lema">
            Elige tu
            <br />
            <em>contraseña</em>.
          </p>
          <p className="sub">La que te dieron es temporal. Escribe una nueva que solo tú conozcas; con ella entrarás de aquí en adelante.</p>
        </div>
      </section>
      <div className="login-form">
        <div className="login-card col gap16">
          <div>
            <h1 className="h1">Elige tu contraseña</h1>
            <div className="small muted">Hola, {user.fullName}. Necesitas hacerlo una sola vez para continuar.</div>
          </div>
          <ChangePasswordForm username={user.username} currentLabel="Contraseña que te dieron" onDone={() => undefined} />
          <button type="button" className="link" style={{ alignSelf: 'center' }} onClick={onLogout}>
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
