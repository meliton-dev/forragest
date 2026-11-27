import { useState } from 'react';
import { api, setSession, type SessionUser } from '../lib/api';
import { ApiError, NetworkError } from '@forrajera/shared';
import { AuthLayout } from '../ui/AuthLayout';
import { Button, EyeToggle, Field, Input, Notice } from '../ui/kit';

/** Lo que dura la salida (igual que la transición `.auth.leaving` de styles.css). */
const LEAVE_MS = 320;

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // la pantalla se desvanece antes de pasar al sistema
  const [leaving, setLeaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { username: username.trim(), password });
      if (!['CAJERO', 'ADMINISTRADOR', 'SUPERVISOR_RUTAS', 'GERENTE_COMPRAS', 'ALMACENISTA'].includes(res.user.role)) {
        setError('Tu perfil no tiene acceso a esta aplicación.');
        return;
      }
      setLeaving(true);
      await new Promise((r) => setTimeout(r, LEAVE_MS));
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
    <AuthLayout
      title="Control de ventas, reparto y compras"
      text="La operación diaria de la forrajera en un solo sistema, con información al momento."
      leaving={leaving}
    >
      <form className="login-card" onSubmit={submit}>
        <div>
          <h1 className="h1">Iniciar sesión</h1>
          <div className="small muted">Ingresa con las credenciales que te asignó la administración.</div>
        </div>
        <Field label="Usuario">
          <Input
            icon="user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nombre de usuario"
            autoCapitalize="none"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Contraseña">
          <Input
            icon="lock"
            type={show ? 'text' : 'password'}
            suffix={<EyeToggle shown={show} onToggle={() => setShow(!show)} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            autoComplete="current-password"
            required
          />
        </Field>
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
        <Button variant="primary" size="lg" type="submit" disabled={busy || !username || !password}>
          {busy && <span className="auth-spin" aria-hidden />}
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
