import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NetworkError, PASSWORD_MAX_LENGTH } from '@forrajera/shared';
import { getUser, request, setSession, type SessionUser } from '../lib/api';
import { checkNewPassword } from '../lib/password';
import { AuthTop } from '../ui/AuthTop';
import { Button, EyeToggle, Field, Header, Input, Notice } from '../ui/kit';

const NEEDS_SIGNAL = 'Necesitas conexión a internet para cambiar la contraseña. Busca señal e inténtalo de nuevo.';

/** Formulario de contraseña propia: la actual, la nueva y su confirmación, con validación mientras se escribe. Necesita conexión. */
function PasswordForm({ username, currentLabel, onDone }: { username: string; currentLabel: string; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checkNewPassword({ current, next, confirm, username });
  const type = show ? 'text' : 'password';
  const eye = <EyeToggle shown={show} onToggle={() => setShow(!show)} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!check.ok) return;
    if (!navigator.onLine) return setError(NEEDS_SIGNAL);
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ accessToken: string; user: SessionUser }>('POST', '/auth/change-password', { currentPassword: current, newPassword: next });
      setSession(res.accessToken, res.user);
      onDone();
    } catch (err) {
      setError(err instanceof NetworkError ? NEEDS_SIGNAL : err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="col" style={{ gap: 16 }} onSubmit={submit}>
      <Field label={currentLabel}>
        <Input
          icon="lock"
          type={type}
          suffix={eye}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          maxLength={PASSWORD_MAX_LENGTH}
          required
        />
      </Field>
      <Field label="Contraseña nueva">
        <Input
          icon="lock"
          type={type}
          suffix={eye}
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
          suffix={eye}
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
      <Button type="submit" loading={busy} disabled={!check.ok}>
        {busy ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}

/** Pantalla obligatoria después de entrar con la contraseña temporal. No se manda nada pendiente hasta terminar. */
export function ForcePassword({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  return (
    <div className="screen login auth">
      <AuthTop title="Protege tu cuenta" text="Elige una contraseña que solo tú conozcas." />
      <div className="col login-body" style={{ gap: 16 }}>
        <div className="small muted">Hola, {user.fullName}. La que te dieron es temporal: escribe una nueva que solo tú conozcas. Se hace una sola vez.</div>
        <PasswordForm username={user.username} currentLabel="Contraseña que te dieron" onDone={() => undefined} />
        <Notice tone="info">Necesitas conexión a internet para este paso. Lo que tengas guardado sin enviar se conserva.</Notice>
        <button type="button" className="link small" style={{ alignSelf: 'center' }} onClick={onLogout}>
          Salir
        </button>
      </div>
    </div>
  );
}

/** Cambiar la contraseña a voluntad (Perfil). */
export function CambiarPassword() {
  const nav = useNavigate();
  const user = getUser();
  return (
    <div className="screen">
      <Header title="Cambiar contraseña" back="/perfil" />
      <div className="content">
        <PasswordForm username={user?.username ?? ''} currentLabel="Contraseña actual" onDone={() => nav('/perfil')} />
      </div>
    </div>
  );
}
