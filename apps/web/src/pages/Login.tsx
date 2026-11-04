import { useState } from 'react';
import { api, setSession, type SessionUser } from '../lib/api';
import { ApiError, NetworkError } from '../lib/errors';
import { Button, Field, Input, Notice } from '../ui/kit';

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { username: username.trim(), password });
      if (!['CAJERO', 'ADMINISTRADOR', 'SUPERVISOR_RUTAS'].includes(res.user.role)) {
        setError('Tu perfil no tiene acceso a esta aplicación.');
        return;
      }
      setSession(res.accessToken, res.user);
      onDone();
    } catch (err) {
      if (err instanceof NetworkError) setError('No hay conexión con el servidor. Intenta de nuevo.');
      else if (err instanceof ApiError && err.status === 401) setError('Usuario o contraseña incorrectos.');
      else setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="row">
          <img src="/icon.svg" alt="" width={36} height={36} style={{ borderRadius: 10 }} />
          <span className="h2">Forragest</span>
        </div>
        <div>
          <h1 className="h1">Iniciar sesión</h1>
          <div className="small muted">Ingresa con tu usuario</div>
        </div>
        <Field label="Usuario">
          <Input icon="user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej. cajero" autoCapitalize="none" autoComplete="username" required />
        </Field>
        <Field
          label="Contraseña"
          link={
            <button type="button" className="link" onClick={() => setShow(!show)}>
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          }
        >
          <Input icon="lock" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        </Field>
        {error && <Notice tone="danger" icon="alert">{error}</Notice>}
        <Button variant="primary" size="lg" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}
